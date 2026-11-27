# DIG — Project Status

**Branch:** `main`
**Last updated:** 2026-11-24

---

## Test coverage

| Suite | Count | Command |
|---|---|---|
| C# — unit, integration, edge cases, the real Supabase client against a stand-in server, the chat suggesting changes, teams editing the report, the look of the files | 533 | `dotnet test backend.Tests/backend.Tests.csproj` |
| Python — stats, ingest, chat harness, reports, full pipeline, model watch, asking what the data is, insights' evidence, the editable report, changes the chat suggests and charts DIG draws, combining teammates' saves, reading who the report is for, plain words and the five looks | 1154 | `cd ai_service && pytest tests/` |
| Frontend — Vitest, including rendered components, the change card, the live report channel, the two themes, the interactive demo and its team stop, the look picker, and the landing page's proof, files and pricing | 405 | `cd frontend && npm test` |
| Frontend — type check + lint + build | — | `cd frontend && npm run lint && npm run build` |

---

## The landing page shows the product and its prices, 2026-11-24

An outside review of the site, each point checked against the live site and
the code before anything changed. Frontend only.

- **See it work** (`app/home/ProofSection.tsx`): five real rows of the sample
  file with their problems marked, beside the finding DIG makes of them, then
  three questions to press. One says where a figure comes from, one is looked
  up in the file, one is declined because it is not about the file. All saved
  text: no server, no AI.
- **The files** (`FilesSection.tsx`): pages of the sample's own PDF, Word and
  PowerPoint (`public/demo/preview_*.png` are renders of those files), each
  linked to the file it is a picture of.
- **Pricing** (`PricingSection.tsx`), with a link in the menu. The menu button
  takes over below 920px, where the fifth link no longer fits in French.
- **No figure is typed into the copy** (`homeCopy.ts`): each comes from
  `demoFacts.ts`, which the tests hold to the sample files, the Plans page and
  the report harness, in English, French and Persian.
- **"8 languages" was the report's, and Pro only**; the site is in three. The
  ticker now says so. The fifth feature card said one session is kept; a Free
  account keeps five analyses.
- **Scrolling no longer blanks words**: headings, the line under each, and the
  buttons under the title move but are never invisible; the rest fades in half
  a second instead of one, and starts at the bottom edge of the screen.
- **Symbols are drawn** (`components/Icons.tsx`), in the demo and on the hero
  button. ↻ ↶ ✎ ⤢ ＋ ✓ are in neither of the site's fonts, so each depended on
  what the visitor's computer had.
- **The demo**: Enlarge sits under a chart instead of on it; the charts load
  before the report is opened; the "Done!" note is smaller, shorter, under the
  header, and lets a press through; the three cleaning counts land together;
  the plan switch no longer overshoots its box; Work together says it is a
  simulated preview, and what is live in the app.
- `tests/homePage.test.tsx`, and more in `tests/demoTour.test.tsx`.

Left as it is, on purpose: a declined question still counts toward the day's
questions, in the demo as on the server (`ChatController.Ask` gives back only
failures). Giving them back would let anyone use up the shared AI allowance
for free.

---

## No more guest dashboard, 2026-11-22

The guest dashboard ran the whole pipeline for anyone, with no account. A
visitor who can't be told apart can't be held to an allowance, and every guest
run spent the free AI quota that signed-in people share. The interactive demo
now does its job of showing what DIG does.

- **The landing page offers three ways in**: the demo first, then Register and
  Login, in English, French and Persian. The note under them points to the
  demo and says a free account runs DIG on your own data. "Flexible Access"
  became "Free to Start".
- **`/guestDashboard` is gone.** Old links and search results land on `/demo`
  (a permanent redirect in `next.config.ts`); the sitemap no longer lists it.
- **The server's guest routes are gone**: `/api/guest/upload`, `/chat` and
  `/status` answer 404 (`NoGuestRoutesTests`). With them went the guest
  allowances in `AnalysisGate`, the two guest rate-limit policies and the
  guest upload store.
- **The chat, upload and charts cards** lost their guest branches; every
  analysis runs under a signed-in account.
- **The terms** no longer mention guest use (updated 22 November 2026).

---

## Reports that fit their reader, and a look to choose, 2026-11-22

Every report was written by "a consultancy for the C-suite" and dressed the
same (a dark navy PDF in Helvetica). The free plan sends no settings and the
server's default tone was "professional", so a café's sales came back quoting
eta-squared and "p < 1e-6" on page 1.

- **DIG reads who the report is for** (`ai_engine/reading.py`). The call that
  already reads what the file is (no extra model call) now also says who most
  likely reads it and how to speak to them: setting (personal, business,
  public, research, technical), level (plain, balanced, expert), voice
  (friendly, professional, formal), how simple the charts should be, and the
  look that suits it. Without a model it is worked out from the kind of data.
  A reading log comes back as "you, tracking your own reading", friendly and
  plain; a café's sales as plain for the owner; a lab file as expert.
- **The person's own choices win** (`reading.settle`): casual is really plain
  and friendly, academic is really formal with statistics, technical is
  expert with detailed charts. The free plan sends `tone: "auto"` (it sent
  "professional"); the server's default changed with it.
- **Plain reports stay plain** (`llm/plain.py`). The writer is told the level;
  slips it still makes ("(p < 0.001)", "statistically significant") are
  found, a report with many is sent back once, and the rest are taken out
  without a model. No figure is changed. Charts are kept to bars and lines for
  a plain reader (`fit_charts_to_reader`).
- **The statistics moved, not lost.** Each finding's "Based on" lines go on a
  last "How we know" page with notes on the data, cleaning and the confidence
  score.
- **A new PDF** in the order a reader wants it: a cover with what the data
  is, the title, three key numbers and the short version; "What we found" (a
  headline per finding, its figure, how firm it is in a word, its chart);
  your questions; "What it means"; "How we know". Fonts are embedded.
- **Word and PowerPoint redesigned** in the same look, with fonts the
  reader's computer already has, so nothing is swapped silently.
- **Five looks** (`ai_engine/design/looks.py`): Signature (DIG's paper, ink,
  cobalt and lime, Bricolage Grotesque and Work Sans), Clean, Warm, Classic
  and Midnight; five font pairs; A4 or US Letter. The free plan always gets
  Signature, so a free report looks designed and carries the brand. Pro picks
  any of them in the panel's new "Look of the files" section, or "Fits the
  data" (warm for a café, clean for a lab). Charts are drawn in the look's
  colours, and dates on a line chart get short flat labels.
- **The demo** has its report written by hand from the coffee file (no
  statistics before "How we know"; every figure checked by the tests against
  the CSV), new files made in the Signature look, and a new "Work together"
  stop: the report open for a team of five (owner, editors, a viewer, one
  away), live cursors, a teammate typing and saving, a comment and a reply,
  the activity log and what each role may do. It is view only: a click says
  so. On the demo's free plan it is marked Pro. In the real app teammates see
  each save, not each keystroke.
- **Server:** `AnalyzeRequestDto` gains `Theme`, `Font` and `PageSize`
  (signature, auto, a4 by default), sent to the AI service as form fields;
  customization stays Pro-only. Bricolage Grotesque and Work Sans ship in
  `ai_engine/design/fonts` with their Open Font Licence. No database change.
- **A brief sets the look only when asked** (fixed the same day, found by the
  live check): told "a short casual report for my boss", a model chose Clean,
  Modern and US Letter on its own. The model now sets the look only when the
  words ask about it and quotes them; DIG keeps it only if a quoted piece is in
  the text and names the look ("dark theme", "thème sombre", "رنگ تیره").
  Tone, audience and the rest are read as before.

Not covered: a long academic cover leaves out its list of findings when it
does not fit on the page (they follow on the next pages as always).

---

## The interactive demo, 2026-11-21

`/demo`, opened from a new "Try the interactive demo" button on the landing
page (English, French and Persian labels) and listed in the sitemap. DIG
welcomes the visitor, asks what brings them, and walks them through a real
saved run on a coffee chain's sales file.

- **A journey, then a map.** Three basics in order (drop the file in, see what
  the check found, decide on cleaning), then every stop opens to explore in
  any order: what the file is, the report, asking DIG, Free or Pro, and the
  files. Later stops say why they are locked; "Skip the basics" opens them.
- **DIG is there throughout**: a guide bubble on every stop, a "Done!" note
  after each action, "Press here" tips, eyes that follow the pointer, a nap
  after 45 seconds, a secret spin after five quick pokes.
- **Free and Pro side by side.** A switch in the header shows the demo as
  either plan: Word and PowerPoint, steering the report and team editing
  (with a teammate "Sam" moving a finding live) are marked Pro on Free.
- **Everything shown is real**: the report, charts, answers and files are
  DIG's saved output from one run, and every figure the demo adds is worked
  out again from the two CSVs by the tests. Nothing is uploaded and no AI
  runs, so the page never calls the server.
- English only, like the sample report. No server or database change.

---

## The signed-in pages in the landing page's look, 2026-11-21

From the approved design canvas. The dashboard and every signed-in page were
dark-only, with about 1,300 colours written into each component; they now
use the landing page's "Atlas" look in both light and dark.

- **Two themes, one setting.** `globals.css` holds the colours as tokens
  (paper, ink, cobalt, lime) for `data-theme="light"` and `"dark"`;
  `SettingsContext` sets the attribute (light above 65, as on the landing
  page; dark by default) and clears the colours older versions set inline.
  Settings offers Dark or Light instead of a brightness slider.
- **The dashboard**: a labelled ink sidebar with lime for where you are (a
  bar across the top on phones, which had no navigation before); a greeting
  with a New analysis button; what you have used (analyses kept against 5 or
  15, questions a day, team editing); notices without emoji; "Your analyses"
  in the page instead of pinned to the bottom; a Pro band for free accounts.
  Team is in the sidebar for everyone, since a free account can be invited.
- **Every other signed-in page** (team, plan, settings, profile, admin,
  pricing, the team report page) and the sign-in pages: paper background,
  square ruled cards, Bricolage Grotesque headings and Work Sans text.
- **Fixed on the way:** `login.css` and `register.css` set site-wide colours,
  fonts and a centred `body`, which stayed in force after signing in. The
  sign-in styles now live in `globals.css`, scoped to `.auth-body`.

Not in this change: the report page's new layout from the canvas (outline
and versions on the left, chat on the right, who is editing which part) comes
with Stage B, which adds the part holds it shows. The questions meter shows
the daily allowance, not the count used: the server reports that only after
a question. No database or server change.

---

## Teammates edit the report, 2026-11-21

Part 4, Stage A. Only the owner could edit a report; a team could only look
at the PDF and comment on it.

- **The report opens under the PDF on the team page**, in the same editor
  the owner has on the dashboard. Who may do what (`ReportAccess`):
  the owner of the analysis, the team's owner and its editors edit; viewers
  read every version and comment, with no Save, Undo or Go back. Someone set
  to "No access" for the PDF (or for all files) gets nothing, since the
  report is what the PDF is built from; the PDF's rule counts over "all".
- **Saves made at the same time are combined**, part by part
  (`report_document.merge`): a text section, each insight's title and text,
  each chart's title, caption and place, each answer, and the two orders. If
  only one side changed a part, that change is kept; if both changed the same
  part differently, the save is refused (409 `SAME_PART_CHANGED`) naming the
  parts and who changed them, and the person's words stay in the editor.
  Going back to a version and applying a chat change are not combined: they
  still need the newest version.
- **Every version names who saved it**: DIG, you, or a teammate by user name,
  never by email address. Undo says whose change it takes back.
- **Pages update as saves happen** (`/hubs/report`, `ReportHub`). The notice
  carries only the version number and who saved it, never the report's
  words; the page then loads the version itself. A page with nothing unsaved
  shows the new version at once; one with unsaved words keeps them and says
  the next save combines them. After a dropped connection the page catches
  up. The owner's dashboard shows the newest version, whoever saved it.
- **Losing access ends it at once**: removed from the team, or the team
  deleted, the page closes the report. Fixed on the way: deleting a team did
  not cut anyone's live connection to what it shared. The team's members are
  now read before it is deleted.
- **Still the owner's for now:** next-step buttons and charts DIG draws, and
  the chat (Stage C).
- **Privacy page:** what teammates see of you (name, email address, comments,
  what you type in a shared report, who saved each version). No database
  change.

Not covered: unsharing a workspace does not end live connections to it (as
before this change). The file badge never shows "Editor" because no rule
sets "edit" (as before; now hidden for the PDF).

---

## The chat suggests changes to the report, 2026-11-15

The editor needed the owner to make every change by hand, and could not add
an insight or a chart.

- **Ask for a change in your own words** in the chat ("make the summary
  shorter", "add an insight about units"). For the owner of a report that can
  be edited, the question carries the newest version, and the answer may come
  with a card: each change, the words now and the words suggested side by
  side, Apply and Discard. Nothing is saved until Apply.
- **A fixed list of changes** (`ai_engine/report_changes.py`): rewrite a text
  section, an insight or an answer; move or remove an insight (never the
  last); a chart's title, caption and place, remove it, or draw it again as
  another kind; add an insight; add a chart. At most 3 in one suggestion, 10
  insights and 8 charts in a report.
- **A new insight must rest on a computed result** (an F or R id from the
  analysis) or on a lookup run in the same request (L1, ...). DIG writes its
  "Based on" line from that result, in the report's language; a model's own
  line is ignored. What DIG measured and the existing "Based on" lines cannot
  be changed.
- **Charts are drawn by DIG**, never by a model: bar, line, scatter,
  histogram, box, grouped bar, from columns checked against the data. A drawn
  chart is stored as one more chart picture of the analysis, under the next
  number no version uses (at most 20 pictures per analysis).
- **Checked twice:** every change against the report, then every figure in
  the new words against the analysis, the report and that request's lookups.
  A wrong change or an unknown figure goes back to the model once; figures
  still unmatched are shown on the card as a warning.
- **The suggestion stays on the server** (`ReportProposals`, one hour, the 10
  newest per person). The page gets an id and a preview, so what is applied
  is exactly what was checked. Applying it made to an older version is
  refused as "changed since".
- **Apply is a save:** a new version, the files rebuilt with no model call,
  Undo goes back to the version it was made to. An open editor reloads, or
  says so when it holds unsaved edits.
- **Next-step buttons** replace the fixed chat suggestions when there is
  something to offer, chosen without a model from what the analysis computed
  and the report does not use (`GET /report/next-steps`). A chart button has
  DIG draw it (`POST /report/draw`, 30 an hour) and costs no question; an
  insight or "shorten the summary" button is a question like any other.
- **What it costs:** a suggestion in your own words is 1 question (Free 10 a
  day, Pro 100); usually one model call, two at most. A failed call is
  refunded. Apply, Discard, Undo and chart buttons use no AI.
- **What DIG added is kept** in the document's `added` list, which only
  grows, is carried forward from the newest version on every save, and is
  never read from an edit. Going back and forth between versions keeps it.
- **Privacy page:** an added chart's picture is stored and deleted with the
  analysis. No database change.

Not covered: the dashboard's Charts section shows only the analysis's own
charts; added ones show in the editor and the files. A team member cannot
ask for changes (Part 4).

---

## The report can be edited, 2026-11-15

The report was final the moment it was written: a wrong word or a weak
insight meant running the whole analysis again.

- **The report is a document now.** When an analysis finishes, the AI service
  returns its report as JSON (`ai_engine/report_document.py`): the text
  sections, the insights (ids i1, i2, ...), the charts (by file number), the
  answers to the user's questions, and the facts DIG measured. The backend
  saves it as version 1 in `report_versions` (migration 005).
- **What the owner can change** (dashboard, Report, "Edit the report"): title,
  introduction, summary, conclusion, data quality, assumptions, answers; each
  insight's title and text, its order, removing it (not the last one); each
  chart's title and caption, which insight it sits under, removing it.
- **What stays fixed:** the "Based on" lines and everything DIG measured. An
  edit is always applied to version 1 on the server, and only the editable
  fields are taken from it, so nothing else can be changed by sending it.
  Unknown ids are dropped: no insights can be added (that is Stage D).
- **Save rebuilds the files with no model call:** the PDF, and Word and
  PowerPoint when the analysis has them, through `POST /report/rebuild`. The
  chat context is rebuilt too, so the assistant answers from the edited text.
- **A figure the analysis didn't produce** gets a gentle warning beside the
  field after saving; the save is never stopped. Only text changed in that
  save is checked.
- **Versions:** every save is a new version. Undo and the Versions list go
  back by saving the old version again as the newest. Version 1 and the 20
  newest are kept. Two saves from the same starting version: the second gets
  "changed since you opened it" (409, from the unique version number).
- **Files follow the newest version.** `files_built` on each version is false
  between a save and its upload; a download or email first rebuilds the files
  if the newest version's were not stored.
- **Owner only, every plan.** Older reports say to run the analysis again.
  Saves are limited to 60 an hour per user.
- **Privacy page:** earlier versions are kept with the analysis and deleted
  with it.

Not covered: a team member cannot edit (Part 4). Charts cannot be redrawn and
insights cannot be added (Stage D).

---

## Insights name what they rest on, 2026-11-15

The writer received every computed result and wrote freely. Nothing tied a
paragraph to the figure behind it, so a fluent insight with nothing under it
read exactly like a real one.

- **Every result has an id.** `stats_digest.build_digest` tags each result the
  writer sees (trend, concentration, drivers, segments, correlations, group
  differences, associations, missing-value patterns, unusual rows, averages,
  common values) F1, F2, ... in a fixed order; the user's requests are R1, R2,
  ... (`user_requests.for_prompt`). `ai_engine/llm/evidence.py`.
- **Each insight cites them** in `rests_on`. One that cites nothing real is
  sent back once, in the same rewrite as unmatched figures. If it still cites
  nothing it is left out and the quality section says how many went; its chart
  moves to the charts at the end. If no insight cites anything, all stay with a
  warning, because an empty report says less.
- **"Based on" is written by DIG, not the model**, from the numbers, in all
  eight report languages, under each insight in the PDF, Word and PowerPoint,
  and in the chat context. The chat is told the ids are internal, and any it
  writes in brackets are taken out.
- **Live trial, two files, gpt-oss-120b:** every insight cited real ids on the
  first try; nothing was left out.

Not covered: the stats-only report written when no model answers has no
"Based on" lines (its insights are written by DIG from the statistics).

---

## Asking what the data is, 2026-11-14

What DIG takes a file to be steers the whole report: what leads it, which
questions it sets out to answer, what each column is called. That reading was
made after the user pressed Start, the model's confidence in it was never
read, and when no model answered the file was quietly called "general".

- **Read at the check, before anything runs.** `/check` with `with_domain`
  classifies the file (25 seconds at most) and says in one plain sentence what
  it takes the data to be. The analysis reuses that reading, so it costs no
  second call.
- **Sure: say it and carry on.** The chat shows "This looks like: online shop
  orders, one row per order." and starts.
- **Not sure: ask.** The chat offers DIG's reading and any other that fits, a
  box for the person's own words, and Skip. Nothing runs while the question is
  open. The rule is `groq_client.doubt`: no model answered, no subject could be
  named, confidence under 0.9, or most headers say nothing (V1, col2).
- **The bar is measured, not guessed.** On ten files with the live models,
  five that are plainly one thing scored 0.95 to 0.97 and four that could be
  several scored 0.70 to 0.80, each with a confident-sounding subject. The
  first bar, 0.75, let a file of call-centre shifts through as "a manufacturing
  process log".
- **The answer is used.** The file is classified again around the person's
  words, the writer is told what they said (fenced as their text), the report's
  quality section states it in all eight languages, and the chat knows it.
- **On every plan.** It is not part of report customization.

Not asked: guests, and files the check says cannot be analysed. Tested with
fakes, rendered components and a live trial of the prompt; not yet tried as a
signed-in person on the live site.

---

## Model watch, 2026-11-11

Every model DIG uses is a free endpoint another company runs and can withdraw
without telling us. The chain copes by moving to the next model, which is why
nobody would know: it only gets shorter. Now someone is told.

- **The check** (`ai_service/ai_engine/llm/model_watch.py`, `GET /models/status`).
  Reads each provider's own list of models, which is not a model call and costs
  nothing. Says which models are gone, which carry a withdrawal date within two
  weeks, which chain is down to its last model, whether today's free OpenRouter
  requests are used up, and how the last day went: reports written without AI,
  files whose subject no model could name, questions left unanswered. A list
  that cannot be read claims nothing.
- **The alarm** (`backend/Application/Services/ModelWatch.cs`, `OwnerAlerts.cs`).
  The server asks every six hours and emails the owner anything wrong, in plain
  sentences. A report written without AI is emailed the moment it happens. The
  same trouble is emailed about once a day while it lasts, and no more than six
  alerts go out in a day. Silent when all is well. Off on a developer's machine.
- **Where it goes.** `Alerts__Email` in `backend/.env`; without it, the support
  inbox (`PlansController.SupportEmail`).
- **Seeing it.** Admin page, Models tab: each model and whether it is still
  offered, the day's allowance and counts, and a button that sends a test alert.
- **Backups looked at the same day.** Nemotron 3.5 Lightning (free, same key)
  was tried on the real prompts and left out: good on questions, but it did not
  finish a report, a domain check or a plan in time. Cerebras has no lasting
  free tier; NVIDIA's own free endpoints are for prototyping. Two things would
  add real room and both are the owner's to decide: a one-time $10 of OpenRouter
  credit lifts its free models from 50 to 1,000 requests a day, and SambaNova
  hosts gpt-oss-120b free (20 requests a day, no card) as a third provider,
  which needs a line in the privacy policy first. Details in
  `report_writer.py`'s header.

Not yet seen: a real alert arriving. Press "Send a test alert" once after deploy.

---

## Teams, 2026-11-11

Teams were built on the server and only partly reachable from the site. Tested
with fakes and rendered components; not yet tried by two real people in one
workspace, which is the true test.

- **A team holds five people**, the owner included. An invitation not yet
  answered holds a seat. Nothing limited a team before.
- **Invitations.** The same address is not invited twice, nor someone already in
  the team. The reply says what the person still needs: an account, Pro, or
  nothing. If the email cannot be sent the invitation is withdrawn and the page
  says so, where it used to say "Invitation sent".
- **Roles.** The owner changes a member between Viewer and Editor on the team
  page. The server could always do it; the page had no control.
- **Sharing.** "Share with a team" in the dashboard's report section, and a
  Shared tab on the team page that opens each workspace. Neither existed, so no
  shared workspace could be reached.
- **Who can open which file.** The person who shared an analysis and the team's
  owner set it per person, per file, in the workspace. "Can open" or "No access";
  editing a file in place does not exist yet, so it is not offered.
- **Comments.** Anyone in the team can resolve a thread (only the author's click
  used to count, with the button shown to all). A saved edit shows at once.
- **Removal.** A removed member's live connection is cut. The live channel
  remembered membership until the server restarted (`Hubs/LiveAccess.cs`).

Still true: every member needs their own Pro plan to join.

---

## Built 2026-11

The server runs this round, and `deploy/live_check.py` passes on it. The frontend
goes live when `release/november-round` is merged, because Vercel builds from
`main`. **Order matters:** deploy the server first (`bash deploy/deploy.sh`), check
it, then merge. The old frontend works with the new server. The new frontend on
the old server would offer formats it refuses and chat calls that fail, and its
privacy page would describe things that are not live.

Tested on the real server with real models for the AI service. The signed-in path
through the live database has not been run end to end: it is tested through the
real Supabase client against a stand-in server, using the live schema.
Analyses made before the deploy have no chat context, so their questions box
says to run them again.

**The app against the live database (found and fixed in this round):**

- Every sign-up since `users.last_active_at` became NOT NULL (about 2026-09-12)
  would have failed at the profile step. The two existing accounts are older.
- The bucket refused Word, PowerPoint, chat context and many original files,
  because the client library guessed types from file names.
- Delete Account removed nothing. It now cancels any subscription and removes
  the files, the row and the sign-in record (`AccountDeletion`).
- Workspace, comment, permission and member reads made up new ids and dates.
  Second shares, permission changes and invite accepts broke unique rules.
  Teammates could not download shared files.
- Changing a password could never work, name and phone could overwrite each
  other, saved pictures did not load after a reload, and Remove picture was not
  saved.
- `analyses` is still empty on the live database, so the first real signed-in
  run is the last check. The two rows in the old `datasets` table don't appear in
  history.

- **Any common data file.** CSV and other delimited text, Excel, ODS, JSON and
  JSON Lines, GeoJSON, XML, Parquet, Feather, ORC, Stata, SAS, SPSS, SQLite, and
  compressed or zipped copies of these. The server reads the file and reports
  what it found; the browser no longer counts commas. `frontend/lib/uploadFormats.js`
  and `backend/Application/Services/FileFormats.cs` hold the lists.
- **Report settings in your own words (Pro).** A brief fills in the panel for
  the user to check. Assumptions, things to leave out, up to five questions
  with notes, writing format, 1-10 insights, Word and PowerPoint.
- **Questions after the analysis.** Bounded to the analysis: it refuses other
  topics, works from the stored digest, can run limited queries on the data, and
  flags figures it could not check. Free 10 a day, Pro 100, briefs 30 a day.
- **Word and PowerPoint** buttons on the dashboard. Both files were already
  being built and stored; nothing offered them.
- **Stats engine.** A check that each strong correlation holds inside groups
  (`ai_engine/core/confounding.py`): Simpson's paradox and confounded pairs
  reach the writer and the chat with both figures, stop counting as evidence,
  and are charted with a line per group. Columns calculated from other columns
  are recognised (`ai_engine/core/identities.py`), so a formula is not reported
  as a finding or fed to the driver model. Trends now say when a series jumped
  or turned (`ai_engine/core/changepoint.py`), in reports and chat answers.
- **Calculated categories.** A category set from the measures, such as a tier on
  `a + b`, forces a relationship between them, which read as a false "reversed"
  or "vanished" on up to 95% and 98.5% of simulated files. `confounding.py` now
  recognises one and skips it. False claims: none at 2,000 rows, at most 3.3% at
  300, 6.7% at 150 and 15% at 100, except tiers on three measures at 12%, 22% and
  28%. Real groups stay checked 88 to 100% of the time at 300 rows and always at
  2,000. A tier cut from a column the file does not hold cannot be seen.
- **How far these are tested.** Every rule in `changepoint.py` and the calculated
  category check was broken on purpose, 78 in all, and a test noticed each one.

---

## Shipped 2026-09-12

- **History tape.** The filmstrip history pinned to the dashboard bottom
  (FUTURE_EXPANSION §C): chart thumbnails re-signed per request, pin-to-front,
  inline delete confirmation, EN/FR/FA, keyboard scrolling. Replaces the old
  scrolling history card.
- **Owner analytics.** LLM usage from the AI service is finally persisted
  (`cost_usd`, `tokens_in/out`, `usage_json` on `analyses` — migration 002),
  and `GET /api/admin/analytics` + an Analytics tab on the admin dashboard
  show analyses/day, cost/day, success rate, avg cost per run, active
  analysts, and estimated MRR. Runs without recorded cost are excluded from
  the average rather than counted as free.
- **CI actually runs.** The first-ever runs exposed three environment
  assumptions that never held: the `.sln` was gitignored (and missing
  backend.Tests), the workflow pinned Node 20 against a Node-24 lockfile, and
  the test factory's config stubs were invisible to Program.cs's mid-Main
  reads (masked locally by gitignored appsettings). All fixed; the backend
  suite is verified to pass with no appsettings present, which is the CI
  condition.
- **UI redesign direction.** Design canvas with the "Analyst's Desk" concept
  (editorial, paper-warm, findings-first) plus two alternate direction
  sketches — not yet implemented in code.

---

## Shipped and verified

### Analysis pipeline
Upload → quality check → optional cleaning → statistics → AI-written insights (free open-source models, strongest first: NVIDIA Nemotron via OpenRouter, then Groq) → charts → PDF, Word and PowerPoint. Runs in the background with SignalR status updates; the frontend polls `/api/analyses/active`.

### Report customization
Language, tone, insight count, occasion, audience, depth, focus areas, comparisons, must-mention topics, chart style, methodology and confidence toggles; the look of the files (five themes or one that fits the data, five font pairs, A4 or US Letter). Word and PowerPoint output for Pro. Without settings, DIG reads who the report is for from the data and writes for them, in its Signature look.

### Plans and billing
Free (2 analyses / 48h, 5 history slots, PDF only) and Pro ($9.99/mo, up to 20 analyses a day, Word + PPTX, chatbot customization, teams, 15 history slots). Stripe checkout, billing portal and webhook handling are wired end to end. No card data is stored server-side.

### Teams and collaboration
Teams of up to five, email invites, Viewer and Editor roles. Shared workspaces with per-file access, threaded annotations, and real-time presence and cursors over SignalR. Reports are downloaded, not edited in place.

### Auth
Supabase JWT, email verification, password reset, email change verification, phone OTP.

### Other
Admin dashboard, interactive demo (it replaced the guest dashboard), help centre, profile management, Docker images for all three services.

---

## Fixed this cycle

### The data-cleaning loop — root cause found and fixed

Users reported being asked to clean their dataset, agreeing, and then being asked again after uploading the cleaned file. Two independent bugs stacked:

**1. Cleaning never ran at all for signed-in users.**
`AnalysisService.RunAsync` accepted `userWantsCleaning` and `userConfirmedLow` as parameters and then dropped them — `BuildPythonRequest` constructed the DTO without setting either field, so `false` was always sent. The Python pipeline gates Phase 3 on `if quality.needsCleaning and user_wants_cleaning`, so it skipped cleaning every time. The chatbot told the user their data had been cleaned while the report was built on the original dirty dataset, and no cleaned CSV was ever produced — so "upload the cleaned file" meant re-uploading the original.

`GuestController` escaped this because it builds its DTO inline and sets the flags directly, which is why the guest flow behaved differently.

**2. Cleaning could not satisfy the checker even once it ran.**
`check_data_quality` set `needsCleaning` from `len(warnings) > 0`, but `clean_dataset` did not fix every warning it could emit. Constant columns and extreme outliers survived cleaning, so the recheck failed again. Three sub-problems:

- The cleaner now drops zero-variance columns and caps outliers by default, not only when Groq happens to direct it.
- Winsorising to exactly `q3 + 3*IQR` piles values onto the fence, which shifts the quartiles — so a single capping pass does not converge. Capping is now iterative.
- Values sitting exactly on the fence were re-flagged after a CSV round-trip moved the recomputed fence by two ULPs. The fence now carries a relative tolerance, because an outlier test that flips on floating-point noise is not measuring anything real.

`needsCleaning` is now driven only by signals the cleaner can act on. The invariant is enforced by tests:

```
check_data_quality(clean_dataset(df)).needsCleaning == False
```

Covered by 37 tests including a 25-seed fuzz over random shapes and distributions, and a CSV round-trip test that reproduces the exact user journey.

### SignalR authorization hole

`CollaborationHub` carried `[Authorize]`, which only proves the caller is signed in. It never checked that the caller belonged to the workspace they named. Any authenticated user could call `JoinWorkspace` with a guessed workspace id, enter the group, and receive every annotation, cursor position and presence event broadcast inside it — and inject annotation payloads into other people's live feeds.

`WorkspaceController` checks membership on every REST route. The hub bypassed all of it, so the real-time channel was a way around the REST authorization entirely.

Every hub method now verifies team membership, cached per `(user, workspace)` so cursor events at pointer-move rate do not hit the database. Negative results are cached too, so probing cannot force a query per attempt. 13 tests; 9 fail if the check is removed.

### Frontend production build was broken

Three separate failures, none visible from the dev server:

- `@microsoft/signalr` was declared in `package.json` but absent from `package-lock.json` and never installed. `npm ci` would fail outright and `app/workspace/[id]` could not resolve its import.
- `lib/BackendAPI.js` defaulted several parameters to `null`, so TypeScript inferred their type as `null` and every `.tsx` caller passing a real string failed the production type check.
- `/dashboard/plan` called `useSearchParams()` outside a Suspense boundary and failed prerendering. This is the Stripe post-checkout redirect target, so the failure would have dead-ended paid upgrades.

### Workspace collaboration correctness

- Add, resolve and delete only broadcast to `OthersInGroup` and never updated local state. The acting user saw nothing happen on their own screen until a reload — collaborators saw the change, you did not.
- Replies arriving over the wire were appended to the top-level list and rendered as new root comments.
- Live cursors were a dead stub: the client subscribed to `CursorMoved` with an empty handler and never invoked `MoveCursor`. Now implemented with throttling, percentage-based coordinates and TTL expiry.
- Annotation editing was unreachable from the UI despite both the PATCH route and `BroadcastAnnotationEdit` existing.
- Every annotation avatar used the current user's colour, so all authors in a thread looked identical.
- Colours came from `string.GetHashCode()`, which is randomised per process in .NET Core — users changed colour on every restart and differed between instances behind a load balancer, despite a comment claiming the opposite.
- `JoinWorkspace` never told the joiner who was already present, so the second person into a workspace saw an empty room.
- Closing one of two tabs removed a still-present user from everyone's presence list.
- `FILE_TYPES` was a module-level constant being mutated after each workspace load: no re-render, and values leaked into the next workspace opened.
- The client did not re-join the workspace group after an automatic reconnect, so the connection stayed live but silently received nothing.

### Stubs made real

- `POST /api/datasets/email-report` validated the request and returned "Report queued for delivery" without sending anything — a silent failure with no server-side trace. Now downloads the stored PDF and sends it via `IEmailService`, with distinct responses for a missing report (404) and an SMTP failure (502). SMTP exception detail is logged server-side and never returned to the client.
- Added `IStorageService.DownloadAsync` so the server can retrieve stored files rather than only handing out signed URLs.
- Removed the "Live chat — coming soon" row from the help centre (English and Persian).
- Added `frontend/Dockerfile` and wired the frontend into `docker-compose.yml`. The stack claimed containerization but the frontend had no image.

### Security

- `supabaseClient.ts` logged a 20-character prefix of the publishable key on every page load and during builds. Diagnostics are now development-only and never print any part of the key.
- `remotePatterns` replaces the deprecated `images.domains`, scoped to the storage object path.

---

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Backend** — restore, build Release, run the NUnit tests, upload TRX results.
2. **AI service** — install requirements, run the pytest tests, upload JUnit XML.
3. **Frontend** — `npm ci`, lint, `next build` (which type-checks the whole app).
4. **Docker** — build all three images with layer caching. Built, not pushed.
5. **CI** — a single summary job to point branch protection at.

The test suites replace Supabase, Stripe, SMTP and the Python service with in-memory fakes, so CI needs no secrets and no running services.

**Deliberately no deploy stage.** Vercel builds the frontend from `main`. The server is deployed by hand with `bash deploy/deploy.sh`, because a deploy job would need long-lived cloud credentials in repository secrets for no benefit.

---

## Not done — manual

- **Branch protection.** Point the required check at the `CI` job. The remote
  already warns "changes must be made through a pull request" but does not
  enforce it — align the rule with the actual workflow.
- **Stripe live keys.** Still `sk_test_`, and a live webhook needs to point at
  api.datainsightgen.com.
- **Google Search Console.** The site still has to be submitted.
- **Supabase storage.** Free tier, 1 GB. Per-analysis files add up; pruning
  helps but retention may need tightening.

---

## Not done — tracked debt

- **`react-hooks/exhaustive-deps` warnings.** Existing usages are deliberate —
  animation phase transitions and derived state from async loads — but each
  should be reviewed. Not blocking: lint passes with 0 errors.
- **File previews.** The workspace centre panel describes each file and offers a
  download rather than rendering it inline. See FUTURE_EXPANSION.md.
- **Chart legends are English.** "Trend", "Overall trend" and "Other groups"
  stay in English in a report written in another language.

## Next up

1. Deploy the server, verify it, then push the frontend.
2. Move from Lightsail to Lambda before the AWS credits end on 2027-04-09. The
   blockers are the background analyses and SignalR.
3. Bring the report page up to the canvas's layout (with Stage B).

See FUTURE_EXPANSION.md for the full inventory and designs.
