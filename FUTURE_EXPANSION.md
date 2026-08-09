# DIG — Capabilities and Future Expansion

Two halves. The first is an inventory: exactly what a person can do with DIG
today and what data they can see. The second is where it could go, including
designs for the three directions currently under discussion.

---

# Part 1 — What DIG does today

## Who can use it

**Guest (no account).** Gets a session id in the browser, uploads one CSV, runs
one analysis, sees charts and a PDF. Nothing persists — close the tab and it is
gone. No history, no account, no team.

**Free account.** 2 analyses per rolling 48 hours, 5 history slots, PDF report
and cleaned-CSV download. Standard model.

**Pro account — $9.99 CAD/month.** Unlimited analyses, 15 history slots, Word
and PowerPoint export on top of PDF, the full report-customization panel, teams,
and shared workspaces.

**Admin.** Everything Pro has, plus the admin dashboard.

---

## The core loop

1. **Upload a CSV.** Up to 50 MB. Dropped onto the upload card or picked from
   the file browser. The browser parses it immediately and shows the first ten
   rows and ten columns, plus row count, column count and a missing-value count
   — before anything reaches the server. The file lands in a server temp
   directory; nothing goes to permanent storage until the analysis succeeds.

2. **The assistant checks the data.** The Python service runs a quality pass and
   returns one of four verdicts:
   - `all_good` — analysis starts immediately, no question asked.
   - `not_clean` — missing values, duplicates, constant columns, mixed-type
     columns or extreme outliers. The assistant offers to clean it.
   - `low_accuracy` — usable but thin. The assistant asks whether to proceed.
   - `not_workable` — fewer than 10 rows, fewer than 2 columns, duplicate
     headers, or an entirely empty column. Rejected with a reason.

3. **You answer yes or no.** Yes to cleaning runs the cleaner: drops
   irrelevant columns the model identified, coerces mostly-numeric text columns,
   removes empty and duplicate rows, imputes what remains (median for numeric,
   mode for categorical), caps extreme outliers, drops zero-variance columns.
   The cleaned CSV becomes a separate download — the original is never
   overwritten.

4. **The pipeline runs.** Domain classification, statistical engine, insight
   generation, chart selection, report rendering. Status streams back live, so
   you can leave the page and come back.

5. **You get the outputs.** A PDF report, up to five charts with captions, the
   cleaned CSV, the original CSV, and on Pro a Word document and a PowerPoint
   deck.

---

## Report customization (Pro)

Set before the analysis runs; every option changes the prompt sent to the
insight model rather than post-processing the output.

| Control | Options |
|---|---|
| Language | English, French, Spanish, German, Chinese, Arabic, Portuguese, Persian |
| Tone | Professional, technical, casual, storytelling, academic, simplified |
| Insight count | 3, 5, or 7 |
| Occasion | General, investor, academic, internal, client |
| Audience | General, executive, technical, client, student |
| Depth | Quick, standard, deep |
| Focus areas | Free text — "focus on revenue vs cost" |
| Comparisons | Free text — "compare Q1 vs Q2" |
| Must-mention | Specific columns or topics that have to appear |
| Chart style | Mixed, bar-heavy, trend, distribution, comparison |
| Methodology section | On / off |
| Confidence scores | On / off |
| Output formats | PDF always; Word and PowerPoint on request |

---

## History

The last 5 (free) or 15 (pro) analyses. Each entry shows the file name, shape,
completion date and which outputs exist. Click to load it back into the
dashboard — charts, report and downloads all repopulate. Delete removes the row
and its stored files.

---

## Teams and shared workspaces (Pro)

Create a team, invite by email, assign roles (owner, admin, member). Share an
analysis with a team and it becomes a **workspace**.

Inside a workspace:

- **Per-file permissions.** Each of the six file kinds — PDF, Word, PowerPoint,
  cleaned CSV, original CSV, charts — is independently set to none, view or
  edit, per person. Someone can read the summary deck without being able to
  download the underlying data.
- **Threaded annotations.** Comment on a specific file, reply, edit your own,
  resolve a thread, delete. Everything appears on collaborators' screens
  immediately.
- **Live presence.** Avatars of who is in the workspace, and their cursors
  moving across the file you are both looking at, each in their own colour.

---

## Account

Email and password sign-up with verification. Password reset. Email change with
re-verification. Phone number with OTP. Profile picture. Display name. Interface
language and a brightness slider that runs the whole theme from dark to light.
Email and report-ready notification toggles. Account deletion, which removes the
stored files too.

---

## Billing

Stripe Checkout for the upgrade, Stripe Billing Portal for card changes and
cancellation, webhooks to keep plan state in sync. No card details ever touch
the DIG server — Stripe holds all of it.

---

## Admin

User list with search and plan filter, plan overrides, user deletion, and
aggregate counts.

---

# Part 2 — Where it could go

## A. Column-aware cleaning with a domain pass

**The current gap.** Cleaning is generic. Median-impute the numerics,
mode-impute the categoricals, cap anything past 3×IQR. It has no idea what the
columns *mean*, so it will happily impute a median into a patient-ID column,
treat a legitimate outlier as noise, or cap a genuine spike in a fraud dataset —
which is the exact row you most wanted to keep.

**The proposal.** Insert a per-column reasoning stage before any transformation.

**Stage 1 — profile every column locally.** No model involved, all cheap:

- dtype and inferred semantic type (identifier, category, ordinal, continuous,
  date, free text, boolean, currency, geographic)
- min, max, mean, median, quartiles, standard deviation, skew, kurtosis
- cardinality and cardinality ratio, top values with frequencies
- missing count and pattern (is missingness random, or concentrated in a block?)
- format regularity — do the strings share a shape, and how many break it
- monotonicity, and whether values look like a sequence
- correlation with every other numeric column

**Stage 2 — one model call for the whole schema.** Send the profile — never the
raw rows — plus the column names and the file name. Ask for structured JSON:

```jsonc
{
  "domain": "retail sales",
  "domain_confidence": 0.86,
  "grain": "one row per transaction line item",
  "likely_target": "revenue",
  "target_reason": "the only continuous column the others plausibly explain",
  "columns": {
    "customer_id": {
      "role": "identifier",
      "valid": { "type": "string", "pattern": "^CUS[0-9]{6}$" },
      "on_missing": "drop_row",
      "on_invalid": "flag",
      "never_impute": true,
      "why": "an invented id silently creates a customer that does not exist"
    },
    "age": {
      "role": "feature",
      "valid": { "type": "integer", "min": 0, "max": 120 },
      "on_missing": "impute_median",
      "outlier_policy": "clip_to_valid_range",
      "why": "ages outside 0–120 are data-entry errors, not real people"
    },
    "revenue": {
      "role": "target",
      "valid": { "type": "number", "min": 0 },
      "on_missing": "drop_row",
      "outlier_policy": "keep",
      "why": "large sales are the signal, not noise — capping them would erase
               the most valuable observations in the dataset"
    }
  }
}
```

**Stage 3 — apply the plan and record it.** Every action is attributable to a
rule with a stated reason. The cleaning log stops being "imputed 12 nulls" and
becomes "imputed 12 nulls in `age` with the median (34) because ages are
continuous and 12 of 4,000 rows is small enough not to distort the
distribution."

**Stage 4 — show the user the plan before running it.** This is the part that
changes the product. Instead of "shall I clean this? yes/no", the user sees a
table: each column, what will happen to it, and why. They can override any row.
Cleaning stops being a black box the user has to trust.

**Why it is worth doing:**

- Never imputes an identifier — the single most damaging thing a generic cleaner
  does, and the most invisible.
- Keeps the outliers that matter and clips the ones that are typos, because it
  can tell the difference.
- Recognises a target column, which makes the insight stage far sharper.
- Produces an auditable log. For anyone using this for real work, "why does the
  report say X" has an answer.

**Cost control.** One model call per dataset, not per column. The profile is a
few kilobytes regardless of file size. Cache the plan against a hash of the
column names and dtypes, so re-uploading the same schema is free.

**Risks to handle.** The model can be confidently wrong about the domain, so
show the plan and let the user override. Never send raw values — the profile
carries distributions, not data. Fall back to the current generic cleaner if the
model call fails or returns unparseable JSON; the pipeline must never block on
it.

---

## B. Format choice after the analysis, not before

Right now output format is picked up front, alongside tone and audience. But you
do not know whether the findings want a one-page summary or a twelve-slide deck
until you have seen them.

**The change.** Run the analysis, show the insights inline, then ask. The
assistant can even suggest: "seven findings, three with strong visual support —
a deck would carry these better than a memo."

This costs nothing extra. Report rendering is already separate from insight
generation; the insight JSON is format-agnostic. It just needs to be persisted
so a second format can be rendered later without re-running the model.

Once that is in place, "also give me the PowerPoint" on an analysis from last
week becomes a render, not a re-analysis.

---

## C. The history tape

**The problem.** The dashboard is a wall of data. Everything is on screen at
once and history is a list you scroll.

**The proposal.** A horizontal filmstrip pinned to the bottom of the dashboard.
Each analysis is a card: a chart thumbnail, the file name, the date, and small
badges for which outputs exist. Scroll it sideways. Click a card and the
dashboard above it fills with that analysis.

What makes it more than a visual change:

- **Compare mode.** Shift-click two cards and the dashboard splits, showing both
  side by side. Same columns in both? Overlay the distributions.
- **Pin.** Keep a reference analysis on the strip while working on something
  else.
- **Group by dataset.** Three analyses of `sales_q3.csv` with different
  customization stack into one card that expands.
- **Continuity.** The tape stays visible while you work, so the current analysis
  has visible context rather than replacing everything.

**Implementation notes.** The thumbnail is the first chart, already stored.
Nothing new needs generating. The endpoint exists. This is a frontend component
plus a small addition to the history DTO for the thumbnail URL. It is the
cheapest of the three ideas here by a wide margin, and probably the most
noticeable to a user.

---

## D. Business and operations monitoring

Everything below is data DIG already has or could record with a single table.
Grouped by the question it answers.

### Are people using it?

- Daily, weekly, monthly active users
- New sign-ups per day, and the source if referral tracking is added
- Analyses run per day, split by plan
- Median analyses per active user
- Time of day and day of week distribution — when does load actually arrive

### Are they sticking around?

- **Activation rate.** Of people who sign up, what fraction complete a first
  analysis? A low number here means the upload flow is the problem, not the
  product.
- **Cohort retention.** Of users who signed up in a given week, what fraction
  are still running analyses 1, 2, 4, 8 weeks later? This is the single most
  informative chart a subscription product can have.
- **Dormancy.** Accounts with no activity in 30 / 60 / 90 days.
- **Churn.** Cancellations per month, and — worth asking at the moment of
  cancellation — why.

### Is the business working?

- MRR, and its movement broken into new, expansion, churned, reactivated
- Free-to-Pro conversion rate, and time-to-conversion
- **Where conversion happens.** Which quota wall did they hit — the 2-analysis
  limit, the Word export, the team feature? That tells you what Pro is actually
  worth to people, as opposed to what the pricing page claims.
- Lifetime value against cost to serve
- Failed payments and involuntary churn

### What is it costing?

This is the one that matters most for an LLM product and the one most often
missing.

- **Tokens per analysis**, split by model and by pipeline phase — the domain
  pass, the insight pass, the audit pass
- **Dollar cost per analysis**, and therefore **gross margin per analysis**
- Cost per user per month against the $9.99 they pay. A Pro user running fifty
  deep analyses may be unprofitable, and you cannot know without this.
- Cache hit rate, once caching exists
- Cost trend as prompts change — a prompt edit that adds 30% to token spend
  should be visible the day it ships

### Is it healthy?

- Analysis success rate, and failures grouped by phase
- p50 / p95 / p99 pipeline duration
- Model API error and timeout rates
- Queue depth and time-to-start under load
- Storage growth and cost

### What are people actually analysing?

- Dataset size distribution — are the 50 MB and 10-row cases both real?
- Domain mix from the classifier: finance, health, retail, education. Tells you
  which verticals to tune prompts for.
- Which customization options get used, and which never do. Anything at 0% is
  either undiscoverable or unwanted, and the fix differs.
- Export format split
- Cleaning acceptance rate — how often does someone say yes?

### The one alert worth having

Most dashboards go unread. A weekly digest by email — signups, MRR movement,
cost per analysis, failure rate, and anything that moved more than 20% — gets
read. Add a real-time alert only for the things that need action within the
hour: model API down, failure rate above 10%, daily spend past a ceiling.

### On advertising

Worth being direct: DIG is a paid subscription tool handling people's private
datasets. Third-party ads would undercut both. If the goal is another revenue
line, the better versions are:

- **Usage-based add-ons.** Extra analyses, bigger file limits, longer history.
- **A team tier.** Per-seat pricing above the individual plan.
- **An API.** Programmatic analysis, priced per call. Likely the largest
  opportunity here.
- **White-label.** Consultancies delivering client reports with their own
  branding on the PDF.
- **Sponsored templates.** If a partner wants a co-branded report format, that
  is a placement inside the product's own value rather than an ad next to it.

### Implementation shape

One `usage_events` table — `(id, user_id, event_type, analysis_id, metadata
jsonb, cost_cents, tokens_in, tokens_out, duration_ms, created_at)` — carries
almost all of the above. Write to it from the pipeline. Aggregate nightly into
`daily_metrics` so the dashboard reads pre-computed rows rather than scanning
raw events.

Do not build all of it. Start with: active users, analyses per day, cost per
analysis, and activation rate. Those four answer "is this working and can I
afford it", which is the whole question at this stage.

---

## E. Smaller things worth doing

**Inline file previews.** The workspace centre panel currently describes a file
and offers a download. Rendering the PDF inline with `<embed>` and the CSV as a
virtualised table would make annotations feel anchored to something.

**Anchored annotations.** Once previews render, a comment can attach to a page
and coordinate, or to a specific cell, instead of to the file as a whole.

**Scheduled re-analysis.** Point at a file that updates — a Google Sheet, an S3
key — and re-run weekly. Email the report. Turns a one-shot tool into something
with a standing reason to come back.

**Analysis diffing.** Two runs of the same dataset shape: what changed in the
findings? Combined with scheduling, this is a monitoring product.

**Ask a follow-up.** After the report, let the user ask a question about their
own data in natural language. The statistical summary is already computed and
small enough to fit in a prompt, so this is cheap.

**More input formats.** Excel with multi-sheet handling, JSON, Parquet, a
direct database connection.

**Export the cleaning plan.** As a Python script the user can run themselves.
Turns DIG into something that teaches, and makes the cleaning reproducible
outside the product.

**Accessibility.** Charts currently carry no alt text and the palette has not
been checked for contrast. Both are quick and both matter.

**Rate limiting on the guest endpoint.** It runs the full pipeline with no
account and no quota. Someone will find it.

---

## Suggested order

1. **History tape** — cheapest, most visible, no backend work.
2. **Format choice after analysis** — small change, removes a real annoyance,
   unlocks re-rendering old analyses in new formats.
3. **Cost tracking** — four metrics. Do it before scaling, not after.
4. **Column-aware cleaning** — the biggest quality improvement available, and
   the thing that most distinguishes DIG from a script.
5. **Inline previews** — makes collaboration feel finished.
6. **The full monitoring dashboard** — once there is enough traffic for the
   numbers to mean anything.
