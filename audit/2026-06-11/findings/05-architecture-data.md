# Findings: Architecture, Data Layer & Performance

Reviewer: principal-engineer audit, 2026-06-11
Scale: src/ = 68,213 LOC (TS/TSX), evaluation/ = 25,669 LOC, 672 tracked files, NO prisma/migrations directory, no vercel.json.

## CRITICAL

### ARCH-C1. `prisma db push --accept-data-loss` in the build path, zero migration history
[Build] package.json:8 + prisma/
- build:with-db-push diff-syncs schema against prod on deploy and silently DROPS columns/tables on rename/type change; env fallback swaps in DIRECT_URL (bypasses pooler); `|| echo` swallows failures (half-applied schema still ships). No migrations/ dir → no rollback, no audit trail, no drift detection. Preview-branch builds can push their schema to the same prod DB.
- FIX: adopt prisma migrate (baseline prod with migrate resolve); migrate deploy as separate release step; delete build:with-db-push.

### ARCH-C2. GitHub-as-database for the entire admin intelligence surface, UNAUTHENTICATED (60 req/h/IP)
[Serverless] src/lib/admin/scan-data.ts:8-45
- fetch api.github.com/repos/$DATA_REPO with no Authorization header; per-instance 5-min _treeCache; all failures return null/[] silently. scan-intelligence/history alone issues 30 sequential Contents-API calls per page load; one admin with two tabs exhausts the hourly budget → dashboards silently render empty. The canonical N+1, over HTTP.
- FIX: ingest pipeline output into Postgres (tables already exist: StockDailySnapshot, DailyScanSummary, SocialScanRun) or read Supabase Storage authenticated; at minimum GITHUB_TOKEN (5,000/h) + Promise.all batching; fetch failures → 502, not fake-empty.

### ARCH-C3. Stock deep-dive route: up to ~20 sequential multi-MB GitHub downloads per request, no maxDuration
[Perf] src/app/api/admin/scan-intelligence/stock/[symbol]/route.ts:25-138
- findStockInPath = fetchPartialArray(path, 3MB) then fetchLargeFile (ENTIRE file, unbounded); looped over 5 dates × 2 paths + second loop over 10 dates re-downloading 3MB each — all serial. Worst case 30-40MB fetched+parsed per lambda invocation → 504s past default timeout.
- FIX: serve per-symbol history from StockDailySnapshot (one indexed SQL query); or per-date symbol index file at pipeline time.

### ARCH-C4. Quota slot consumed before validation, never refunded; "atomic" reservation still races
[DB] src/app/api/check/route.ts:282-299 + src/lib/usage.ts:162-209
- reserveScanSlot before request.json()/zod; 400/503/500 exits never decrement. findUnique → compare → upsert{increment} under READ COMMITTED, no row lock: N concurrent at limit-1 all pass → limit+N-1.
- FIX: validate first; reserve last before work; refund on failure. Atomic: UPDATE ScanUsage SET scanCount=scanCount+1 WHERE userId=$1 AND monthKey=$2 AND scanCount<$3 (updateMany, check count===1) + upsert-on-miss.

## HIGH

### ARCH-H1. ModelMetrics read-modify-write race on every scan; corrupted running averages; first-scan-of-day create race
[DB] src/lib/admin/metrics.ts:124-179 — lose increments; avgProcessingTime permanently corrupted (stale divisor); unique violation → whole logScanHistory silently fails; +2 serial round-trips on hot path. FIX: upsert with increment; store sums, compute averages at read; or derive from ScanHistory.

### ARCH-H2. /api/check hot path: ~8 serial stages, two with unbounded timeouts, inside maxDuration=30
[Perf] route.ts:240-532 — rateLimit (DB read+write) → auth → reserveScanSlot (3-query tx) → checkAlertList (DB + live SEC EDGAR fetch NO timeout) → AI backend (10s) → fetchMarketData (FMP→AV + 200ms sleeps) → computeRiskScore → generateNarrative (OpenAI NO timeout override; SDK default 600s/2 retries) → logScanHistory (3 queries). One slow OpenAI call → 504 AFTER quota burned. sendAPIFailureAlert un-awaited promise racing response return — frozen lambda → alert email frequently never sent.
- FIX: OpenAI({timeout: 8000, maxRetries: 1}); AbortController + cache on SEC fetch; run checkAlertList + AI backend concurrently; logScanHistory + alerts behind waitUntil().

### ARCH-H3. Rate limiting fails open to per-instance in-memory Maps; module-level setInterval in lambdas
[Serverless] src/lib/rate-limit.ts:11-12,151-198,222-227 — DB hiccup → per-instance limits (N instances ≈ N× limit, cold starts reset); auth routes via withRateLimit fail OPEN (/api/check fails closed — good). setInterval never useful on frozen lambdas, no unref(). FIX: Upstash Redis/Vercel KV sliding window; strict/auth tiers fail closed; delete interval.

### ARCH-H4. backfill route: unbounded ScanHistory table scan + per-row upserts inside one interactive transaction (5s default timeout) in a request handler
[DB] metrics.ts:580-723 + admin/backfill/route.ts — throws mid-flight at scale; OOM risk. FIX: set-based INSERT...SELECT...ON CONFLICT via $executeRaw, or script/cron.

### ARCH-H5. Sentry wired but blind: only global-error.tsx captures; every API route swallows into console.error (443 console.* call sites); Sentry wrapper only applied when DSN present AT BUILD TIME (contradicts runtime-env comment in config.ts)
[Serverless] sentry.*.config.ts + next.config.js:23 — production API failures never reach Sentry. FIX: shared route wrapper with Sentry.captureException; onRequestError in instrumentation; DSN as build-time env.

### ARCH-H6. ApiUsageLog: per-call event table, no pruning, no index for its main queries (dayKey predicates can't use [service,dayKey]); same unbounded growth: RateLimitEntry (expired rows never deleted), EmailLog, AuthErrorLog, ScanHistory
[DB] schema.prisma:160-178 + metrics.ts:344-380 — seq scans growing forever; admin api-usage page slows linearly. FIX: @@index([dayKey]); daily retention cron (ApiUsageLog >90d, expired RateLimitEntry, roll up ScanHistory).

### ARCH-H7. Nine GitHub workflows, ZERO CI for the app (no jest/lint/tsc/build on push/PR); tsconfig EXCLUDES evaluation/ so pipeline scripts importing prod code are never type-checked
[Testing] .github/workflows/* + tsconfig.json:26 — regressions reach Vercel as first detection, where the build also mutates prod DB (ARCH-C1). FIX: ci.yml: install → prisma generate → tsc (app + evaluation) → jest → next build; block merges.

### ARCH-H8. src/lib/social-scan vs evaluation/scripts/social-scan: forked implementations, no canonical owner
[Structure] platform-patterns.ts BYTE-IDENTICAL in both trees (27,006 bytes); types.ts diverged (618 vs 593 lines); scanners.ts (47KB single file) re-implements evaluation's 6 scanner modules; near-duplicate orchestrators (runSocialScanAndStore vs runSocialScan, each with own aggregateResults). Core scam-detection heuristics drift silently between prod scanner and nightly pipeline → corrupts model-efficacy comparisons. FIX: single package; evaluation imports it; delete fork.

### ARCH-H9. evaluation/scripts: 8 run-evaluation-* variants + 3 social-scanner generations + 3 dated watchdog shell scripts — versioning-by-filename
[Structure] run-evaluation.ts (1,119) / -live (1,164; 560 lines identical) / -finnhub{,-free,-curl} (558/457/458) / -fmp{,-dated,-robust} (566/522/488; 49% identical pairs), all superseded by enhanced-daily-pipeline.ts — a 2,814-line 99KB single-file monolith, the only one CI runs. real-social-scanner (1,075) vs real-time-social-scanner (890; 279 shared) vs social-media-scan (539). ~5,300 lines dead/duplicate (~70% of evaluation/scripts). FIX: decompose enhanced-daily-pipeline into modules; attic then delete variants.

## MEDIUM

### ARCH-M1. Module-level circuit breakers per-lambda (each cold instance starts CLOSED and re-hammers failing FMP); same for marketData 1,000-entry LRU and scan-data _treeCache (circuit-breaker.ts:88-93)
### ARCH-M2. Schema type/constraint flaws: money as Float (ApiUsageLog.estimatedCost, ApiCostAlert.threshold, IntegrationConfig.monthlyBudget, all prices); JSON-in-String @db.Text everywhere while PrePumpWatchlist uses native Json + breaks conventions (uuid, @@map) and is never read by the app; free-text FKs with no relation (ScanHistory.userId, SupportTicket.userId, EmailLog.relatedTicketId, PromoterStockLink.schemeId, BrowserAgentSession.scanRunId) → no referential integrity, orphans
### ARCH-M3. ~9 redundant indexes (@@index duplicating @@unique on AdminUser.email, tokens, ScanUsage, etc. — write amplification on hottest tables); missing composite ScanHistory(userId, createdAt DESC) and (createdAt, ticker)
### ARCH-M4. Segment efficacy: 18 parallel aggregate queries per request vs Prisma pool ~3 → queueing; dashboard groupBy materializes every active userId to take .length; api-usage GET runs write-bearing alert evaluation; no admin-aggregate caching (metrics.ts:746-788, 215; api-usage route) — FIX: single groupBy pivot, COUNT(DISTINCT), cron alerts, 60s cache
### ARCH-M5. scan-intelligence/stocks: fake pagination re-downloads 2MB per page flip; fetchPartialArray "repairs" truncated JSON via text.lastIndexOf("},") — can corrupt records, page totals lie (stocks/route.ts:58-122, scan-data.ts:117-143)
### ARCH-M6. market-analysis route: 4 independent queries serial; no select → Text blobs over-fetched; same pattern in schemes + scan-intelligence prev-date block
### ARCH-M7. Pooler config left to chance: .env.example shows :5432 direct for DATABASE_URL and DIRECT_URL identical; no pgbouncer/connection_limit guidance; auth.ts:111 has special "too many clients" log (it has happened) — FIX: pooler URL + connection_limit=1, startup assertion
### ARCH-M8. Root clutter: `Untitled` (saved AI prompt) tracked; plan.md AND PLAN.md byte-identical both tracked (breaks case-insensitive checkouts); check-db.js duplicated root+scripts; test-scanner.ts root DIVERGED from scripts/; 10 status/audit MDs at root; 8.8MB public/evaluation-data shipped every deploy
### ARCH-M9. scamdunk-history-db/: dead embedded subproject, own Prisma schema with 7 models semantically duplicating main schema under different names; nothing references it
### ARCH-M10. Tests don't test the risky code: 4 files/1,332 lines; e2e.test.ts misnamed (unit tests over mocks); rate-limit.test.ts asserts static config constants; zero coverage of usage/quota, routes, admin auth, scan-data JSON repair; tsconfig strict:false; jest testMatch would pick up future evaluation .test.ts
### ARCH-M11. `rm -rf .next` in standard build deletes Vercel's restored build cache → every deploy cold full compile
### ARCH-M12. api-response.ts envelope defined then ignored: ~100 routes hand-roll divergent shapes; admin scan-status/pipeline-health return {available:false} with HTTP 200 on failure (clients can't distinguish outage from empty); 443 raw console.* no request IDs — FIX: withApiHandler wrapper (also fixes ARCH-H5)
### ARCH-M13. delete-account + admin user delete: six sequential deleteMany, non-transactional, duplicating schema cascades; partial failure → half-deleted users

## LOW

### ARCH-L1. getCurrentMonthKey() uses server-local time not UTC (config.ts:225-230) — quota boundary shifts by TZ
### ARCH-L2. checkSECFeed substring match + uncached untimed external fetch per scan (marketData.ts:920-931)
### ARCH-L3. Inconsistent client-IP derivation: check route logs XFF[0]; rate limiter trusts x-real-ip first (route.ts:480-483 vs rate-limit.ts:62-83)
### ARCH-L4. Session.userId / Account.userId FK columns lack indexes (Postgres doesn't auto-index FKs)
### ARCH-L5. Overlapping prior audit docs at root with no disposition; schema TODO (plaintext OAuth tokens) still open

## Top 5 most expensive queries
1. backfillAdminMetrics — full ScanHistory into memory + hundreds of upserts in 5s-budget interactive tx.
2. Stock deep-dive GitHub scan — ~20 sequential HTTP fetches/30MB+ per request.
3. getApiUsageSummary groupBys — unindexed dayKey predicates over unpruned per-call event table.
4. Dashboard activeUsers groupBy — materializes every distinct userId to take .length.
5. getModelEfficacyMetrics topTickers — groupBy ticker over date range with no (createdAt,ticker) index + ILIKE contains without pg_trgm.

## What breaks first at 10× traffic
(1) GitHub 60 req/h — admin intelligence dark in minutes; (2) Postgres connections (rate-limit 2 writes/request + interactive txs + 18-query bursts) → too many clients on /api/check; (3) /api/check 30s budget (untimed OpenAI+SEC) → 504s burning quota; (4) ApiUsageLog/ScanHistory seq scans → linear admin latency; (5) quota race overage.

## Target architecture (summary)
Postgres as single source of truth (pipeline upserts into existing tables; delete scan-data.ts GitHub layer). prisma migrate baseline + migrate deploy as release step; delete build:with-db-push + rm -rf .next; CI gating merges (tsc app+evaluation, jest, build). One social-scan library under src/lib consumed by API + evaluation. One withApiHandler wrapper (auth, rate limit, error envelope, request-id logs, Sentry). Upstash/KV for rate limiting (fail closed on auth tiers), breaker state, admin aggregate cache (60s), market-data cache. Quota: validate→reserve atomically→refund. Hard timeouts on every external call; parallelize independent stages; waitUntil for post-response work. Index fixes + Decimal money + native Json + real FKs with onDelete via staged migrations. Daily retention cron. Sequence: wk1 migrations+CI+build fixes; wk2-3 Postgres admin routes + KV + /api/check hardening; wk4 consolidation + schema migrations + retention/caching.
