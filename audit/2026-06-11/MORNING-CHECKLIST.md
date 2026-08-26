# Morning Checklist — owner-only steps

These are the things I **cannot** do for you (they need dashboard access, secrets, or production DB). Everything else (all the code) is implemented and pushed to `claude/compassionate-clarke-s6xqk1`. Do these in order; most take a couple of minutes.

## 1. Rotate the leaked database password (5 min) — do this first
The production Supabase DB password was committed in `scripts/query-blogs-pg.mjs` (now removed from the file, but it's still in git history).
1. Supabase dashboard → your project → **Settings → Database → Reset database password**.
2. Copy the new connection strings (pooled + direct).
3. Update them in **Vercel → Settings → Environment Variables** (`DATABASE_URL` = pooled `:6543` with `?pgbouncer=true&connection_limit=1`, `DIRECT_URL` = direct `:5432`) and in **GitHub → Settings → Secrets and variables → Actions** (any DB secrets used by workflows).
4. Optional but recommended: skim the Supabase **Logs → Postgres** for connections you don't recognize.

## 2. Apply the database migration (5 min)
I generated two migration files offline (no DB was touched). You apply them once:
```bash
# From the repo root, with DIRECT_URL pointed at the new direct connection:
npx prisma migrate resolve --applied 00000000000000_baseline   # marks current prod schema as the baseline
npx prisma migrate deploy                                       # applies 20260611000000_audit_remediation
npx prisma migrate status                                       # should say "Database schema is up to date"
```
The remediation migration only **adds** columns/indexes and swaps a few redundant indexes — it does not drop any data. Run it during low traffic (it builds a unique index on `SocialMention`). After this, schema changes forever go through `prisma migrate`, never `db push`.

## 3. Point Vercel at the safe build command (2 min)
**Vercel → Settings → General → Build & Development Settings → Build Command:** set to `npm run build` (it no longer runs `db push --accept-data-loss`). Do **not** put `migrate deploy` in the build command — run it as the separate step in #2 so preview branches never touch the prod DB.

## 4. Cancel Apify (2 min)
Apify is not used anywhere in this codebase (verified across source, lockfile, workflows, and git history). If you have an Apify subscription, it's orphaned spend — cancel it.

## 5. Set / confirm these environment variables
Add any that are missing (Vercel for the app, Railway for the Python service, GitHub Actions for the pipeline). The code now **requires** the ones marked ⚠️ in production and will fail fast rather than fall back insecurely.

| Variable | Where | Why (finding) |
|---|---|---|
| ⚠️ `AI_API_SECRET` | Railway (python) + Vercel | Python AI service now refuses to start unauthenticated. |
| ⚠️ `CREDENTIAL_ENCRYPTION_KEY` | Vercel | Integration-credential encryption no longer falls back to `NEXTAUTH_SECRET`. 32-byte hex: `openssl rand -hex 32`. |
| ⚠️ `JWT_REFRESH_SECRET` | Vercel | Mobile refresh tokens now use a dedicated secret (no more `JWT_SECRET + "_REFRESH"`). `openssl rand -hex 32`. |
| ⚠️ `PREVIEW_ADMIN_PASSWORD` | Vercel (preview only) | Preview-login no longer has a default password; unset = disabled. Use a strong unique value, or leave unset to keep it off. |
| `TURNSTILE_SECRET_KEY` | Vercel | Now enforced on login + forgot-password (already present). |
| `SERPER_API_KEY`, `PERPLEXITY_API_KEY`, `YOUTUBE_API_KEY` | GitHub Actions | Social scan (already present). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel | New: shared rate-limiting / caching. If unset, the app falls back to the DB limiter (still works, just per-instance). See #6. |

Also: **delete the `preview@scamdunk.com` admin row** if it exists (Supabase table editor → `AdminUser`), since it was created with the old default password.

## 6. (Optional, recommended) Create an Upstash Redis database (10 min)
Phase 4 moves rate-limiting and caching to shared storage so they actually work across serverless instances. The code uses Upstash if `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, and transparently falls back to the existing DB limiter if not — so this is non-blocking, but recommended before you scale.
1. [console.upstash.com](https://console.upstash.com) → create a Redis database (free tier is fine to start).
2. Copy the REST URL + token into Vercel env vars.

## 7. Things that need real data (not blocking, scheduled in Phase 6)
- **Re-calibrate the scoring thresholds** on your labeled evaluation set. The engine is now unified (app + pipeline use one module) and the over-flagging signal-stacking is fixed, but the exact HIGH/MEDIUM cutoffs should be re-derived against labeled outcomes. I left the calibration harness and a documented procedure in `docs/SCORING_METHODOLOGY.md`.
- **Retrain or keep disabled the ML models.** The Random Forest feature contract is fixed and the LSTM is currently gated off (it was trained on synthetic data and produced noise). Re-enable only after retraining on real labeled sequences — the code checks a `ML_MODELS_ENABLED` flag.

---
When you've done #1–#5, reply here and I'll confirm everything is green and walk through anything that needs your eyes.
