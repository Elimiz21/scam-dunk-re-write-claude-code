# Implementation Status — 2026-06-11

All code changes from the remediation roadmap are implemented, verified, and
pushed to `claude/compassionate-clarke-s6xqk1`. Final gates: **`tsc` 0 errors ·
`jest` 73/73 (15 new tests) · `next build` succeeds**.

This summarizes what landed vs. what is deliberately deferred (and why). See the
commit history for specifics; every item traces to a finding ID in `findings/`.

## Landed (13 implementation commits)

**Foundation**
- Prisma `migrate` adopted: baseline + remediation migrations generated offline (no prod touched); `db push --accept-data-loss` removed from the build; `rm -rf .next` removed.
- Schema: Apple-receipt binding (`appleOriginalTransactionId @unique`), `subscriptionStore/ExpiresAt`, `sessionVersion`, `SocialMention` dedup unique-constraint + `contentHash`, hot-path indexes, 3 redundant indexes dropped.
- CSP + security headers; `/admin` pages gated at the edge; `/api/ai-analyze` added to the auth matcher.
- Shared helpers: `BehavioralContext`, `MIN_PASSWORD_LENGTH`/`validatePasswordStrength`, `withApiHandler`+`ApiException`+Sentry, UTC month keys.
- CI workflow (typecheck/lint/test/build + pytest); ESLint config added.
- `npm audit fix` (18→5; critical handlebars + high transitive resolved). Repo hygiene (dead files/subproject removed). Leaked DB credential removed from source.

**Scoring (the "AI not working" fix)**
- Unified into one dependency-free engine (`src/lib/scoring/engine.ts`) used by both app and pipeline — ends the eval-vs-prod fork.
- Correlated price/volume signals de-duplicated (max-of-family) + acceleration floors — fixes systemic OTC over-flagging.
- Missing data → UNKNOWN (not 0/worst-case) + `dataCompleteness` confidence; RSI flat=50; structured anomaly signals; z-score over 5d ≥2.5σ; baselines exclude spike days.
- SEC layer hardened (no substring match; whole-word; suspended tickers → HIGH); `isLegitimate` coherent (forced false when not LOW).
- Crypto routed correctly (SOL/APT/LINK are stocks); CoinGecko daily candles.
- Python backend response zod-validated; 503 → graceful TS fallback + async alert (was dead code); OpenAI timeouts; prompt-injection wrapping.

**Python AI**
- RF feature contract fixed (was always 0.0 + per-request retrain); ML gated behind `ML_MODELS_ENABLED` (default off until retrained on real data); synthetic-fundamentals fallback removed; OTC exchange codes fixed; constant-time auth, fail-closed without `AI_API_SECRET`; real `/health`; vuln pins bumped.

**Social-scan**
- Async/incremental writes (killed function no longer loses everything); per-fetch timeouts + deadline-aware scanners; dedup via `contentHash`+unique constraint; word-boundary ticker attribution; 409 concurrency guard. ~60–80% per-scan cost cut (Serper `num:10`+merged+top-20, Perplexity tiered, global dedup, YouTube quota guard). Dead code deleted.

**Auth/security**
- Email HTML escaping; login rate limit; preview-login backdoor closed; dedicated `JWT_REFRESH_SECRET` + HS256 pinned + `sessionVersion` rotation; `CREDENTIAL_ENCRYPTION_KEY` required in prod; reset invalidates sessions; shared password policy; JsonLd escaping; Turnstile churn fixed; email-verified login detection fixed.

**Billing/quota**
- Atomic `reserveScanSlot` (no concurrent over-cap) + `refundScanSlot` wired into failure paths; Apple receipt replay closed (one purchase ≠ unlimited PAID) + entitlement expiry; PayPal cancelled on account deletion; consistent server-authoritative plan state.

**Data layer & infra**
- Shared rate-limiting/cache via Upstash KV (with DB/in-memory fallback; strict/auth tiers fail closed; module `setInterval` removed); atomic `ModelMetrics`; 18-query segment stats → 1; set-based backfill; `scan-data` GitHub auth + batching + 502-on-failure; 60s admin aggregate caching; per-route `maxDuration`.

**Admin UI**
- `useAdminFetch` rewritten (AbortController, 401-redirect, error-clear, success auto-clear) and applied to the stuck-error/race pages; admin blog preview + file-import HTML DOMPurify-sanitized; TipTap fixes (immediatelyRender, useEditorState, dynamic mammoth, debounced updates); destructive-action confirmations; blog publishedAt/slug correctness; render-phase mutation fixes; news silent-failure surfacing.

**Public frontend**
- Misleading screenshot-upload UI removed (it never reached the API); LimitReached plan-aware + dark mode; PayPalButton/Turnstile no longer rebuilt per keystroke; faked scan-progress no longer claims un«performed» checks; resilient author pages; SEO fixes (og-image, fake SearchAction removed); wider ticker validation; README Stripe→PayPal.

## Deliberately deferred (with reason)

| Item | Why | Where it's tracked |
|---|---|---|
| Re-calibrate HIGH/MEDIUM cutoffs + signal weights | Needs your labeled dataset; engine is unified so this is now safe to do | `docs/SCORING_CALIBRATION.md`, checklist #7 |
| Retrain/enable RF+LSTM | Needs real labeled training data; gated off (`ML_MODELS_ENABLED=false`) so they can't emit noise meanwhile | checklist #7 |
| Full GitHub→Postgres admin data layer (ARCH-C2/C3) | Large migration; mitigated for now with `GITHUB_TOKEN` (60→5000/h), batching, 502-on-failure, `maxDuration` | roadmap Phase 4.1 |
| Python news-verification → async | Larger architectural change; kept synchronous but bounded by timeouts | finding PY-C5 |
| `next@16` major upgrade (remaining 5 npm vulns) | Breaking major; out of scope for an automated pass | roadmap Phase 1.12 |
| Lower-priority a11y nits, `scan-status`/`team`/`integrations`/`settings` page polish | Not high-impact; engine/security/stability prioritized | findings 06/07/08 (marked deferred) |
| Editor paste-to-upload pipeline | `allowBase64:false` stops content-ballooning; full upload-on-paste deferred | finding ED-M9 |

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx jest` → 73/73 pass (5 suites)
- `npx next build` → succeeds (compiles, type-checks, collects page data, generates static pages)
- `npx next lint` → runs non-interactively (pre-existing findings surfaced as warnings; CI lint non-blocking)

## New env vars (all have safe fallbacks except the security-required ones)
See `MORNING-CHECKLIST.md` §5. Required in production: `AI_API_SECRET`,
`CREDENTIAL_ENCRYPTION_KEY`, `JWT_REFRESH_SECRET`, `PREVIEW_ADMIN_PASSWORD`.
Optional (graceful fallback): `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `GITHUB_TOKEN`.
