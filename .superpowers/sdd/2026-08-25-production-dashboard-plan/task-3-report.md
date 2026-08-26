# Task 3 — dashboard data, API, and monitoring runner report

## Status

Implementation is present and the focused Task 3 tests pass. Task 3 is **not fully verified or committed** because the repository-wide typecheck is blocked by pre-existing `src/tests/e2e.test.ts` errors, no real database/authenticated test session was available, and the requested browser cycle was interrupted after both local URLs were blocked by the in-app browser.

The local development server was stopped after the status request. No production/test files were edited after that request; this report is the only subsequent file addition.

## Task 3 files present

### Server data and runner

- `src/lib/dashboard-data.ts`
- `src/lib/pump-radar.ts`
- `src/lib/monitoring/runner.ts`

### API routes

- `src/app/api/dashboard/route.ts`
- `src/app/api/pump-radar/route.ts`
- `src/app/api/watchlist/route.ts`
- `src/app/api/monitors/route.ts`
- `src/app/api/scans/history/route.ts`
- `src/app/api/scans/[id]/route.ts`
- `src/app/api/cron/monitoring/route.ts`

### Focused tests

- `src/tests/dashboard-api.test.ts`
- `src/tests/monitoring-runner.test.ts`
- `src/tests/history-api.test.ts`

## Implemented behavior

- Server-shaped Pump Radar data uses `DailyScanSummary` as the current publication-complete marker and reads matching `StockDailySnapshot`/`TrackedStock` rows.
- Public Pump Radar masks tickers and exposes only aggregated social fields from a completed compatible `SocialScanRun`; it does not return social content, author, source, or URL fields.
- Customer risk labels are exactly `High risk`, `Caution`, and `Low risk`.
- Dashboard payload includes server-calculated plan credits, active full/price slot use, watchlist preview, recent scans, Pump Radar preview, and freshness metadata.
- Watchlist list/add/remove endpoints require authentication, validate ticker syntax, require an authoritative tracked US common-stock row before addition, and do not touch `ScanUsage`.
- Monitor list/create/update/delete endpoints require authentication, validate with Zod, enforce Free/Pro/Pro Max slot limits server-side, and accept only daily/weekly schedules with 1–24 month duration.
- History accepts only `MOST_RECENT`, `HIGHEST_RISK`, or `DATE_ADDED`; risk/date sorting is implemented through explicit branches rather than dynamic query input.
- Scan detail is owner-scoped and can include compatible market/social evidence without exposing raw private social content.
- The EOD runner reuses one published snapshot dataset, expires schedules, advances daily/weekly schedules, uses `(monitorId, publicationKey)` plus an atomic conditional reservation as the charge fence, writes automatic history once, updates watchlist freshness, and queues unique `IN_APP` and `EMAIL` delivery rows.
- Stale, unpublished, unsupported/missing-ticker, no-credit, and failed execution paths do not charge credits.
- The cron endpoint fails closed when `CRON_SECRET` is absent and otherwise requires `Authorization: Bearer <CRON_SECRET>` using constant-time comparison.

## Focused test evidence

Command:

```text
npm test -- --runInBand src/tests/dashboard-api.test.ts src/tests/monitoring-runner.test.ts src/tests/history-api.test.ts
```

Result:

```text
PASS src/tests/monitoring-runner.test.ts
PASS src/tests/dashboard-api.test.ts
PASS src/tests/history-api.test.ts

Test Suites: 3 passed, 3 total
Tests:       18 passed, 18 total
Snapshots:   0 total
```

Covered contracts include unauthenticated endpoint access, public Pump Radar privacy, unsupported ticker rejection before writes, no-credit watchlist add/remove, plan slot limits, the 24-month boundary, safe history ordering, owner-scoped detail, stale publication no-charge behavior, exact-once automatic charging/history, missing published ticker no-charge behavior, expiry, daily/weekly scheduling, notification persistence, and cron-secret rejection.

`git diff --check` passed with no whitespace errors.

## Typecheck status

Command:

```text
npx tsc --noEmit
```

Task 3 initially produced one Zod/default inference error in `src/app/api/scans/history/route.ts`; that was fixed and did not recur. The final typecheck reports no Task 3 file errors.

The command still exits non-zero because of ten pre-existing `TS2322` errors in `src/tests/e2e.test.ts` at lines 273, 296, 324, 361, 563, 612, 642, 666, 685, and 714. Each passes an optional scan-context object where all four boolean fields are required. Those files were outside Task 3 scope and were not edited.

## Build status

`npm run build` was **not run**. The repository-wide TypeScript gate is already non-green from the ten existing `e2e.test.ts` errors, and the user stopped the remaining verification cycle before a build attempt. No build-success claim is made.

## Curl/runtime smoke evidence

A local Next.js development server started successfully on port 3113 with safe placeholder secrets and an intentionally unreachable placeholder PostgreSQL URL. Runtime responses were:

- `GET /api/dashboard` → `401`, structured `UNAUTHORIZED`
- `GET /api/watchlist` → `401`, structured `UNAUTHORIZED`
- `GET /api/monitors` → `401`, structured `UNAUTHORIZED`
- `GET /api/scans/history?order=MOST_RECENT` → `401`, structured `UNAUTHORIZED`
- `GET /api/cron/monitoring` with no configured cron secret → `503`, structured `CRON_NOT_CONFIGURED`
- `GET /api/pump-radar?limit=3` with the intentionally unavailable database → `503`, structured `UNAVAILABLE` payload with null freshness/coverage and no fake rows

The development server also emitted existing Sentry/OpenTelemetry dynamic-dependency warnings. They were not introduced or changed in Task 3.

## Browser status and blocker

- The in-app browser refused both `http://127.0.0.1:3113` and `http://localhost:3113` before requests reached Next.js (`ERR_BLOCKED_BY_CLIENT`).
- A Chrome browser connection was established, but the navigation attempt was interrupted by the user before a result was returned.
- Therefore an actual browser-visible authenticated dashboard/watchlist state was **not verified**.
- No authentication credentials, service keys, cookies, or live database values were used or exposed.

## Unresolved blockers and concerns

1. Repository-wide typecheck remains non-green because of the ten existing `src/tests/e2e.test.ts` errors.
2. A production-like build has not been run.
3. Browser verification is incomplete because local navigation was blocked/interrupted.
4. Real published Pump Radar rows, authenticated dashboard/watchlist/monitor mutations, database transactions, and notification rows were not exercised against a real disposable/staging database.
5. No authenticated test user/session was available.
6. No independent code-review pass was completed after implementation.
7. No Task 3 commit was created; all Task 3 files remain uncommitted in the shared checkout.

## Preserved unrelated state

- Existing dirty edits in `src/app/(auth)/login/page.tsx` and `src/app/(auth)/signup/page.tsx` remain present and were not edited by Task 3.
- The untracked `docs/superpowers/` plan/spec directory remains present and was not altered by Task 3.
- Task 3 did not edit UI, billing, Prisma schema/migrations, auth configuration, login, or signup files.

## Commit status

- Implementation commit: `bf2c4045a13dc984a15deceae0b2cd39938e1f86`
- Message: `feat: add production dashboard data APIs and monitoring runner`
- Commit contents: 14 files, consisting only of the Task 3 server data/runner files, API routes, focused tests, and this report.
- Staged path audit: passed before commit; no auth, billing, Prisma, components/UI, or design-system paths were staged.
- Post-commit working tree: the pre-existing `src/app/(auth)/login/page.tsx` and `src/app/(auth)/signup/page.tsx` edits remain modified; the untracked `docs/superpowers/` plan/spec directory remains untouched.

## Fix round 1 — API/data integrity

### Scope

This round changes only the Task 3 API/data layer and its focused tests. It does not modify UI, billing, auth, Prisma schema/migrations, login/signup, or Task 2 files.

### Reviewer findings resolved

1. Public Pump Radar now queries NASDAQ/NYSE/AMEX non-OTC candidates, rejects known non-common security names before presentation, masks the ticker exactly as before, and omits `signalSummary`, company names, ticker text, and arbitrary platform labels from public rows. Aggregate social counts remain available; platform labels are allowlisted to canonical public names.
2. Monitoring eligibility is evaluated against the requested EOD publication date, both in the database filter and an in-process defensive check. A monitor cannot be charged for a publication that predates its start, next evaluation, or active expiry window.
3. New automatic history records store the charged midnight EOD publication in their existing `createdAt`. Automatic detail lookup requires that exact `StockDailySnapshot` and same-day completed social run. Existing automatic records with a non-midnight timestamp have no trustworthy publication key, so the detail/history layer withholds market and social evidence rather than attaching a later snapshot.
4. History social-evidence availability now requires a matching ticker on a `COMPLETED` `SocialScanRun` for the exact scan/publication day.

### Schema decision

No migration is required for new automatic scans: `assetType` identifies the automatic source and the runner’s midnight `createdAt` is the deterministic publication pointer. A backfill of legacy automatic history is not safe from the current schema because `ScanHistory` has no execution/publication relation. If that historical enrichment becomes necessary, the minimal future migration is a nullable `publicationKey` on `ScanHistory`, written from `MonitorExecution.publicationKey`; this round deliberately does not add it.

### Test-first evidence

The four regressions were added before production changes and initially failed for the intended reasons: foreign/ETF rows and identifying Pump Radar summaries were public, runner eligibility used runtime rather than publication date, automatic history used runtime `createdAt`, detail used a latest-prior snapshot, and history considered unrelated social mentions. A final red test also demonstrated that arbitrary social-platform text could disclose an identity.

### Verification

```text
npm test -- --runInBand src/tests/dashboard-api.test.ts src/tests/monitoring-runner.test.ts src/tests/history-api.test.ts

Test Suites: 3 passed, 3 total
Tests:       22 passed, 22 total
```

`git diff --check` passed.

`npx tsc --noEmit` was run after the fix and remains non-zero for two untracked dashboard/UI paths: `src/components/dashboard/MonitorEditor.tsx:61` (`MonitorDraftValidation.message`) and `src/tests/dashboard-components.test.ts:13` (missing dashboard view-model module). Both are outside the Task 3 API/data scope and untouched by this round; no Task 3 file was reported by TypeScript.

### Review and remaining concerns

The explicit instruction for this round prohibited subagents, so the required review was performed as a scoped local review of the changed paths and regression coverage rather than dispatching a reviewer. A production/staging database and authenticated browser session were not used in this API-only round. The repository-wide typecheck remains blocked by the unrelated untracked dashboard component described above.
