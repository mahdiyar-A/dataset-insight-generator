# DIG — Project Status

**Branch:** `main` (feature/workspace-collab merged 2026-09-12)
**Last updated:** 2026-09-12

---

## Test coverage

| Suite | Count | Command |
|---|---|---|
| C# — unit, integration, edge cases | 155 | `dotnet test backend.Tests/backend.Tests.csproj` |
| Python — cleaning convergence + usage telemetry | 59 | `cd ai_service && pytest tests/` |
| Frontend — Vitest | 62 | `cd frontend && npm test` |
| Frontend — type check + lint + build | — | `cd frontend && npm run lint && npm run build` |

All green. **276 automated tests.** `tsc --noEmit` clean, eslint 0 errors.

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
Upload → quality check → optional cleaning → statistics → Gemini insights → charts → PDF. Runs in the background with SignalR status updates; the frontend polls `/api/analyses/active`.

### Report customization
Language, tone, insight count, occasion, audience, depth, focus areas, comparisons, must-mention topics, chart style, methodology and confidence toggles. Word and PowerPoint output for Pro.

### Plans and billing
Free (2 analyses / 48h, 5 history slots, PDF only) and Pro ($9.99/mo, unlimited, Word + PPTX, chatbot customization, teams, 15 history slots). Stripe checkout, billing portal and webhook handling are wired end to end. No card data is stored server-side.

### Teams and collaboration
Team creation, email invites, role management. Shared workspaces with per-file permissions, threaded annotations, and real-time presence and cursors over SignalR.

### Auth
Supabase JWT, email verification, password reset, email change verification, phone OTP.

### Other
Admin dashboard, guest dashboard, help centre, profile management, Docker images for all three services.

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

1. **Backend** — restore, build Release, run the 133 NUnit tests, upload TRX results.
2. **AI service** — install requirements, run the 37 pytest tests, upload JUnit XML.
3. **Frontend** — `npm ci`, lint, `next build` (which type-checks the whole app).
4. **Docker** — build all three images with layer caching. Built, not pushed.
5. **CI** — a single summary job to point branch protection at.

The test suites replace Supabase, Stripe, SMTP and the Python service with in-memory fakes, so CI needs no secrets and no running services.

**Deliberately no deploy stage.** AWS and Supabase provisioning are manual, so a deploy job would need long-lived cloud credentials in repository secrets for no benefit. The workflow is committed but not yet pushed.

---

## Not done — manual

- **AWS provisioning.** Docker images build cleanly and are deployment-ready;
  nothing is running. Constraints decided 2026-09-12: strictly pay-per-usage
  with a hard spend cap (service stopping beats overspending); note SignalR
  needs a persistent connection, which conflicts with pure scale-to-zero.
- **Supabase project setup.** Stays on the free tier. Schema (migrations 001
  and 002), buckets and RLS are applied through the Supabase console. Watch
  the 1 GB storage cap — per-analysis files add up; pruning helps but
  retention may need tightening.
- **Branch protection.** Point the required check at the `CI` job. The remote
  already warns "changes must be made through a pull request" but does not
  enforce it — align the rule with the actual workflow.

---

## Not done — tracked debt

- **`react-hooks/exhaustive-deps` warnings (56).** Existing usages are
  deliberate — animation phase transitions and derived state from async loads —
  but each should be reviewed. Not blocking: lint passes with 0 errors.
- **No component/interaction tests.** The Vitest suite covers pure logic
  (annotation tree, error handling, request building). Rendering tests over the
  upload flow and chat card would be the next coverage gain.
- **File previews.** The workspace centre panel describes each file and offers a
  download rather than rendering it inline. See FUTURE_EXPANSION.md.
- **Guest endpoint has no rate limit.** It runs the full pipeline with no
  account and no quota.

## Next up

1. Enable branch protection on the `CI` check.
2. Apply migrations 001 + 002 in the Supabase console.
3. Provision AWS under the pay-per-use + hard-cap constraints and deploy.
4. Pick a UI direction from the design canvas and implement it.
5. Format choice after analysis rather than before.

See FUTURE_EXPANSION.md for the full inventory and designs.
