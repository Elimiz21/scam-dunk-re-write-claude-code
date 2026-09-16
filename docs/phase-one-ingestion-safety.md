# Phase one ingestion safety

Evaluation ingestion and stale social-scan cleanup are write operations. Both
routes now fail closed until the request and deployment target are verified.
The admin evaluation POST performs the same target verification before session
lookup, storage access, ingestion, or audit-log writes.

## Environment contract

Vercel system environment variables must remain enabled so `VERCEL_ENV` and
`VERCEL_PROJECT_ID` are available at runtime. The application source binds
production writes to Vercel project `prj_U6Fd6Lch5b39VS27foWZGUzqTmQS` and
Supabase project `gwzcluijtbuglznwdqqk`.

Production accepts documented Supabase direct database hosts
(`db.<ref>.supabase.co`) and pooler hosts
(`postgres.<ref>@*.pooler.supabase.com`). `DATABASE_URL` and
`NEXT_PUBLIC_SUPABASE_URL` must independently resolve to the production ref.

Preview requires `EXPECTED_PREVIEW_SUPABASE_PROJECT_REF`. Its value and both
URLs must identify the same non-production Supabase project. A Preview that
targets the production ref is always denied.

Local tests and smoke checks require all three settings below. This fixture
mode accepts loopback URLs only and is ignored by Production and Preview.

```dotenv
INGESTION_LOCAL_FIXTURE=true
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

`CRON_SECRET` must be present in Production and Preview. Vercel Cron sends it
as an exact `Authorization: Bearer <secret>` header. Missing, empty, malformed,
or incorrect credentials return 401 before target verification or other work.

## Scheduled cleanup

`GET /api/admin/social-scan` is read-only. Vercel calls
`GET /api/cron/social-scan-cleanup` hourly at minute 7. The cleanup performs one
atomic update whose predicate requires `status = RUNNING` and `updatedAt` older
than ten minutes. A fresh heartbeat or terminal status therefore prevents the
row from being expired even if it changes while cleanup is running.

## Release verification record

Before approving a Preview, record these values with the test evidence:

- Git commit SHA under review
- expected deployment environment (`preview`)
- Vercel project ID reported by the deployment
- expected Preview Supabase project ref (the ref is non-secret)
- HTTP results for unauthorized ingestion, unsafe-target ingestion, and the
  authorized isolated fixture path

Do not exercise these routes against Production during Preview verification.
After a future production promotion, verify the deployed SHA separately and
confirm the scheduled routes return 401 without credentials. Do not place
database URLs, `CRON_SECRET`, or authorization headers in the release record.
