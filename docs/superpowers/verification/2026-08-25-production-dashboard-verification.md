# Production dashboard verification — 2026-08-25

## Verified locally

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed with pre-existing advisory warnings only.
- Focused/full non-E2E Jest suite — 14 suites, 152 tests passed.
- `npm run build` with placeholder local secrets and unreachable local database — passed with exit code 0.
- `npx prisma validate` and `npx prisma generate` — passed.
- `git diff --check` — passed.
- Chrome smoke test at `http://127.0.0.1:3114/` — page rendered, Pump Radar visible, exact non-live copy visible, stock-only copy visible, no horizontal overflow, and zero nested link/button pairs.
- Chrome protected-route test — `/dashboard`, `/watchlist`, and `/recent-scans` redirected to `/login` when unauthenticated.

## Product behavior included

- Free / Pro / Pro Max entitlements: 5 / 50 / 200 manual credits; 0 / 2 / 10 full monitors; 1 / 5 / 20 price monitors; unlimited saved watchlist entries.
- Monitoring is explicitly after end of trading day, not live, with daily/weekly schedules and 1–24 month durations.
- Unsupported instruments are rejected before credit reservation.
- Automatic execution reuses published market-wide EOD data, charges only completed/published ticker executions, and queues in-app/email notifications.
- Risk labels are customer-facing `High risk`, `Caution`, and `Low risk`.
- PayPal is preserved; Stripe is additive and fail-closed unless prices, credentials, webhook verification, and durable replay storage are configured.
- Stripe checkout uses idempotency protection and verifies the actual subscription price before granting entitlements.
- PayPal webhook events use durable event-ID replay protection; Pro Max is supported when its PayPal plan is configured.
- Apple receipt validation accepts only configured products, maps Pro Max correctly, and records subscription expiry.

## Remaining deployment gates

- The local verification database intentionally points at `127.0.0.1:1`; migration application and real dashboard data cannot be proven without the configured deployment database. Run the new Prisma migration in the deployment migration workflow and verify the `BillingEvent`, `billingProvider`, `trialStartedAt`, `trialEndsAt`, and `subscriptionExpiresAt` fields.
- Browser authentication was not bypassed. Protected dashboard rendering with real account data requires a valid preview/staging login and a reachable database.
- No production deployment or domain cutover was claimed from local evidence.
