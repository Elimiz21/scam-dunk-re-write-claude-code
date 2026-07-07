# ScamDunk — Fail-Safe Implementation Plan

**Companion to `FULL-CODE-REVIEW.md`.** This sequences every fix so that (a) the most dangerous, lowest-risk items land first, (b) a safety net exists *before* any logic changes, and (c) each step is independently verifiable and reversible. The organizing rule: **never change risk-scoring or data logic until there's a test that proves the change is correct.**

## Guiding principles (how we avoid new bugs)

1. **One logical change per commit/PR.** Small diffs are reviewable and revertible. Use this doc's IDs (P0-1, D3, …) in commit messages.
2. **Test before touch on money paths.** Before editing `ingest-evaluation-core.ts`, alert generation, or scoring, write a characterization test that captures *current* correct behavior, then change code and watch it stay green.
3. **Schema/data changes go through a branch DB first.** Use a Supabase branch or a restored snapshot; run the Prisma migration + backfill there, verify counts, then apply to prod.
4. **Deploy to a Vercel preview, verify, then promote.** Every phase has a concrete "verify" check on preview before production.
5. **Backups before destructive data ops.** Any `DELETE`/`TRUNCATE`/bulk-update is preceded by an export and a dry-run `SELECT count(*)`.
6. **Feature-flag risky behavior swaps** (e.g. the scoring-engine unification) so you can flip back without a redeploy.

---

## Phase 0 — Contain the bleeding (Day 1, ~2–3 hours)

External/dashboard actions and one-line safety fixes. No logic risk. Do these **today**, in this order.

### 0.1 Rotate the three leaked credentials 🔴 (dashboard only — you must do this)
- **Supabase DB password** — Supabase → Project Settings → Database → Reset password. Update `DATABASE_URL` + `DIRECT_URL` in Vercel and Railway. (`audit/2026-06-11/findings/04-security.md:10`)
- **FMP API key** — regenerate at financialmodelingprep.com; update `FMP_API_KEY` in Vercel + the GitHub Actions secret. (`evaluation/scripts/watchdog-scan*.sh`)
- **OpenAI key** — rotate at platform.openai.com; update `OPENAI_API_KEY`. (`evaluation/BRANCH_STATUS.md:148`)
- **Verify:** app still loads (redeploy), a manual scan works, the nightly pipeline's next run succeeds.

### 0.2 Close the public database hole 🔴 (P0-1)
**Verified safe:** the anon key is used only for Storage from server routes; no table is read via `supabase.from()`. Prisma connects as the owner and bypasses RLS. So this cannot break the app.
- On a Supabase **branch** first, run for every table in `public`:
  `ALTER TABLE "public"."<T>" ENABLE ROW LEVEL SECURITY;` (deny-all with no policy) **and** `REVOKE ALL ON "public"."<T>" FROM anon, authenticated;`
- Tighten the `evaluation-data` storage bucket: remove the broad listing policies; keep only object-read-by-URL if needed (or make it private and sign URLs).
- **Verify on the branch:** with the anon key, `curl https://<proj>.supabase.co/rest/v1/AdminSession?select=*` returns `[]`/permission-denied (not rows). Prisma-backed pages still work. Then apply to prod.
- **Rollback:** re-`GRANT` (instant). Because the app doesn't depend on these grants, rollback should never be needed.

### 0.3 Restore cron auth 🔴 (P0-3 / R1)
- `src/app/api/cron/ingest-evaluation/route.ts`: add at the top of `GET`:
  `if (request.headers.get("authorization") !== \`Bearer ${process.env.CRON_SECRET}\`) return NextResponse.json({error:"Unauthorized"},{status:401});`
- Set `CRON_SECRET` in Vercel (Vercel injects the header for scheduled invocations).
- **Verify on preview:** unauthenticated GET → 401; the scheduled cron still runs (check logs next morning, or trigger with the header manually).

### 0.4 Purge secrets from git history (after 0.1)
- `git filter-repo --path audit/2026-06-11/findings/04-security.md --path evaluation/scripts/watchdog-scan.sh --invert-paths` (or redact in place), force-push, rotate anything still exposed. Coordinate — this rewrites history.
- Delete any `preview@scamdunk.com` OWNER row from prod; confirm `PREVIEW_ADMIN_PASSWORD` is unset in production.

**Phase 0 exit criteria:** no live credential in the repo; anon key can't read tables; cron requires a secret. None of these touch application logic.

---

## Phase 1 — Build the safety net (Days 2–3)

Do this **before** any logic fix so later phases are verifiable.

### 1.1 Fix the test harness
- Add to `jest.config.js`: `testPathIgnorePatterns: ["/node_modules/", "/.claude/worktrees/"]` (stops haste-map collisions).
- Investigate the leaked handle (likely a module-level timer or Prisma client) and the one flaky 5s scoring test (raise its timeout or de-parallelize).
- **Verify:** `npx jest` green and exits cleanly.

### 1.2 Characterization tests on the money paths (no behavior change yet)
Write tests capturing *current correct* behavior for the code Phases 2–3 will modify:
- `ingest-evaluation-core.ts`: snapshot upsert idempotency; alert creation for a HIGH stock.
- Alert generation: given two snapshots, what alerts result (this test will be *updated* in Phase 3 to encode the new stateful logic — that's the point).
- Scoring contract: a cross-repo test that posts the **exact** `/api/check` request body to a locally-run Python `/analyze` and asserts 200 (this **fails today** — it encodes the P0-4 bug and will pass after Phase 2).
- **Verify:** all green except the intentionally-red P0-4 contract test.

### 1.3 Turn on the compiler's null checking incrementally (Q2)
- Set `"strictNullChecks": true` in `tsconfig.json`; run `tsc --noEmit`; fix the surfaced nulls **file by file** (expect a bounded list). If too large to do at once, use a `tsconfig.strict.json` covering `src/lib/admin`, `src/lib/scoring`, `src/lib/billing` first and ratchet outward.
- **Verify:** `tsc --noEmit` clean; CI green. This alone will prevent a whole class of the NULL bugs found in this review.

### 1.4 Provision a safe place to test data changes
- Create a Supabase branch (or restore a snapshot to a scratch project). This is where Phase 3's migrations + backfills run first.

**Phase 1 exit criteria:** clean, trustworthy test run; null-safety on the critical libs; a branch DB ready.

---

## Phase 2 — Make the AI engine actually run (Day 4)

Small, now-tested changes. Fixes P0-4, P0-6, A3, A4.

### 2.1 Fix the request contract (P0-4)
- Python `api_server.py:145`: `news_flag: Optional[bool] = False`; coalesce `None`→`False` in the handler.
- TS `check/route.ts:161`: send `news_flag: newsFlag ?? false`.
- **Verify:** the Phase-1.2 contract test now passes; deploy to preview; run a real scan; confirm the response carries the "powered by AI models" path and `ScanHistory.usedAiBackend = true`.

### 2.2 Fix the None-fundamentals crash (P0-6)
- `feature_engineering.py:313-336`: coalesce `market_cap`/`avg_volume`/`float_shares`/`exchange` before arithmetic.
- Add a pytest that feeds a `None`-valued fundamentals dict through `create_feature_vector` → `analyze`.
- **Verify:** pytest green; on preview, scan a known OTC micro-cap (e.g. one of the flagged shells) → 200, not 500.

### 2.3 Fix the secondary health gate (A3) and INSUFFICIENT handling (A4)
- `ai-analyze/route.ts:148`: gate on `data.status`/`data.ready`, not `rf_ready && lstm_ready`.
- `check/route.ts:396`: stop coercing Python `INSUFFICIENT` to `LOW` — surface it as its own state (or MEDIUM), never LOW.
- **Verify:** a thin-history ticker shows INSUFFICIENT, not LOW.

### 2.4 Observability so this can't silently regress
- Log the fallback `failReason` into `ScanHistory` (not just console). Alert when `usedAiBackend` rate is 0 over N scans while `/health` is green.
- **Verify:** admin model-efficacy page shows a non-zero AI-backend share.

**Phase 2 exit criteria:** production scans use the Python engine; OTC tickers don't 500; the AI-vs-fallback split is visible.

---

## Phase 3 — Fix the data pipeline & alerts (Days 5–8, the big one)

Fixes P0-5, D1–D9. Do the **generation** fixes before the **cleanup**, and run every data op on the branch DB first.

### 3.1 Refresh & maintain the stock universe (D2)
- Add a step to `enhanced-daily-evaluation.yml` that regenerates `evaluation/data/us-stocks.json` (run `fetch-us-stocks.ts`) on a schedule; mark delisted tickers.
- **Verify:** the new file's ticker count differs from 6,970; `DailyScanSummary.evaluated` stops being constant.

### 3.2 Add a data-freshness gate (D2)
- In the pipeline's fetch path, skip/flag any ticker whose newest EOD bar is older than ~5 trading days; count it into `skippedNoData` instead of scoring it HIGH.
- **Verify (branch):** re-run the pipeline for one date; a known dead March ticker is now skipped, not flagged HIGH.

### 3.3 Make alert generation stateful (D1 — the core fix)
- In `ingest-evaluation-core.ts` Step 7: for each HIGH stock, `findFirst` the most recent snapshot with `scanDate < current` (gap/weekend-safe). Populate `previousRiskLevel`/`previousScore`. Create `NEW_HIGH_RISK` **only** when the previous level wasn't HIGH; emit `RISK_INCREASED` on score jumps, `RISK_DECREASED` etc.
- Pass `isFiltered` through the `EvaluationStock` interface and skip filtered (news-explained/large-cap) stocks.
- Update the Phase-1.2 alert test to encode this new behavior.
- **Verify (branch):** ingest two consecutive dates; a stock HIGH on both produces **one** alert (on first HIGH), not two.

### 3.4 Add the missing unique constraint (D3) — *after* de-duping
- On the branch DB: de-dupe existing alerts (keep min(id) per `(stockId, alertDate, alertType)`), then the Prisma migration `@@unique([stockId, alertDate, alertType])` will apply cleanly. (If you add the constraint before de-duping, the migration fails.)
- **Verify:** duplicate query returns 0 rows; `createMany({skipDuplicates})` now actually dedupes.

### 3.5 Fix field mappings & flags (D6, D7)
- Either emit `priceChangePct`/`volumeRatio`/`previousClose`/`volume`/`signalSummary` from the pipeline (FMP profile has `changePercentage`/`volume`; history has previous close) **or** compute them in ingest from the previous snapshot. Remove the dead interface fields if you won't populate them.
- Derive `isLegitimate` from `riskLevel`/`isFiltered` instead of defaulting to `true`.
- **Verify:** new snapshots have non-NULL price/volume; market-analysis renders real price changes.

### 3.6 Fix storage listing + UTC (D4, D9)
- Paginate the storage `list()` or filter by `enhanced-evaluation-` prefix so newest files are never truncated.
- `new Date(date + "T00:00:00Z")` for scanDate normalization.
- **Verify:** ingestion still picks up the latest date with >500 objects in the bucket.

### 3.7 One-time historical cleanup (destructive — branch + backup first)
- Export `StockRiskAlert` to storage. Dry-run counts. Then delete the redundant `NEW_HIGH_RISK` alerts that merely repeat a prior day's HIGH (or bulk-acknowledge everything with `alertDate <` the latest ingest). Batch in chunks; verify counts between batches.
- **Verify:** the risk-alerts page shows a sane number of genuinely-new alerts.

### 3.8 Display staleness (U6)
- Include each alert's underlying latest `scanDate` in the GET payload; render it per row; banner when the latest ingested date lags today.
- **Verify:** an alert on a stale stock visibly shows its old data date.

**Phase 3 exit criteria:** alerts fire only on real risk *transitions*; no duplicates; universe refreshes; snapshots carry price/volume; old noise cleared.

---

## Phase 4 — Fix social scans (Days 9–11)

Fixes S1–S7.

### 4.1 Move the scan out of the request path (S1, S2 — root cause of timeouts)
- The GitHub runner already has all API keys. Run the scan **there** and POST results to the existing, currently-unused `/api/admin/social-scan/ingest` route with a stable `scanId` (it's already zod-validated, timing-safe, idempotent). Have the Vercel route return `202` and stop doing the work inline. Remove the pipeline's local-fallback re-scan.
- **Verify:** a heavy 50-ticker run completes without TIMED_OUT; no double-spend on Serper/Perplexity.

### 4.2 Cross-run dedup + date filter (S4, S5)
- Skip mentions whose `contentHash` was seen in the last N days (global first-seen table, or `@@unique([ticker, contentHash])` + a per-run join). Add a `postDate < now-7d` floor in `buildMentionRow` and per scanner (StockTwits especially has none).
- **Verify:** re-running the same day doesn't inflate `totalMentions`; no 2023-dated posts stored as fresh.

### 4.3 Make Discord (and YouTube) honest (S3)
- Count `channelsRead`/`messagesWithContent`; return `success:false` with a specific error when content is empty despite messages read (missing Message Content intent) or channel reads 403 (missing permission). Surface counts in `platformsUsed.stats`.
- Fix the actual Discord config: enable the Message Content intent in the Developer Portal; grant View Channel + Read Message History.
- **Verify:** Discord either returns real mentions or a clear error — never silent 0-with-success.

### 4.4 UI + robustness (S6, S7)
- Guard the `JSON.parse` of `engagement`/`redFlags` per-field; return 500 (not empty 200) on real failure.
- Add a red `TIMED_OUT` badge.

**Phase 4 exit criteria:** scans don't time out, don't double-spend, don't re-store old posts, and Discord's status is truthful.

---

## Phase 5 — Dashboard & API correctness (Days 12–14)

Fixes U1–U9, R3–R9.

- **U2/R2 Admin invite (P1):** add `/api/admin/team/invite` to `ADMIN_PUBLIC_PATHS`; return `{success, email}` from the PUT so auto-login works. **Verify:** an invited admin can complete signup end-to-end.
- **U1 Browser agents:** either wire a real consumer (a `workflow_dispatch` to the browser-agent Action) or remove the "Run Scan" button and the PENDING stat and label it "runs on schedule." Stop counting PENDING as Running. **Verify:** no phantom "Running" sessions.
- **R3 Swallow-200:** in `social-scan` and `support` GETs, return 500 (or an `error` field) on genuine failure instead of empty 200; whitelist `sortBy`/`sortOrder`. **Verify:** a forced DB error shows an error state, not "0 results."
- **R4 Entitlement expiry:** add a daily cron that downgrades `plan=PAID` rows whose `subscriptionExpiresAt < now`; update expiry on PayPal/Apple renewal events. **Verify:** a lapsed sub downgrades.
- **U3/U4 API-usage alerts:** schedule `checkAndTriggerAlerts()` (cron) or derive row status from `triggeredAlerts`; fix the service dropdown to `OPENAI/FMP/COINGECKO/ALPHA_VANTAGE`.
- **R6 Param validation:** clamp `parseInt` query params across the ~11 list routes (copy the `users` route pattern).
- **R7/R8/R9:** purge `RateLimitEntry` in the token-cleanup job; add a cooldown to `sendAPIFailureAlert`; add a mail-loop guard to `inbound-email`.
- **U7:** gate team controls on `session.role`.

**Phase 5 exit criteria:** invites work; no facade buttons; failures are visible; billing entitlements enforced.

---

## Phase 6 — Architecture & hygiene (ongoing, lower urgency)

- **Q1 Unify the scoring engine (P1):** make the pipeline import `src/lib/scoring/engine.ts` (or extract a shared package) and delete `standalone-scorer.ts`. Do this behind a flag and diff old-vs-new scores on a sample before switching. **This removes the risk of two divergent risk engines.**
- **Q3 De-duplicate** `platform-patterns.ts` / `types.ts` into one shared module.
- **D8/R7 Retention:** scheduled prune (or partition) for `StockDailySnapshot`, `StockRiskAlert`, `SocialMention`, `ApiUsageLog`, `RateLimitEntry`.
- **Q5 Stop committing generated data:** move `evaluation/results/*.json` and `public/evaluation-data/` to the data repo/Storage; gitignore them.
- **Q6 Fix `.env.example`:** remove Stripe/`PREVIEW_ADMIN_ENABLED`; add the ~50 real vars (PayPal, JWT, ADMIN_SETUP_KEY, SOCIAL_SCAN_*, CRON_SECRET, etc.).
- **Q7 Archive dead weight:** the 13 root plan docs → `docs/archive/`; delete the 7 dead `run-evaluation-*` + 2 `run-social-scan-*` + duplicated `test-scanner.ts`; drop committed audit PDFs/HTML.
- **Q8 Backfill tests** on `ingest-evaluation-core`, alert gen, `orchestrate`, admin auth; add coverage thresholds.
- **Python cleanup:** move root `test_*`/`threshold_research_*` out of the package; migrate `@app.on_event` → lifespan; bump `gunicorn>=23`, `python-multipart>=0.0.18`.
- **Dependencies:** `npm update` to latest 14.2.x (or 15.x) for the `next`/`undici`/`form-data` HIGH advisories.

---

## Suggested sequencing at a glance

| Phase | Theme | Risk | Blocking? |
|---|---|---|---|
| 0 | Secrets, RLS, cron auth | None (external/one-line) | **Do today** |
| 1 | Test harness, strictNullChecks, branch DB | None (safety net) | Blocks 2–3 |
| 2 | AI engine contract | Low (tested) | — |
| 3 | Pipeline & alerts | Medium (data ops) | Needs Phase 1 |
| 4 | Social scans | Medium | — |
| 5 | Dashboard & API | Low | — |
| 6 | Architecture & hygiene | Low, ongoing | — |

**Do not skip Phase 1.** It is the difference between "fixed it" and "fixed it without breaking three other things." Every subsequent phase's "Verify" step depends on a trustworthy test run and a branch DB.
