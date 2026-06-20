# ScamDunk Remediation Roadmap

**Date:** 2026-06-11 · **Source:** Full-codebase audit (see `ScamDunk-Code-Audit-2026-06-11.html/.pdf` and `findings/*.md` for every item with file:line evidence)

This roadmap sequences ~150 findings into 6 phases. Each item lists the finding IDs it resolves (TS-* = TypeScript scoring, PY-* = Python AI, SOC-* = social scan, SEC-* = security, ARCH-* = architecture/data, UI-*/ED-* = frontend/admin). Effort: S < ½ day · M = ½–2 days · L = 3–5 days · XL = 1–2 weeks.

---

## Phase 0 — EMERGENCY (do today, ~2 hours)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 0.1 | **Rotate the Supabase production DB password** (Supabase dashboard → Settings → Database). The current password is committed in `scripts/query-blogs-pg.mjs:6` and in git history. After rotating, update Vercel/GitHub env vars. Audit DB logs for unfamiliar connections. | SEC-C1 | S |
| 0.2 | Replace the hardcoded connection string with `process.env.DATABASE_URL` in `scripts/query-blogs-pg.mjs` (mirror `query-blogs.mjs`). Plan a git-history purge (`git filter-repo`) when convenient — rotation is what actually closes the hole. | SEC-C1 | S |
| 0.3 | **Delete the `preview@scamdunk.com` OWNER admin row from the production DB** if present; set a strong `PREVIEW_ADMIN_PASSWORD`; make `preview-login` fail when the env var is unset. | SEC-H5 | S |
| 0.4 | **Cancel the Apify subscription.** Apify is not referenced anywhere in this codebase (verified across source, lockfile, workflows, git history). It is orphaned spend. | SOC (cost) | S |
| 0.5 | Set `AI_API_SECRET` on the Railway Python service and verify it refuses unauthenticated requests; switch the comparison to `secrets.compare_digest`. | PY-H1 | S |

## Phase 1 — Stop the bleeding (week 1)

### 1A. Billing & quota integrity
| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 1.1 | `/api/ai-analyze`: call `reserveScanSlot()` before work (429 when exhausted); add to middleware matcher. Closes the free-unlimited-scans hole. | SEC-H1, TS-M12 | S |
| 1.2 | Apple receipts: enforce uniqueness of `original_transaction_id` across users; persist entitlement with `expiresAt`; downgrade on expiry (App Store Server Notifications later). | SEC-H2 | M |
| 1.3 | `/api/check`: validate request body BEFORE `reserveScanSlot`; refund the slot on 5xx; make reservation atomic (`updateMany ... WHERE scanCount < limit`, check `count===1`). | ARCH-C4, TS-M13 | M |
| 1.4 | Account deletion: call `cancelSubscription(userId)` directly instead of the unauthenticated self-fetch that 401s — users currently keep being billed after deleting their account. | SEC-L5 | S |

### 1B. Auth hardening
| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 1.5 | Rate-limit + Turnstile the NextAuth web credentials login (strict tier, IP+email key); add lockout/backoff. | SEC-H4 | M |
| 1.6 | Require Turnstile token on forgot-password (currently optional → skip = bypass). | SEC-M2 | S |
| 1.7 | Normalize email (lowercase+trim) in web register — MixedCase registrants currently can never log in. | SEC-M1 | S |
| 1.8 | HTML-escape all user input interpolated into transactional emails (`src/lib/email.ts`); stop echoing user subject/name into the confirmation email. | SEC-H3 | S |
| 1.9 | Add security headers in `next.config.js`: CSP (report-only first), `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. | SEC-M4 | M |

### 1C. Deploy-pipeline safety
| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 1.10 | **Adopt `prisma migrate`**: baseline prod (`migrate resolve`), run `migrate deploy` as a release step, DELETE `build:with-db-push` (`db push --accept-data-loss` must never run in a build). Remove `rm -rf .next` from the build script. | ARCH-C1, ARCH-M11 | M |
| 1.11 | Add `ci.yml`: install → `prisma generate` → `tsc --noEmit` (app + evaluation tsconfig) → `jest` → `next build`. Block merges on it. Fix the 10 existing type errors in `src/tests/e2e.test.ts`. | ARCH-H7 | M |
| 1.12 | `npm audit fix` (handlebars critical, undici/xmldom high, etc.); bump Python pins (gunicorn 22+, requests, fastapi, tensorflow) and add `pip-audit`. | dep audits, PY-M1 | S |

## Phase 2 — Make scoring trustworthy (weeks 2–3) ← the "AI engines not working" fix

### 2A. One scoring engine (highest-leverage item in this roadmap)
| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 2.1 | Extract pure scoring functions from `src/lib/scoring.ts` into a dependency-free module imported by BOTH the app and `evaluation/` (delete `standalone-scorer.ts` drift). All calibration to date was measured on a different engine than production runs. | TS-C7, ARCH-H8/H9 (partial) | L |
| 2.2 | De-duplicate correlated signals: take max of price-spike family (SPIKE_7D/SPIKE_3D/PRICE_ANOMALY/EXTREME_SURGE/PRICE_ACCELERATION) and max of volume family; add magnitude floors to acceleration signals; re-derive HIGH/MEDIUM cutoffs on the labeled efficacy set. This is the over-flagging fix (every OTC stock currently reads HIGH). | TS-C1, PY-H3 | L |
| 2.3 | Treat missing data as UNKNOWN, not zero: skip structural signals when price/marketCap/liquidity are absent (stop fabricating +6 → false HIGH); add a `dataCompleteness`/confidence field surfaced in the response and narrative; return INSUFFICIENT when history < 30 rows instead of silently scoring structure-only (stop false LOWs). | TS-H1, TS-H2, TS-M14, PY-H8 | M |
| 2.4 | Fix the SEC/regulatory layer: remove the substring `checkSECFeed` (false auto-HIGHs / dead check); use SEC's structured suspension data with proper User-Agent; parse tickers only from explicit patterns; alert when a sync ingests zero entries; run `checkAlertList` unconditionally (suspended stocks must come back HIGH, not INSUFFICIENT) and pass `secFlagged` into the TS fallback. | TS-C3, TS-C6, TS-H8 | M |
| 2.5 | Fix structured-signal plumbing: `runAnomalyDetection` returns `{code, severity, value}` (prose-string matching currently drops signals); interpolate real measured percentages into descriptions (SPIKE_THEN_DROP claims 50%/40%, triggers at 25%/20%); fix RSI flat-series→50; exclude spike days from volume baselines; widen z-score window to last 5–7 days with ≥2.5σ cutoff (stops day-to-day score flapping). | TS-H3, TS-H4, TS-M1–M4 | M |
| 2.6 | Coherence invariants: `isLegitimate=false` whenever riskLevel ≠ LOW (no more "HIGH risk + well-established company, tone reassuring" narratives); compute isLegitimate from market data in BOTH the AI and TS paths; derive the displayed level from the displayed score. | TS-H6, TS-H9 | S |
| 2.7 | Crypto: route by explicit assetType (SOL/APT/LINK are NYSE stocks, currently scored as crypto!); cache key `${assetType}:${ticker}`; use CoinGecko `/market_chart` daily (the OHLC 4-day candles silently disable ALL pattern detection); dedicated CRYPTO thresholds instead of `isOTC:true` for BTC. | TS-C4, TS-C5, PY-H9 | M |
| 2.8 | Map the already-fetched OTC/FINRA intelligence into graded signals (CAVEAT_EMPTOR +5, SHELL +3, PROMOTED +3, Pink No-Info +2) — the most discriminative data the app pays for is currently discarded. | TS-M11 | M |

### 2B. Python AI service — make the ML real or honest
| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 2.9 | **Fix the RF feature contract**: serving emits 49 features, model trained on 35 → RF probability is hard-zero on EVERY request and the service retrains synthetically per request. Single shared feature-name constant, startup assertion, never train in the request path. | PY-C1, PY-H2 | M |
| 2.10 | Fix OTC detection for yfinance codes (`PNK`/`OQX`/`OQB`) — OTC signals/thresholds/floors are currently dead for exactly the stocks the product targets. Regression test with real exchange strings. | PY-C4 | S |
| 2.11 | Remove the synthetic-fundamentals fallback (yfinance `.info` failure currently fabricates a RANDOM $0.5–50B market cap on a major exchange). Fail explicit with `data_available:false`. | PY-C3 | S |
| 2.12 | Upgrade yfinance + cache market data; on backend 503 fall back to TS scoring instead of returning "scanning system offline" to the user; re-throw `ServiceUnavailableError` correctly (the 503/admin-alert path is currently dead code in both routes); validate the backend payload with zod (NaN scores, unknown risk levels currently pass through). | PY-C6, TS-C2, TS-H7 | M |
| 2.13 | Rebalance the latency budget: remove per-request retrain (2.9), cache yfinance, move HIGH-risk news verification out of the synchronous path, pre-warm models, raise the TS client timeout to ~20s; health-check `/health` (with model readiness) instead of `/`. | PY-C5, PY-M2 | M |
| 2.14 | Retrain or DISABLE the LSTM until real labeled training data exists (it was trained on synthetic absolute prices and emits noise); if kept, use scale-invariant features only. Fix `news_flag=False` hardcode. Replace the fake SEC stub (8 demo tickers, substring match) — proxy the TS regulatory check; pass `sec_flagged` from ai-analyze. Align `model_hashes.json` keys and fail-closed in production. | PY-C2, PY-H4, PY-H5, PY-H7 | L |
| 2.15 | Bound batch endpoints (`Field(max_length=50)`), TTL-cache the CIK map, bound the FTD cache, fix `.env` override of real env vars, add `.dockerignore`. | PY-H6, PY-M12 | S |
| 2.16 | LLM hygiene: OpenAI client `{timeout: 8s, maxRetries: 1, max_tokens: ~700}` (a slow narrative call currently 504s the whole scan AFTER quota is burned); cache narratives on (ticker, level, signal codes); fire-and-forget metrics writes; sanitize user-supplied companyName/pitch text in prompts (prompt-injection → "verified safe" screenshots). | TS-M7–M9, ARCH-H2 (partial) | M |

## Phase 3 — Stabilize & de-cost the social scans (weeks 3–4)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 3.1 | **Make the scan asynchronous**: POST returns 202 + scanRunId; execution moves out of the 300s request handler (GH Actions job calling the ingest route, or queue/cron); write mentions incrementally per scanner; admin UI polls GET. Kills the #1 instability (killed function = total loss) AND the #1 cost leak (pipeline fallback re-scans the same 50 tickers while the API run is still spending). | SOC-C2, SOC-CO2, SOC-L1 | L |
| 3.2 | Fix scanner time budgets: per-ticker streaming or chunking (10/invocation); Reddit needs ≥125s of sleep vs a 120s cap today, so it ALWAYS times out and all partial results are discarded; per-request `AbortSignal.timeout(10s)` on every fetch; thread an AbortController through scanners so timed-out work actually stops (paid Perplexity calls currently continue after being discarded); honor Retry-After on 429s. | SOC-C1, SOC-H1, SOC-H2, SOC-M1 | L |
| 3.3 | Reddit via OAuth (60 req/min authenticated) or drop direct Reddit on serverless (datacenter IPs are blocked — the scanner burns 2 minutes for nothing nearly every run) and rely on Serper `site:reddit.com`. | SOC-H3 | M |
| 3.4 | Dedup + idempotency: `@@unique([ticker,url,scanRunId])` on SocialMention (skipDuplicates is currently a no-op), content-hash for URL-less mentions, cross-run seen-URL set (skip re-screening yesterday's posts); ingest route → `createMany`, `maxDuration`, zod. | SOC-H4, SOC-H5, SOC-CO6 | M |
| 3.5 | Cost cuts: Serper `num:10` + one merged query + top-20 tickers (−75–85%); tier Perplexity to only pattern-flagged tickers (−60–80%); global dedup before AI screening; concurrency guard on POST (no double scans); YouTube quota guard. | SOC-CO1, SOC-CO3, SOC-CO4, SOC-CO7, SOC-M3 | M |
| 3.6 | Attribution quality: word-boundary `\b\$?TICKER\b` matching (require cashtag for ≤3-char tickers — "YJ" currently matches arbitrary text); longest-match-wins patterns; drop generic LOW patterns and mainstream subreddits; exclude "unknown" authors from promoter aggregation (the current #1 promoter is literally `unknown@Reddit`). | SOC-R1, SOC-CO5, SOC-R5 | M |
| 3.7 | AI screener: `response_format: json_object`, batches of 10, client timeout, retry truncated batches (a truncated batch currently silently drops 25 classifications). | SOC-M2 | S |
| 3.8 | Decide the browser-agents question: the subsystem cannot run (playwright isn't a dependency), its admin button queues to nothing, and it automates the OWNER'S PERSONAL social accounts with TOTP seeds (Discord self-botting = permanent ban; legal exposure). Recommendation: delete it (and the credential collection in env/admin UI); if evidence capture is truly needed, use burner research accounts via the official APIs or a compliant vendor. | SOC-C3, SOC-S1–S3, SOC-L4 | M |
| 3.9 | Either wire social results into the risk score (bounded modifier on StockDailySnapshot) or document that they are dashboard-only — today the expensive social layer does NOT affect any user-facing risk rating. Pass `mentionWhere` into the stats queries (headline numbers currently ignore filters). Add a TIMED_OUT badge. | SOC-R2, SOC-R3, SOC-R8 | M |
| 3.10 | Lock Supabase storage: service-role key for CI uploads; bucket policies must deny anon writes (the public anon key can currently overwrite scan artifacts). | SOC-S6, SEC-M9 | S |

## Phase 4 — Data layer & admin dashboard reliability (weeks 4–5)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 4.1 | **Postgres as the single source of truth for admin intelligence**: pipeline upserts results into the existing tables (StockDailySnapshot, DailyScanSummary, SocialScanRun); delete the unauthenticated GitHub-Contents-API data layer (60 req/h budget; 30 sequential calls per history page; 30–40MB serial downloads in the stock route; JSON "repair" by lastIndexOf that corrupts records). Interim mitigation if needed: GITHUB_TOKEN + Promise.all. | ARCH-C2, ARCH-C3, ARCH-M5 | XL |
| 4.2 | Rate limiting → Upstash Redis/Vercel KV (shared, single round-trip); strict/auth tiers fail CLOSED; delete the module-level setInterval; same store backs circuit-breaker state and a 60s admin-aggregate cache + the 5-min market-data cache. | ARCH-H3, ARCH-M1, ARCH-M4 | L |
| 4.3 | One `withApiHandler` wrapper: auth, rate limit, uniform `{error:{code,message}}` envelope, request-id structured logs, `Sentry.captureException` (Sentry is currently blind to the entire API surface — 443 console.* sites); fix admin routes returning 200 on failure. | ARCH-H5, ARCH-M12 | L |
| 4.4 | ModelMetrics: atomic increments (or derive from ScanHistory at read time) — concurrent scans currently corrupt the running averages; move `logScanHistory`/alert emails behind `waitUntil()` (alert emails are currently often lost at lambda freeze). | ARCH-H1, ARCH-H2 | M |
| 4.5 | Schema migrations (staged): money → `Decimal`; JSON-strings → native `Json`; real FK relations with explicit `onDelete` (ScanHistory.userId etc.); add `ScanHistory(userId, createdAt DESC)` + `(createdAt, ticker)` + `ApiUsageLog(dayKey)` + `Session/Account(userId)` indexes; drop the ~9 redundant `@@index`-duplicating-`@@unique` entries. | ARCH-M2, ARCH-M3, ARCH-L4 | L |
| 4.6 | Retention cron (Vercel cron): prune ApiUsageLog >90d, expired RateLimitEntry (never deleted today), EmailLog, AuthErrorLog; replace the in-request `backfillAdminMetrics` full-table scan with a set-based SQL script. | ARCH-H6, ARCH-H4 | M |
| 4.7 | Pooler hygiene: DATABASE_URL = transaction pooler (+`connection_limit=1`), DIRECT_URL = direct (CLI only); startup assertion; parallelize independent queries + `select` projections in admin routes; replace the 18-query segment-efficacy burst with one groupBy pivot; UTC month keys. | ARCH-M6, ARCH-M7, ARCH-L1 | M |
| 4.8 | Upload hardening: drop SVG (or sanitize), magic-byte check, role check on upload; sanitize blog HTML server-side on POST/PUT; encrypt-at-rest key: require dedicated `CREDENTIAL_ENCRYPTION_KEY` in prod; refresh-token rotation/revocation (jti store) + distinct refresh secret + pinned HS256; invalidate sessions on password reset (sessionVersion). | SEC-M3, SEC-M5–M7, SEC-M10 | L |

## Phase 5 — Frontend/admin UX & repo hygiene (week 6)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 5.1 | Fix `useAdminFetch` (AbortController, error-clear on refetch, success auto-clear, debounced-list helper with page-reset-on-filter) and migrate the ~21 admin pages that hand-roll it — this one move eliminates the stuck-error family (market-analysis/risk-alerts/promoter pages brick on one transient failure), the stale-response race family, and ~300+ lines of duplication. | UI-X1–X5, UI-H2–H9, UI-M* | XL |
| 5.2 | Sanitize the admin blog preview with DOMPurify (file-import HTML currently executes in the admin origin); dynamic-import mammoth; TipTap fixes: `immediatelyRender:false` (editor throws in dev), `useEditorState` for toolbar state, configure link/underline via StarterKit (duplicate extensions currently defeat `openOnClick:false`), debounce onUpdate, base64-paste → upload, slash-menu zero-match fix. | UI-H1, ED-H1–H5, ED-M1–M9 | L |
| 5.3 | Destructive-action confirmations (browser-agents "Clear 30d+", api-usage alert delete, users plan-downgrade); disabled-while-submitting on all mutation buttons (duplicate-submit bugs incl. model-efficacy feedback rows that skew accuracy metrics); fix publish-toggle/publishedAt and slug-rewrite-on-title-edit in the blog editor; support-ticket reply draft leaking across tickets. | UI-M2–M9, UI-H7 | L |
| 5.4 | Public-surface fixes: wire the uploaded-screenshot path into the scan API (feature currently dropped silently), stop recreating the Turnstile widget per keystroke, fix the PayPal button re-render loop, escape `</script>` in JsonLd. | frontend findings | M |
| 5.5 | A11y pass: label/htmlFor pairs, aria-labels on icon buttons, role=dialog + focus traps on modals, keyboard-accessible expandable rows, role=alert on banners, non-color-only risk indicators. | UI-X8, ED-M11 | L |
| 5.6 | Repo hygiene: delete `Untitled`, `plan.md` (case-collision with PLAN.md breaks Windows/macOS checkouts), root `check-db.js`/`test-scanner.ts` duplicates, `scamdunk-history-db/` (dead subproject with a second Prisma schema), `real-time-social-scanner.ts`, `persuasion-phrases.ts` (dead), the 11 superseded `run-evaluation-*` variants (→ attic); move audit MDs to `docs/audits/`; gitignore `public/evaluation-data` (8.8MB per deploy); update README (says Stripe; app uses PayPal). | ARCH-M8, ARCH-M9, ARCH-H9, SOC-D* | M |
| 5.7 | Decompose `enhanced-daily-pipeline.ts` (2,814-line monolith) into modules (fetch/score/filter/report/upload) importing the shared scorer and shared social-scan lib. | ARCH-H9, ARCH-H8 | XL |

## Phase 6 — Calibration & continuous quality (ongoing after Phase 2–3)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 6.1 | Re-run calibration on the unified scorer against the labeled efficacy set; report precision/recall + Brier/reliability per segment; only then re-tune HIGH/MEDIUM cutoffs (document them in `docs/SCORING_METHODOLOGY.md`). | TS-C1/C7, PY-H3 | L |
| 6.2 | Integration tests for the risky layer: reserveScanSlot concurrency, rate-limit behavior, /api/check with mocked externals, scan-data parsing; turn on `strictNullChecks` then `strict`; jest `roots: src`. | ARCH-M10 | L |
| 6.3 | Real training data for the ML layer (labeled pump/dump windows from the scheme DB you already collect); retrain RF/LSTM; keep them OFF until they beat the rule baseline on held-out data. | PY-C2, PY-M3 | XL |
| 6.4 | Observability: Sentry on all routes (4.3), pipeline-run dashboards from Postgres, cost dashboards (Serper/Perplexity/OpenAI per scan), alert on zero-ingest regulatory syncs. | various | M |

---

## Suggested order of execution (dependency-aware)

```
Day 1:        Phase 0 (all)
Week 1:       1A → 1B → 1C  (independent tracks, parallelizable)
Weeks 2–3:    2A (2.1 first — everything else in 2A builds on the unified scorer)
              2B in parallel (different service)
Weeks 3–4:    3.1–3.2 first (async + budgets), then 3.3–3.10
Weeks 4–5:    4.1 (biggest), 4.2–4.8 in parallel tracks
Week 6:       5.1–5.7
Ongoing:      Phase 6 (6.1 immediately after 2A lands)
```

## Expected outcomes
- **Scoring**: false-HIGH flood on OTC/small caps eliminated (signal dedup + recalibration); false-LOWs from silent data gaps eliminated (unknown ≠ 0 + confidence field); suspended stocks return HIGH; eval numbers finally describe production; ML layer either real or honestly disabled.
- **Social scans**: no more lost runs (async + incremental writes); per-scan API cost down ~60–80%; no duplicate spend; mention data deduplicated and attributable.
- **Security**: leaked credential rotated; quota/billing bypasses closed; login brute-force blocked; preview backdoor removed; headers/CSP in place.
- **Operations**: deploys can no longer drop production columns; CI gates merges; Sentry sees API errors; admin dashboards read Postgres, not an unauthenticated GitHub API.
