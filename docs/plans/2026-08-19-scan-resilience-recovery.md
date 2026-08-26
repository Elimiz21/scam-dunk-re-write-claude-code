# Scan Resilience and Recovery Implementation Plan

## Context

The August 18, 2026 run proved that Phase 3 correctly retains unclassified
stocks as suspicious, but it also exposed four production gaps: one malformed
row invalidates an entire OpenAI batch, provider usage can be lost when
semantic validation throws, recovery work is not durable or directly
replayable, and a degraded scan can still reach database ingestion.

This plan implements a staged recovery design that fits the current JSON-file,
Supabase Storage, GitHub Actions, Resend, and Prisma architecture. It does not
change production data or require a schema migration.

## Global Constraints

- Preserve fail-closed scam-detection semantics. Deferred, malformed, missing,
  or failed classifications remain suspicious and can never be converted into
  a legitimate-news clearance.
- A response anomaly degrades the run, but valid rows from the same response
  and later batches continue processing.
- Capture provider request/response provenance, token usage, and the pricing
  snapshot to a durable run journal immediately after the provider returns and
  before parsing or semantic validation.
- Use a unique generation identifier so replay outputs never overwrite or
  masquerade as the historical generation. A replay is a new timestamped
  analysis linked to its source generation, not a bit-for-bit reconstruction.
- Keep the existing daily candidate and model-call budget. Explicit replay
  symbols receive deterministic priority within the configured candidate cap;
  they do not silently expand the cap.
- Only a structurally valid `completed` scan with no degraded/failed/pending
  phase or unresolved recovery work is publishable. Missing, malformed,
  running, degraded, and failed scan status are non-publishable.
- Enhanced evaluation ingestion must check publication status before any
  Prisma write. Legacy historical evaluation files remain backward compatible.
- Use existing Resend and GitHub issue facilities for operator alerts. Never
  print or persist provider, Resend, Supabase, or database secrets.
- Add no new runtime dependency and no Prisma migration.
- Follow strict TDD: add each behavior test first, run it and capture the
  expected RED failure, then implement the smallest production change and
  capture GREEN output.

## Task 1: Build strict validation, durable recovery, and publication primitives

### Files

- Create `evaluation/scripts/news-analysis-resilience.ts`.
- Create `evaluation/scripts/news-analysis-resilience.test.ts`.
- Update `evaluation/scripts/news-analysis-plan.ts` and its tests.
- Create `src/lib/scan-publication.ts` and `src/tests/scan-publication.test.ts`.
- Create a small testable scan-alert payload helper beside the evaluation
  resilience code, with focused tests.

### Required behavior

1. Parse OpenAI JSON with strict top-level and per-row validation. A row is
   usable only when its normalized symbol is expected exactly once,
   `hasLegitimateNews` is boolean, `explanation` is a non-empty string, and
   `specificEvent` is null/absent or a string.
2. Salvage every valid expected row. Quarantine only duplicated, missing, or
   malformed expected symbols. An unexpected extra row is recorded as a
   response anomaly; it does not discard otherwise valid expected rows.
3. A malformed top-level response quarantines all expected symbols without
   throwing out of the caller's batch loop.
4. Implement an atomic JSON run journal with schema version, scan date, unique
   generation ID, generated-at time, optional replay-of generation, stable
   per-symbol task IDs, batch/attempt history, and states sufficient to express
   pending, deferred, quarantined, and resolved work.
5. The journal must persist source evidence snapshots before the provider call,
   then persist the exact prompt, raw response, response/model ID, token usage,
   pricing snapshot, and estimated cost immediately after the provider returns.
   Semantic validation is a later journal transition.
6. Journal registration and retry transitions are idempotent: the same logical
   symbol is not duplicated, attempts are auditable, resolved items stay
   resolved unless explicitly retried, and retry selection accepts only known
   unresolved tasks.
7. Extend deterministic planning so an explicit normalized replay-symbol set is
   selected first within the existing cap, followed by normal risk ranking.
   Report matched and missing replay symbols; preserve exact instrument
   separation such as `BRK.A` versus `BRK.B`.
8. Implement a pure publication evaluator that returns a machine-readable
   publishable decision and reasons. It must reject missing/malformed status,
   date mismatch, any non-completed pipeline/phase state, missing completion
   time, analysis failures/deferrals/unavailable batches, or unresolved
   recovery work.
9. Implement a pure degraded-alert payload builder that includes the scan date,
   generation, affected symbols/counts, cost (including malformed responses),
   recovery file, replay instructions, and workflow URL when supplied.

### Acceptance tests

- One duplicate or malformed expected row quarantines only that symbol while
  valid siblings survive.
- Unexpected extra symbols are visible and degrade the response without
  discarding valid expected rows.
- Malformed JSON quarantines all expected symbols and yields replayable tasks.
- A provider capture is visible on disk with tokens/cost before validation is
  applied.
- Re-register/retry calls remain idempotent and auditable.
- Explicit replay symbols outrank risk ordering without exceeding the cap.
- Every incomplete/degraded scan status is non-publishable; a fully completed
  status with no unresolved work is publishable.
- Alert payloads are actionable and never contain secrets.

## Task 2: Integrate resilient analysis, provenance, replay, alerts, and workflow gating

### Files

- Update `evaluation/scripts/enhanced-daily-pipeline.ts`.
- Update `.github/workflows/enhanced-daily-evaluation.yml`.
- Update focused evaluation tests or add an integration-oriented helper test
  only where the Task 1 unit boundaries do not already prove the behavior.
- Create `docs/operations/scan-recovery.md`.

### Required behavior

1. Create one uniquely named journal per pipeline generation and expose its
   filename/generation/replay metadata in scan status and the daily report.
2. Persist deferred symbols immediately. Before every OpenAI call, persist the
   exact evidence snapshot and pending tasks. Immediately after a response,
   persist usage/cost and raw response before invoking semantic validation.
3. Replace all-or-nothing batch parsing with Task 1 validation. Apply valid
   results, retain quarantined/missing rows as suspicious, and continue through
   every remaining batch. Provider and whole-response failures also queue the
   affected symbols and continue.
4. Metrics must include all provider-returned usage even when validation fails,
   plus quarantine, replay, response-anomaly, and unresolved-task counts.
5. Any deferral, quarantine, provider failure/unavailability, response anomaly,
   missing requested replay target, or unresolved journal task degrades Phase 3
   and the pipeline. No incomplete run may finish with a healthy/completed
   publication state.
6. Accept explicit comma-separated replay symbols and an optional replay-of
   generation from environment variables. Pass GitHub workflow-dispatch inputs
   into those variables and prioritize the symbols within the normal cap.
7. On degraded completion, send the actionable Resend alert from Task 1 when
   configured. Alert delivery failure is logged and leaves the run degraded;
   it does not erase results or provenance.
8. In GitHub Actions, surface validation status as a job output. Upload status,
   journal, and result files to quarantine storage first, then enforce the
   publication gate before any data-repository copy/push. A non-publishable run
   exits nonzero only after recoverable artifacts are retained.
9. Ensure artifact and summary steps run even after the publication gate blocks
   the job. Make the existing failure notification and GitHub issue text
   distinguish `degraded` remediation from a crash and include workflow/replay
   guidance. A degraded job must never trigger the success notification.
10. Document exact manual replay inputs, the new-generation limitation,
    artifact/journal locations, and the rule for clearing remediation.

### Verification

- Focused Jest suites pass with pristine output.
- Evaluation TypeScript compilation passes using the workflow's actual config.
- The workflow is syntactically valid under `actionlint`.
- A fixture/status simulation proves a degraded generation is uploaded for
  recovery but blocked before data-repository publication.

## Task 3: Enforce the publication gate at database ingestion

### Files

- Update `src/lib/admin/ingest-evaluation-core.ts`.
- Expand `src/tests/ingest-evaluation-core.test.ts`.
- Update cron/admin response handling only if needed to surface the existing
  `IngestResult` failure cleanly.

### Required behavior

1. When an enhanced evaluation file exists, fetch the matching
   `scan-status-YYYY-MM-DD.json` and evaluate it with Task 1's publication
   evaluator before any database lookup or write.
2. Missing, unreadable, wrong-date, running, degraded, failed, internally
   inconsistent, or unresolved scan status returns a clear failed
   `IngestResult` with a publication-block reason and performs zero Prisma
   mutations.
3. A completed publishable enhanced scan proceeds through the existing
   idempotent ingestion path unchanged.
4. A legacy `fmp-evaluation` date without enhanced output remains ingestible so
   historical backfill compatibility is not broken.
5. Cron processing continues to other dates after one publication block and
   reports the blocked date as failed rather than processed.

### Acceptance tests

- Degraded and missing scan status cause zero Prisma writes.
- A false `completed` status containing a degraded phase or unresolved recovery
  is rejected.
- A valid completed enhanced scan crosses the gate.
- Legacy ingestion compatibility is preserved.
- Existing pagination and idempotency tests continue to pass.

## Final Verification and Review

After all tasks are reviewed and committed:

1. Run all focused resilience, planning, publication, and ingestion tests.
2. Run the full Jest suite, TypeScript checks, lint, and production build.
3. Run the evaluation TypeScript check used by CI and `actionlint`.
4. Inspect the complete branch diff for secrets, unrelated changes, generated
   artifacts, and accidental production-data/schema mutations.
5. Dispatch an independent strongest-model whole-branch review. Fix all
   Critical and Important findings and re-verify.
6. Commit, push the feature branch, and open a reviewable PR. Do not merge or
   deploy it.
