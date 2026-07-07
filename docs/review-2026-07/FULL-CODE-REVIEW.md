# ScamDunk — Full Code, Usability & Security Review

**Date:** 2026-07-07
**Scope:** Entire application — Next.js app (`src/`, 95 API routes, 27 admin pages), Python AI engine (`python_ai/`), evaluation & social-scan pipelines (`evaluation/`), Prisma/Supabase schema, and the live production database.
**Method:** Seven parallel deep-review passes (dashboard wiring, API routes, Python AI, social scans, security, data lifecycle, architecture) cross-checked against live Supabase queries. Findings below are what was **verified by reading both sides of each contract** and, where possible, **confirmed against production data**. Speculative items are marked _SUSPECTED_.

---

## 1. Executive summary

**Verdict: a well-engineered core wrapped in a broken data pipeline and an unmanaged periphery. Grade B‑.**

The production `src/` code is genuinely good: business logic is factored into ~30 focused `src/lib` modules, the Prisma schema is well-indexed with correct cascades, admin authorization is layered and every one of the 61 privileged admin handlers independently re-validates the session (a forged cookie gets nothing), CI actually gates on typecheck + lint + jest + build + pytest, and the Python service is clean and 81/81 tests green.

**But three categories are actively broken or dangerous, and they explain everything you've been seeing:**

1. **The AI engine is not being used at all.** Every user scan silently falls back to TypeScript scoring because of a one-line request mismatch (`news_flag: null` → HTTP 422). Verified by reproduction and in source.
2. **The daily data pipeline is producing stale, meaningless data.** The stock universe file has been frozen since March 14, nothing checks whether price data is current, and the alert generator has *no comparison logic* — it stamps a fresh "NEW HIGH RISK" alert on every high-risk stock every day. This is exactly why dead March/April stocks show up as today's alerts.
3. **There is a live data-exposure hole and committed secrets.** Row-Level Security is disabled on every table while the public browser key has full read/write on admin sessions, password hashes, and all user PII — and your production DB password plus a live API key are committed to git.

Nothing here is unfixable, and most of it is a small number of root causes producing many symptoms. The fix plan (companion doc `IMPLEMENTATION-PLAN.md`) sequences everything to avoid introducing new bugs.

### What's working vs. what's broken (direct answer)

| Subsystem | Status | One-line reason |
|---|---|---|
| Admin authentication & authorization | ✅ Working | Every admin route re-validates hashed session server-side |
| User auth / password reset / mobile JWT | ✅ Working | Single-use tokens, sessionVersion invalidation, HS256 pinned |
| PayPal billing webhooks | ✅ Working | Signature verified, fail-closed |
| Most admin dashboard pages (24 of 27) | ✅ Working | Wiring verified both sides |
| Python AI service (in isolation) | ✅ Healthy | 81/81 tests pass, honest rules-only mode |
| **AI engine in production** | ❌ **Broken** | `news_flag: null` → 422 → every scan uses TS fallback |
| **Daily stock evaluation data** | ❌ **Broken** | Frozen universe + no freshness check → zombie stocks scored HIGH forever |
| **Risk alerts** | ❌ **Broken** | Stateless generation; 244k rows; duplicates; stale stocks look current |
| **Social scans** | ⚠️ Partial | Works when it fits in 300s; times out on heavy days; Discord always 0; stale posts leak |
| **Browser agents** | ❌ Facade | "Run Scan" button queues rows nothing consumes |
| **Cron ingestion endpoint** | ❌ Unauthenticated | Auth check was removed; anyone can trigger it |
| **Database security (RLS)** | 🔴 Critical | RLS off + public key has full grants on all sensitive tables |
| **Secret hygiene** | 🔴 Critical | Prod DB password + live FMP key committed to git |

---

## 2. Critical issues — act first (P0)

### P0-1 🔴 Database is readable/writable by the public anon key (RLS disabled everywhere)

**Verified against production.** Supabase's security advisor flags RLS disabled on **all 46 public tables**, and a direct grant query confirms the `anon` and `authenticated` roles (the key shipped in your website's browser bundle via `NEXT_PUBLIC_SUPABASE_ANON_KEY`, used at `src/lib/supabase.ts:22`) hold **`SELECT, INSERT, UPDATE, DELETE, TRUNCATE`** on every sensitive table:

- `AdminSession` (session tokens), `AdminUser` (bcrypt password hashes)
- `Account` (OAuth `access_token` / `refresh_token`)
- `PasswordResetToken`, `EmailVerificationToken`, `VerificationToken`
- `User` (all customer PII)

Because the app uses `@supabase/supabase-js` on the client, the anon key is public by design. With RLS off and full grants, anyone with that key can read every admin password hash and forge/read session tokens, or delete data, directly via the PostgREST REST API — bypassing every application control.

**Fix (exact steps in the plan):** Enable RLS on every table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with no permissive policy = deny-all to anon/authenticated), and/or `REVOKE` privileges from `anon`/`authenticated`. Prisma connects as the Postgres owner via `DATABASE_URL`, so it is unaffected by RLS/REVOKE — the app keeps working; only the public REST hole closes. **This is the single highest-priority item.**

### P0-2 🔴 Production secrets committed to git

- **Production Supabase DB password** in `audit/2026-06-11/findings/04-security.md:10` — full pooler connection string incl. the live password (redacted here; see that file). The pooler host is internet-reachable. Treat the database as compromised until rotated.
- **Live FMP API key** `9XxAh…Ner1s` hardcoded in `evaluation/scripts/watchdog-scan.sh:9`, `watchdog-scan-jan15.sh:9`, `watchdog-scan-jan16.sh:10`.
- **Partial OpenAI project key** in `evaluation/BRANCH_STATUS.md:148`.
- **Historic preview-admin password** (redacted; hardcoded in committed docs) — verify no `preview@scamdunk.com` OWNER row exists in prod.

**Fix:** Rotate all three credentials now (Supabase dashboard, FMP dashboard, OpenAI dashboard). Move keys to env vars. Purge from git history (`git filter-repo`). These are dashboard actions only you can perform — see the plan's Phase 0 checklist.

### P0-3 🔴 Unauthenticated cron ingestion endpoint

`src/app/api/cron/ingest-evaluation/route.ts` — the file header claims "Secured with CRON_SECRET" but the auth check was **removed** (commit `c0f7285`, rationale "private repo" — wrong threat model; the URL is public regardless). `CRON_SECRET` appears only in the comment, and `/api/cron/*` is not in the middleware matcher. **Found independently by 4 of the 7 reviews.** Anyone can GET it and trigger up to ~9 minutes of Supabase listing + bulk DB writes on demand — a free DoS/cost lever, and combined with P0-4 it can manufacture duplicate alerts.

**Fix:** Restore `if (request.headers.get("authorization") !== \`Bearer ${process.env.CRON_SECRET}\`) return 401` at the top; set `CRON_SECRET` in Vercel (it injects the header automatically for cron). One-line, zero-risk.

### P0-4 🔴 The AI engine has never been used by user scans

**Verified by reproduction and in source.** `src/app/api/check/route.ts:346` calls `callPythonAIBackend(ticker, assetType, secFlagged)` with no 4th arg, so line 161 sends `news_flag: newsFlag ?? null` = **`null`**. The Python model `api_server.py:145` declares `news_flag: bool = Field(default=False)` — a non-optional bool, which pydantic v2 rejects with **HTTP 422**. The route logs "AI backend returned 422" and silently falls back to TypeScript scoring. Every user scan returns a normal 200 with plausible scores — but **the Python AI models never run.** This is the answer to "I don't know whether the AI engine is working."

**Secondary:** `src/app/api/ai-analyze/route.ts:148` gates on `rf_ready && lstm_ready`, which are *always false* in the shipped config (ML disabled, TensorFlow not even in the Docker image), so that route never calls the backend either.

**Fix:** Change the Python model to `news_flag: Optional[bool] = False` (coalesce `None`→`False` in the handler) **and** have the TS side send `news_flag: newsFlag ?? false`. Add a cross-repo contract test that posts the exact check-route body. Then confirm via the admin `aiBackend vs tsFallback` metric (it will currently read ~0% AI).

### P0-5 🔴 Stale/duplicate risk alerts — full root cause

This is the "alerts for stocks last scanned in March/April" bug. **Three compounding defects, all verified:**

1. **Frozen universe.** The daily pipeline (`evaluation/scripts/enhanced-daily-pipeline.ts`) reads its stock list from `evaluation/data/us-stocks.json`, last committed **2026-03-14** (6,970 tickers). Nothing refreshes it. That's why `DailyScanSummary` shows an identical `6,564 evaluated / 406 skipped` every single day.
2. **No freshness check → zombie stocks.** For delisted/halted tickers, FMP keeps serving the last-known profile and final ~100 EOD bars. The scorer works on array *positions* (`slice(-30)`), never calendar dates, so a stock that pumped and died in March presents the identical "recent spike" pattern forever and scores HIGH every day — stamped `evaluatedAt: now()`, which hides the staleness.
3. **Stateless alert generation.** `src/lib/admin/ingest-evaluation-core.ts:510-543` filters `riskLevel === "HIGH"` and creates a `NEW_HIGH_RISK` alert **for every high-risk stock every day**, with `alertDate = the file's scan date`. It never looks at any prior snapshot — `previousRiskLevel`/`previousScore` are never populated. "NEW_HIGH_RISK" actually means "is HIGH today." The alert types `RISK_INCREASED/DECREASED/PUMP_DETECTED` exist in the UI and schema but nothing ever creates them.

**Live DB confirmation:** 244,451 alert rows (102,741 dated before May); duplicate alerts exist (April 24 ingested 3×) because `StockRiskAlert` has **no unique constraint**, so the app-level dedupe races and `createMany({skipDuplicates})` is a no-op. The display side (`risk-alerts` page) correctly filters by `alertDate >= now-Nd`, so the reason old stocks look current is that they are re-flagged with a *fresh* alertDate every day while their underlying market data is months old — and the UI never shows the underlying data date.

**Fix (generation-side is primary):** In Step 7, look up the most recent snapshot with `scanDate < current` (`findFirst orderBy scanDate desc` — gap/weekend-safe), populate `previous*`, and only create `NEW_HIGH_RISK` when the previous level wasn't HIGH; emit `RISK_INCREASED` on score jumps. Add `@@unique([stockId, alertDate, alertType])`. Pipeline-side: skip tickers whose latest bar is older than ~5 trading days; regenerate `us-stocks.json`. Display-side: show each alert's underlying `scanDate` and banner when it lags. Then one-time clean up the redundant historical alerts.

### P0-6 🔴 Live analyze crashes (HTTP 500) on the exact stocks you target

`python_ai/feature_engineering.py:313-336` does `int(market_cap < …)`, `np.log1p(market_cap)`, `exchange.upper()` with no None handling, but `get_stock_fundamentals` deliberately returns `None` for missing fields — which is the common case for the OTC micro-cap shells this product exists to catch. Verified by reproduction: `TypeError: '<' not supported between 'NoneType' and 'int'` → 500 → TS fallback. So even once P0-4 is fixed, live analysis of the most important tickers would still fail.

**Fix:** Coalesce in `extract_contextual_features` (`market_cap = fundamentals.get('market_cap') or 0`, `exchange = ... or 'UNKNOWN'`). Add a test that feeds a `None`-valued fundamentals dict through the full feature vector.

---

## 3. Findings by domain

### 3.1 Data pipeline & risk alerts

| # | Sev | Location | Issue |
|---|---|---|---|
| D1 | P0 | ingest-evaluation-core.ts:510-543 | Stateless alert generation (see P0-5) |
| D2 | P0 | enhanced-daily-pipeline.ts + us-stocks.json | Frozen universe, no data-freshness check (see P0-5) |
| D3 | P1 | schema.prisma:381-406 | `StockRiskAlert` has no unique constraint → duplicate alerts (confirmed in DB); `skipDuplicates` is a no-op |
| D4 | P1 | ingest-evaluation-core.ts:288 | Storage `list("", {limit:500})` sorted by name, not date → after ~70 days the newest files fall outside the window and **auto-ingest silently stops** (found by 2 reviews) |
| D5 | P1 | enhanced-daily-pipeline.ts:499 | Daily "AI layer" posts `use_live_data:false` → backend scores **synthetic random-walk data**, not the real stock. Every "4-layer" verdict for ~7,000 stocks/day is noise |
| D6 | P2 | ingest-evaluation-core.ts:471-491 | `priceChangePct`, `volumeRatio`, `previousClose`, `volume`, `signalSummary` are **never emitted by any producer** → NULL on all 662,090 snapshots (confirmed: 0 populated). The ingest interface was written for a file format no script generates |
| D7 | P2 | ingest-evaluation-core.ts:476 | `isLegitimate ?? true` → every snapshot stored `true` incl. HIGH-risk |
| D8 | P2 | (no pruning anywhere) | No retention/TTL on any table. Live sizes: `StockDailySnapshot` 336 MB / 662k rows, `StockRiskAlert` 73 MB / 244k rows, `SocialMention` 48 MB / 76k rows — ~460 MB and growing daily |
| D9 | P2 | ingest-evaluation-core.ts:377 | `new Date(date)` (UTC) + `setHours(0,0,0,0)` (local) — off-UTC servers shift scanDate a day and cause daily re-ingest loops. Safe only because Vercel is UTC |
| D10 | P3 | enhanced-daily-evaluation.yml:75 | Only literal `07-04` holiday handled; other market closures treated as trading days |

### 3.2 AI engine (Python)

| # | Sev | Location | Issue |
|---|---|---|---|
| A1 | P0 | check/route.ts:161 ↔ api_server.py:145 | `news_flag: null` → 422 → AI never used (see P0-4) |
| A2 | P0 | feature_engineering.py:313-336 | 500 crash on None fundamentals (see P0-6) |
| A3 | P1 | ai-analyze/route.ts:148 | Health gate requires `rf_ready && lstm_ready`, always false → route never uses backend |
| A4 | P1 | check/route.ts:396 + scoring/engine.ts:1053 | Python `INSUFFICIENT` verdict coerced to `LOW` — a stock the engine refuses to rate displays as low risk |
| A5 | P1 | enhanced-daily-pipeline.ts:499 | Pipeline scores synthetic data (= D5) |
| A6 | P1 _SUSPECTED_ | live_data.py:586 | News-catalyst verification likely inert on `yfinance>=0.2.51` (nested news payload) → false-positive reduction quietly disabled |
| A7 | P1 _SUSPECTED_ | live_data.py:384 | Crypto path returns INSUFFICIENT for every coin (CoinGecko 4-day candles < 30-row minimum); unknown coins → 503 + an admin alert email per scan |
| A8 | P2 | live_data.py:735 | A single 8-K downgrades HIGH→MEDIUM, but `pre_pump_signals.py:42` treats 8-Ks as a *pump precursor* — contradictory logic |
| A9 | P2 | api_server.py:142 | `days` request field validated then never used (both TS routes send it) |
| A10 | P2 | multiple | Batch endpoints (`apewisdom`, CIK map, StockTwits) return `{}`/empty on upstream failure → "empty = healthy" indistinguishable from "no threats" |
| A11 | P2 | model_hashes.json | Integrity hashes all `null`; if someone enables ML on Railway without populating them, service silently stays rules-only |

**Note:** the Python service itself is sound — good async hygiene (work offloaded to executors, timeouts everywhere), committed model artifacts, fail-closed auth, a real feature-contract assertion. The problem is entirely the *contract with the callers* and the *pipeline feeding it fake data*.

### 3.3 Social scans

| # | Sev | Location | Issue |
|---|---|---|---|
| S1 | P0 | social-scan/route.ts:19,396 | Whole multi-stage scan runs synchronously inside one Vercel function (`maxDuration=300`), but worst-case budget (5×115s scanners + 120s AI screen + per-mention update storm) exceeds 300s → Vercel kills it → run stuck RUNNING → next GET mislabels it TIMED_OUT. **This is the Jun 26/29 timeout.** |
| S2 | P1 | enhanced-daily-pipeline.ts:1818 | Pipeline aborts its POST at 5 min then runs a **local fallback scan**, re-spending Serper/Perplexity on the same 50 tickers with results going only to JSON (never the DB) — timed-out days cost double and diverge |
| S3 | P1 | scanners.ts:1327,1375,1409 | Discord reports `success:true / 0 mentions` when the bot lacks the Message Content intent or channel-read permission — a config gap silently reported as success. **This is the always-0 Discord.** |
| S4 | P1 | schema.prisma:826 | Dedup is per-run only (`@@unique([scanRunId,ticker,contentHash])`) → the same post is re-inserted every run. Confirmed: 76,609 mention rows but only **2,833 unique** posts |
| S5 | P1 | scanners.ts (StockTwits/Serper/Perplexity) | No postDate lookback filter → six-week-old (and older) posts stored as fresh. Confirmed: 179 stale rows on the Jul 1 run alone, oldest from **2023-03-15** |
| S6 | P2 | social-scan/route.ts:233 | `JSON.parse` of `engagement`/`redFlags` is unguarded → one corrupt row throws into a catch that returns **HTTP 200 with an empty dashboard** |
| S7 | P2 | social-scan/page.tsx:419 | No TIMED_OUT badge case → timed-out runs render as unstyled text, easy to miss |

### 3.4 Dashboard / admin UI (usability)

24 of 27 pages are fully wired and correct. Problems:

| # | Sev | Location | Issue |
|---|---|---|---|
| U1 | P0 | browser-agents/route.ts:150 + page.tsx:283 | "Run Browser Scan" writes a `PENDING` row **nothing consumes**; PENDING rows count as "Running" forever and can't be cleared. The whole browser-agents subsystem is a facade (Playwright/otplib aren't even installed). Found by 3 reviews |
| U2 | P1 | middleware.ts:52 + team/invite/route.ts | **Admin invite acceptance is fully broken** — the invite path isn't in `ADMIN_PUBLIC_PATHS`, so middleware 401s the invitee (who has no session cookie yet). Invited admins can never create their account |
| U3 | P1 | api-usage/page.tsx:182 + metrics.ts:583 | Alert "Status" column can never show "Triggered" — `checkAndTriggerAlerts()` has zero callers (needs a cron). Page can show a "Triggered" banner while every row reads "OK" |
| U4 | P2 | api-usage/page.tsx:344 | Create-Alert service dropdown lists `OPENAI/ALPHA_VANTAGE/STRIPE` but the logged services are `OPENAI/FMP/COINGECKO/ALPHA_VANTAGE` — can't alert on the main cost drivers; STRIPE never fires |
| U5 | P2 | scan-status → scan-intelligence | "New/Ongoing Schemes" cards deep-link with `?schemeFilter=` that the target page never applies to the schemes section — clicking "3 new schemes" doesn't show them |
| U6 | P2 | risk-alerts/page.tsx:253 | Page shows only `alertDate`, never the underlying snapshot date, so data staleness is invisible to admins (compounds P0-5) |
| U7 | P2 | team/page.tsx:155 | Invite/role/deactivate controls render for every role but backend enforces OWNER → non-owners get controls that always error |
| U8 | P3 | AdminLayout.tsx:466 | Top-bar bell icon is a dead control on every page |
| U9 | P3 | login/page.tsx:141 | Invite-accepted success message rendered in the red error box |

Plus several P3 controlled/uncontrolled-input warnings (news/blog/media nullable fields) and missing success feedback on acknowledge.

### 3.5 API routes (correctness)

Auth is uniformly solid — **no route was found where a forged cookie reaches privileged logic.** Correctness issues:

| # | Sev | Location | Issue |
|---|---|---|---|
| R1 | P1 | cron/ingest-evaluation | Unauthenticated (= P0-3) |
| R2 | P1 | middleware + team/invite | Invite broken (= U2) |
| R3 | P2 | social-scan:233, support:146 | Catch blocks return **HTTP 200 with empty data** → real failures render as "0 results" |
| R4 | P2 | apple/validate:211 + paypal.ts | Entitlement expiry is **write-only** — nothing reads `subscriptionExpiresAt`; no cron downgrades lapsed subs, so an Apple subscriber stays PAID forever |
| R5 | P2 | scan-messages/route.ts:38 | Unawaited delete→reorder chain after the response returns → Vercel freezes the lambda → dedupe/reorder may not run; races between two admins |
| R6 | P3 | ~11 list routes | `parseInt(...)` of query params unguarded → `NaN` → Prisma 500 (or fake-empty 200). Only `users` route clamps correctly |
| R7 | P3 | rate-limit.ts:165 | `prismaRateLimit` read-modify-write increment races; `RateLimitEntry` rows never purged (unbounded growth) |
| R8 | P3 | email.ts:1140 | `sendAPIFailureAlert` has no throttle → an FMP outage emails admins on every scan |
| R9 | P3 | inbound-email:213 | Auto-confirmation has no mail-loop guard → vacation-reply senders create infinite tickets |

**Suspected-dead routes** (0 in-repo references): `/api/taglines`, `/api/news/blog`, `/api/news/media`, `/api/admin/audit`, `/api/admin/auth-errors`, `/api/admin/email-config`, `/api/admin/fix-unverified-users`.

### 3.6 Architecture & code quality

| # | Sev | Issue |
|---|---|---|
| Q1 | P1 | **Forked scoring engine** — the daily pipeline scores with `evaluation/scripts/standalone-scorer.ts` (479 lines) while user scans use `src/lib/scoring/engine.ts` (1,174 lines). Two silently divergent risk engines in a scam-*detection* product is the scariest structural risk |
| Q2 | P1 | `tsconfig.json` has `strict: false` — no null-checking across 70K lines on billing/auth/scoring paths, so "0 tsc errors" means less than it should |
| Q3 | P2 | 912-line byte-identical `platform-patterns.ts` duplicated across `src/lib` and `evaluation/`; sibling `types.ts` have **diverged** |
| Q4 | P2 | `enhanced-daily-pipeline.ts` is a 2,814-line god file inlining 6 phases; admin UI has 1,400–1,685-line client monoliths |
| Q5 | P2 | ~35 MB generated JSON committed, incl. **8.8 MB in `public/`** served publicly on every deploy |
| Q6 | P2 | `.env.example` documents stale Stripe vars (app is PayPal-only) and omits ~50 vars actually read, incl. the entire billing config — a new deploy from it would break billing + mobile auth |
| Q7 | P3 | 13 stale root planning/audit `.md` files; 7 dead `run-evaluation-*` variants + 2 dead `run-social-scan-*`; duplicated `test-scanner.ts`; committed audit PDFs/HTML |
| Q8 | P3 | Zero jest coverage on the money paths: `ingest-evaluation-core.ts`, alert generation, `orchestrate.ts`, admin auth |

**Build/test reality:** `tsc` 0 errors (but non-strict); lint passes with ~15 warnings; jest 72/73 (1 flaky timeout, passes in isolation; `.claude/worktrees` copies cause haste collisions — needs `testPathIgnorePatterns`); pytest 81/81. `next.config.js` does **not** ignore build/lint errors (good). Suspected-missing indexes actually exist.

---

## 4. What is working (do not break these)

- **Admin auth model** — hashed session tokens, per-route revalidation, correct OWNER/ADMIN role gates on mutations, edge rate limiting.
- **User auth** — single-use reset tokens, `sessionVersion` invalidation across web+mobile, HS256 pinned (no alg-confusion), Turnstile on forgot-password.
- **Billing** — PayPal + Apple signature/replay verification, ownership checks, atomic scan-slot reserve/refund with no-downgrade guard.
- **Injection resistance** — all `$queryRaw` parameterized; the 3 `dangerouslySetInnerHTML` sinks are DOMPurify-sanitized or escaped; no `child_process` in the deployed app.
- **Python service internals** — async offloading, outbound timeouts, committed models, fail-closed API-key auth, feature-contract assertion.
- **CI** — prisma validate → tsc (app + evaluation) → lint → jest → next build → pytest.
- **Most of the dashboard** — 24/27 pages fully wired; error handling generally good (loading cleared in `finally`, 401→login redirect, abort-controller races handled).
- **Snapshot/summary idempotency** — `@@unique([stockId, scanDate])` means re-ingesting a date can't duplicate snapshots (only alerts, which lack the constraint).

---

## 5. Appendix — live database evidence (as of 2026-07-07)

- **Alerts:** 244,451 rows; oldest `alertDate` 2026-01-11; 102,741 before May; only 1 acknowledged. Duplicates confirmed (April 24 = 3 copies each). Jul 6 alerts' "previous snapshot" is same-month → stocks are re-scored daily, so freshness comes from re-flagging not new events.
- **Snapshots:** 662,090 rows across 104 dates; **0** have `priceChangePct` or `volumeRatio` populated (universal NULL, not a regression). Constant `6,564 evaluated / 406 skipped` daily = frozen 6,970-ticker universe.
- **Social mentions:** 76,609 rows but only **2,833 unique** `contentHash` values (96% are re-inserted duplicates); oldest post 2023-03-15 ingested as recent.
- **Social runs:** Jun 26 & 29 `TIMED_OUT`; Jun 30 & Jul 1 `COMPLETED` (41–59s); Discord 0 mentions every completed run.
- **Table sizes:** `StockDailySnapshot` 336 MB, `StockRiskAlert` 73 MB, `SocialMention` 48 MB — no retention anywhere.
- **Security advisor:** RLS disabled on all 46 tables; `anon` role has full DML on `AdminSession`, `AdminUser`, `Account`, `PasswordResetToken`, `User`; public storage bucket `evaluation-data` allows listing.

---

_Companion document: **`IMPLEMENTATION-PLAN.md`** — the ordered, fail-safe sequence to fix all of the above without introducing new bugs._
