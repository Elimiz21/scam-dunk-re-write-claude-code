# Task 2 — monitoring persistence report

## Status

Implemented and committed as `28a993c16e297b0d6fec11b4f0cbf18f74635f9e`.

## Delivered scope

- Added backfill-safe Prisma models for user-owned watchlist entries, active monitor slots, monitor executions, and notification deliveries. Existing models and rows are not altered or deleted.
- Added the `20260825_dashboard_monitoring` SQL migration with foreign keys, unique idempotency constraints, and query indexes.
- Added a read-only migration verifier. It reports duplicate rows if the new tables already exist and exits non-zero rather than deleting or repairing data.
- Added a typed monitoring repository with transaction boundaries for watchlist/monitor mutations and execution creation. It normalizes stored tickers, makes absent watchlist removal idempotent, rejects a duplicate active slot, enforces a maximum 24-calendar-month monitor lifetime, and uses the `(monitorId, publicationKey)` upsert as the execution idempotency fence.
- Added five focused repository contract tests. Plan/credit entitlement logic is deliberately not included; the later runner can supply those decisions.

## Verification evidence

- Red: `npm test -- --runInBand src/tests/monitoring-repository.test.ts` initially failed because `@/lib/monitoring/repository` was absent.
- Green: the same focused command passes: 1 suite, 5 tests, 0 failures.
- `npx prisma generate` completed successfully.
- `DATABASE_URL=... DIRECT_URL=... npx prisma validate` completed successfully with the schema valid.
- `git diff --cached --check` completed successfully before the implementation commit.
- Browser smoke checks: production `/` and `/login`, plus local `/login` after Prisma regeneration, rendered without browser console errors. Local server returned `GET /login 200`; no new Prisma server error appeared.

## Known verification limits / concerns

- No authenticated browser session was available, so protected account navigation could not be exercised without credentials. The unauthenticated account entry route was verified instead.
- `npx tsc --noEmit` remains blocked by ten pre-existing `TS2322` errors in `src/tests/e2e.test.ts` (optional scan-context fields passed where required). The new monitoring test typing issue was fixed; no remaining typecheck error references the new monitoring files.
- The migration verifier was executed with safe placeholder credentials and failed closed with database access denied. It made no database changes. A real staging/production credential is required before applying the migration and completing conflict verification.
- The assignment explicitly prohibited dispatching subagents, so no independent review agent was launched. The implementation was self-reviewed against the brief and checked with the focused test/schema/browser evidence above.

## Fix round 1 — 2026-08-25

### Delivered fixes

- `upsertWatchlistTicker` now uses `normalizeSupportedTicker` before opening a transaction and throws the typed `UnsupportedWatchlistTickerError` for clearly unsupported or malformed ticker input. This preserves the helper's stated limit: it does not claim to prove that a symbol is currently US-listed.
- Added transaction-backed execution lifecycle methods for credit reservation, credit charging, completion, skipping with a reason, and failure with an error reason.
- Added transaction-backed notification delivery upserts for the unique `(userId, executionId, channel)` record, covering both `IN_APP` and `EMAIL` delivery outcomes and metadata.
- A Prisma `P2002` race on `ActiveMonitor` creation now becomes `MonitorSlotConflictError`, matching the preflight slot-conflict contract.
- Added focused contract coverage for invalid ticker rejection before persistence, the unique-error race, execution lifecycle transitions, and notification delivery persistence.

### Verification evidence

- Red: the new contract tests failed before the implementation because unsupported tickers were accepted, a `P2002` leaked, and lifecycle/delivery methods were absent.
- Green: `npm test -- --runInBand src/tests/monitoring-repository.test.ts` passed: 1 suite, 9 tests, 0 failures.
- `npx prisma generate` completed successfully.
- `DATABASE_URL=... DIRECT_URL=... npx prisma validate` completed successfully with the schema valid.
- `git diff --check` completed successfully.
- `npx tsc --noEmit` no longer reports the monitoring files. It remains blocked by the existing optional scan-context typing errors in `src/tests/e2e.test.ts`.

### Known limits / concerns

- No database migration was applied and no authenticated browser flow was exercised in this repository-only persistence task.
- The listing helper remains deliberately non-authoritative; a later market-data boundary must verify that otherwise syntactically valid symbols are currently supported listings.
- Per task instruction, no subagent was dispatched; the code was self-reviewed instead.
