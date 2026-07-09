# Action Checklist — items only you can do

The code fixes from the review are implemented, tested, and committed on this
branch. This file lists the things I could **not** safely do autonomously
(dashboard actions, production secrets, destructive data ops, billing-risky
changes). They're ordered by urgency.

---

## 🔴 0. DO THIS FIRST — set `CRON_SECRET` before deploying

I made `/api/cron/ingest-evaluation` **fail closed**: it now returns 500 if
`CRON_SECRET` is unset (previously it ran unauthenticated). So you must set
`CRON_SECRET` in Vercel **before or with** this deploy, or the nightly
ingestion stops.

- Vercel → Project → Settings → Environment Variables → add `CRON_SECRET`
  (generate: `openssl rand -hex 32`). Vercel Cron sends it automatically.

## 🔴 1. Rotate the three leaked credentials (P0‑2)

These are in git history and must be rotated regardless of the history purge:

1. **Supabase DB password** — Supabase → Project `gwzcluijtbuglznwdqqk` → Settings
   → Database → Reset database password. Then update `DATABASE_URL` +
   `DIRECT_URL` in **Vercel** and **Railway**.
2. **FMP API key** — regenerate at financialmodelingprep.com; update `FMP_API_KEY`
   in Vercel **and** the GitHub Actions secret.
3. **OpenAI key** — rotate at platform.openai.com; update `OPENAI_API_KEY`.
4. Confirm no `preview@scamdunk.com` OWNER row exists in prod and that
   `PREVIEW_ADMIN_PASSWORD` is unset in production.

After rotating, purge the values from git history (rewrites history — coordinate
with anyone else on the repo):
`git filter-repo --path audit/2026-06-11/findings/04-security.md --path evaluation/scripts/watchdog-scan.sh --invert-paths` (or redact in place).

## 🟠 2. Apply the risk-alert uniqueness migration (destructive dedupe)

I wrote `prisma/migrations/20260709000000_risk_alert_unique/migration.sql` but did
**not** run it — it deletes duplicate alert rows before adding the constraint.
Run it in a maintenance window **after a backup**:

- Supabase → Database → Backups → confirm a recent backup, then either
  `npx prisma migrate deploy` (with `DATABASE_URL`/`DIRECT_URL` set) or paste the
  migration SQL into the Supabase SQL Editor.
- It keeps the earliest alert per `(stockId, alertDate, alertType)` and adds the
  unique index. Lossless (removes only exact duplicates) but briefly locks the
  table.

## 🟠 3. Fix the Discord scanner config (S3)

The code now reports an honest error when the bot can't read message content.
To actually get Discord mentions:

- Discord Developer Portal → your app → Bot → enable the **Message Content**
  privileged intent.
- Ensure the bot has **View Channel** + **Read Message History** in the target
  servers.

## ✅ 4. Already applied to production (no action needed)

- **RLS lockdown (P0‑1)** — I enabled Row‑Level Security on all 45 public tables
  and revoked `anon`/`authenticated` grants (verified: 45/45 RLS on, 0 grants
  remaining). The app is unaffected (it uses Prisma as the `postgres` role, which
  bypasses RLS; the anon key is only used for Storage). Applied as migration
  `lockdown_public_schema_rls`. To roll back: re-`GRANT` and `DISABLE ROW LEVEL
  SECURITY` (you won't need to).

---

## Deferred by design — recommended, but I did not auto‑apply

Each of these is either billing‑risky, destructive, or too large to do safely
without your review. The exact approach is noted so you (or I, on request) can
do it deliberately.

- **Entitlement‑expiry downgrade cron (R4)** — a naive "downgrade PAID where
  `subscriptionExpiresAt < now`" would **wrongly cancel active PayPal
  subscribers**, because the PayPal `PAYMENT.SALE.COMPLETED` webhook never
  extends the stored expiry. Correct order: (1) extend `subscriptionExpiresAt`
  on PayPal renewal events, (2) then add a daily cron that only downgrades
  `subscriptionStore='apple'` subs (Apple's receipt expiry is authoritative) or
  rows whose expiry is genuinely current. Needs billing testing.
- **Historical alert cleanup (Phase 3.7)** — the generation fix stops *new*
  duplicate/stale alerts, but the ~248k existing rows remain. After a backup,
  bulk‑acknowledge or delete the redundant pre‑fix `NEW_HIGH_RISK` rows.
- **Stock‑universe refresh (D2)** — add a scheduled step to
  `.github/workflows/enhanced-daily-evaluation.yml` that regenerates
  `evaluation/data/us-stocks.json` (frozen since 2026‑03‑14). The freshness gate
  I added stops dead tickers being scored, but the universe itself should refresh.
- **Out‑of‑band social scan (S1/S2)** — the timeout root cause. Move the scan
  from the 300 s Vercel function to the GitHub Actions job, posting results to
  the existing `/api/admin/social-scan/ingest`. Larger change; I can do it on
  request.
- **`strictNullChecks` (Q2)** — turn it on incrementally (start with
  `src/lib/admin`, `src/lib/scoring`, `src/lib/billing`), fixing surfaced nulls
  per file. Too broad to flip safely in one pass.
- **Table retention (D8)** — add a scheduled prune/partition for
  `StockDailySnapshot`, `StockRiskAlert`, `SocialMention`, `ApiUsageLog`
  (~460 MB and growing). I already added `RateLimitEntry` purge to the health
  cleanup.
- **Dead‑file cleanup (Q7)** — `evaluation/scripts/run-evaluation-{finnhub*,live}.ts`
  and `run-social-scan-{regular-stocks,standalone}.ts` appear unused (verify they
  aren't invoked manually, then delete). Left in place to avoid removing
  something you run by hand.
- **Shared `platform-patterns.ts` (Q3)** — the copies in `src/lib/social-scan`
  and `evaluation/scripts/social-scan` are currently byte‑identical; consolidating
  needs an `evaluation/tsconfig` `rootDir` change.
- **Remaining param clamps (R6)** — I applied the helper to the `days` routes and
  support; the `page`/`limit` routes (audit, scan‑messages/history,
  browser‑agents, model‑efficacy/scans, scan‑intelligence/stocks, email‑management,
  auth‑errors) can use the same `parsePage`/`parseLimit` helpers.

---

## After deploying — verify the two headline fixes

- **AI engine now runs:** run a scan, then check Admin → Model Efficacy: the
  `aiBackend` vs `tsFallback` split should show a non‑zero AI share (was ~0%).
- **Alerts are sane:** after the next ingest, Admin → Risk Alerts should show
  only genuine new transitions, not the whole HIGH list re‑stamped daily.
