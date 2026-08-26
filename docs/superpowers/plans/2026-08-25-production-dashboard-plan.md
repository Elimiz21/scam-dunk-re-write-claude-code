# ScamDunk Production Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-backed ScamDunk dashboard and monitoring experience that uses real market/social scan data while preserving the current site's visual template and billing users safely.

**Architecture:** Add a server-side entitlement and monitoring domain around the existing Prisma/User/ScanUsage, TrackedStock/StockDailySnapshot/DailyScanSummary, ScanHistory, and SocialScanRun/SocialMention models. Add user-owned watchlist/monitor/ledger models and typed API payloads, then render the prototype's dashboard information architecture with existing production components/tokens. Reuse published market-wide EOD results for automatic monitoring; never substitute mock data or per-user live scans.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Prisma 5/PostgreSQL, NextAuth, existing PayPal integration, Stripe server SDK/API if the project-approved dependency is added, Jest/ts-jest, existing CSS variables and UI components, browser verification against a local production build.

**Spec:** `docs/superpowers/specs/2026-08-25-production-dashboard-design.md`

## Global Constraints

- V1 supports US-listed common stocks only; unsupported inputs consume no credits and create no history.
- Free gets 5 manual scan credits/month and 1 scheduled EOD price monitor; Pro gets 50/2 full/5 price; Pro Max gets 200/10 full/20 price.
- Saved watchlist additions/removals never consume credits and have no hard cap in V1.
- Automatic monitoring uses published end-of-day market-wide results, charges one credit per ticker evaluated, and never claims live monitoring.
- Monitor frequency is daily or weekly; duration is 1–24 months; no minimum commitment; skipped/stale/unpublished runs do not charge credits.
- Risk labels are exactly `High risk`, `Caution`, and `Low risk`.
- Use `/src/app/globals.css` and existing production components as the visual source of truth; do not import prototype fonts/CSS/mock data.
- Preserve dirty user edits in `src/app/(auth)/login/page.tsx` and `src/app/(auth)/signup/page.tsx`.
- Existing PayPal subscribers keep PayPal; new customers may use PayPal or Stripe; billing mutations require verified server-side events.
- Each task must run its focused tests and a relevant browser smoke check before handoff.

---

### Task 1: Establish server-side entitlements and supported-stock validation

**Files:**
- Modify: `src/lib/config.ts`, `src/lib/types.ts`, `src/lib/usage.ts`
- Create: `src/lib/entitlements.ts`, `src/lib/stock-universe.ts`
- Create: `src/tests/entitlements.test.ts`, `src/tests/stock-universe.test.ts`

**Interfaces:**
- `getPlanEntitlements(plan: Plan | string): PlanEntitlements` returns manual credits, full-monitor slots, price-monitor slots, and display metadata.
- `getMonitorSlotKey(kind: "FULL" | "PRICE"): "fullMonitorSlots" | "priceMonitorSlots"`.
- `normalizeSupportedTicker(input: string): { ok: true; ticker: string } | { ok: false; reason: "UNSUPPORTED_ASSET" | "INVALID_TICKER" }`.
- `reserveScanSlot` remains the atomic manual-scan reservation path; automatic runs will call a separate idempotent ledger reservation in Task 3.

- [ ] Write failing tests for all three plans, unknown-plan fallback to FREE, ticker normalization, rejection of crypto/options/ETF/non-US-style input, and exact risk-label mapping.
- [ ] Run `npm test -- --runInBand src/tests/entitlements.test.ts src/tests/stock-universe.test.ts`; verify the new tests fail for missing exports.
- [ ] Implement the pure entitlements and stock-universe helpers; make `getScanLimit` delegate to the new plan configuration without changing existing auth/login behavior.
- [ ] Run the focused tests and `npx tsc --noEmit`; verify all pass.
- [ ] Browser smoke-check the existing public scan form at desktop/mobile widths to ensure its current visual structure remains unchanged before later dashboard changes.

### Task 2: Add watchlist, monitor, execution, and notification persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260825_dashboard_monitoring/migration.sql` using the repository's migration convention, plus `prisma/scripts/verify-dashboard-migration.ts`
- Create: `src/lib/monitoring/types.ts`, `src/lib/monitoring/repository.ts`
- Create: `src/tests/monitoring-repository.test.ts`

**Interfaces:**
- `WatchlistEntry` has unique `(userId, ticker)` and timestamps for add/update/last data.
- `ActiveMonitor` has kind, frequency, `startsAt`, `expiresAt`, status, last/next evaluation, and a unique active-slot relationship per watchlist entry/kind.
- `MonitorExecution` has unique `(monitorId, publicationKey)` plus `status`, `creditReserved`, `creditCharged`, skip/error reason, and notification idempotency key.
- `NotificationDelivery` has unique `(userId, executionId, channel)` and delivery status/error metadata.
- Repository functions are `listWatchlist`, `upsertWatchlistTicker`, `removeWatchlistTicker`, `listMonitors`, `createMonitor`, `updateMonitor`, `deleteMonitor`, and `recordExecutionOnce`.

- [ ] Write failing repository contract tests using mocked Prisma for idempotent add/remove, unique monitor slots, max 24-month expiry, and duplicate publication-key execution.
- [ ] Run the focused test file and verify failures identify missing schema/repository behavior.
- [ ] Add backfill-safe Prisma models/relations/indexes; do not alter or delete existing rows. Add the SQL needed for production migration and a script that reports pre-existing conflicting rows instead of deleting them.
- [ ] Implement repository functions with transaction boundaries and explicit status transitions.
- [ ] Run `npx prisma generate`, the focused tests, and a schema validation command against the available local/database environment; report any unavailable database separately.
- [ ] Browser smoke-check authenticated account navigation still loads and no new server error is introduced by Prisma client generation.

### Task 3: Implement dashboard, Pump Radar, watchlist, monitor, and history APIs

**Files:**
- Create: `src/lib/dashboard-data.ts`, `src/lib/pump-radar.ts`, `src/lib/monitoring/runner.ts`
- Create: `src/app/api/dashboard/route.ts`, `src/app/api/pump-radar/route.ts`
- Create: `src/app/api/watchlist/route.ts`, `src/app/api/monitors/route.ts`
- Create: `src/app/api/scans/history/route.ts`, `src/app/api/scans/[id]/route.ts`
- Create: `src/app/api/cron/monitoring/route.ts`, guarded by the repository's existing cron secret convention
- Create: `src/tests/dashboard-api.test.ts`, `src/tests/monitoring-runner.test.ts`, `src/tests/history-api.test.ts`

**Interfaces:**
- `getPumpRadar({ limit, viewer })` returns only published market-wide rows with `asOf`, `publishedAt`, coverage, exact risk labels, anonymized ticker display policy, and optional social summary.
- `getDashboardPayload(userId)` returns plan usage, freshness, Pump Radar preview, watchlist preview, recent scans, and monitor slot counts.
- `runEligibleMonitorPublication(publicationKey)` reuses one published EOD dataset, records exactly one execution/credit per `(monitor,ticker,publicationKey)`, skips stale/unpublished data without charge, and queues in-app/email notifications.
- History ordering accepts only `MOST_RECENT`, `HIGHEST_RISK`, or `DATE_ADDED`; invalid ordering returns 400.

- [ ] Write failing API tests for unauthenticated access, unsupported ticker no-charge behavior, no-charge watchlist add/remove, monitor slot limits by plan, 24-month boundary, stale publication skip, exactly-once credit charge, safe sort whitelist, and public Pump Radar privacy.
- [ ] Run the focused tests and verify the failures are meaningful.
- [ ] Implement server-only data shaping from `TrackedStock`/`StockDailySnapshot`/`DailyScanSummary` and compatible `SocialScanRun`/`SocialMention` rows; never return private social content through Pump Radar.
- [ ] Implement authenticated mutations with Zod validation, transaction-backed slot checks, and structured error codes for `UNSUPPORTED_TICKER`, `PLAN_LIMIT`, `STALE_DATA`, `NO_CREDITS`, and `UNAUTHORIZED`.
- [ ] Implement the scheduled runner with a secret/cron guard, publication freshness check, expiry handling, execution idempotency, and notification enqueue/delivery hooks.
- [ ] Run focused tests, `npx tsc --noEmit`, and curl smoke checks against a local dev server for public Pump Radar and unauthenticated protected endpoints.
- [ ] Browser-check network responses and visible error states for dashboard/watchlist endpoints using an authenticated test session or deterministic local fixture, without exposing service keys.

### Task 4: Build the production dashboard UI and public Pump Radar

**Files:**
- Create: `src/app/(protected)/dashboard/page.tsx`, `src/app/(protected)/watchlist/page.tsx`, `src/app/(protected)/recent-scans/page.tsx`
- Create: `src/components/dashboard/DashboardHome.tsx`, `src/components/dashboard/PumpRadar.tsx`, `src/components/dashboard/WatchlistTable.tsx`, `src/components/dashboard/MonitorEditor.tsx`, `src/components/dashboard/RecentScansTable.tsx`, `src/components/dashboard/UsageSummary.tsx`, `src/components/dashboard/FreshnessNote.tsx`
- Modify: `src/app/HomeContent.tsx`, `src/app/page.tsx`, `src/app/(protected)/layout.tsx`, `src/components/Header.tsx`, `src/components/Sidebar.tsx`, `src/components/ScanResultsLayout.tsx`
- Create: `src/tests/dashboard-components.test.tsx` if the repository's Jest setup supports component rendering; otherwise add pure render/state tests for extracted helpers.

**Interfaces:**
- Components consume the server-shaped API payloads from Task 3 and never infer plan limits/credits client-side.
- `PumpRadar` accepts `{ rows, asOf, publishedAt, coverage, socialSummary }` and renders `High risk`, `Caution`, `Low risk` plus the non-live disclaimer.
- `MonitorEditor` accepts server entitlements and emits only a validated create/update request; it shows daily/weekly, 1–24 months, full vs price, slots used/available, and credit estimate.
- `RecentScansTable` exposes the exact `Most recent`, `Highest risk`, `Date added to watchlist` order menu with keyboard and screen-reader labels.

- [ ] Write failing state/render tests for loading, empty, unavailable, stale, unsupported, plan-limit, and successful states; assert no mock ticker text is embedded.
- [ ] Implement dashboard home using existing production layout/header/sidebar/card/button/risk primitives and CSS variables; preserve current homepage scan interaction.
- [ ] Implement watchlist and recent scans pages with responsive table/card layouts, order menu, monitor editor, no-credit save behavior, and exact copy that says monitoring is after-market, not live.
- [ ] Add social evidence sections to scan detail/result only when production data exists; show “not analyzed” when the source was not provided.
- [ ] Add Pump Radar to the public homepage before/after login using the public API response, with clear as-of/freshness/coverage labels.
- [ ] Run component/state tests, `npx tsc --noEmit`, and `npm run lint`; fix every error.
- [ ] Browser-check public homepage, dashboard, watchlist, recent scans, scan detail, desktop/mobile widths, keyboard order menus, focus outlines, empty/error states, and console/network errors. Capture screenshots for visual comparison with the current production template.

### Task 5: Extend billing safely for plan entitlements, trial card collection, and Stripe

**Files:**
- Modify: `src/lib/paypal.ts`, `src/components/PayPalButton.tsx`, `src/components/LimitReached.tsx`
- Create: `src/lib/billing/provider.ts`, Stripe server integration and webhook/checkout routes under `src/app/api/billing/stripe/`
- Modify: `src/app/(protected)/account/page.tsx`, `src/app/(protected)/layout.tsx`, and `src/components/landing/LandingOptionA.tsx`
- Create: `src/tests/billing-entitlements.test.ts`, `src/tests/stripe-webhook.test.ts`

**Interfaces:**
- `getBillingEntitlements(userId)` returns plan, provider, trial dates, prices/product IDs from server configuration, credits, and monitor slots.
- `activate/cancel/renew` flows are provider-aware and idempotent; webhook event IDs are stored or otherwise deduplicated.
- Existing PayPal subscribers continue using existing PayPal endpoints; Stripe is an additional new-customer checkout/webhook/portal path.

- [ ] Write failing tests for existing PayPal subscriber preservation, Stripe webhook idempotency, trial payment-method requirement, plan table values, and server-calculated slot/credit display.
- [ ] Run focused billing tests and verify failures.
- [ ] Extract a single server-side plan configuration and adapt PayPal responses to it without changing current subscriber IDs or cancellation semantics.
- [ ] Add Stripe integration only when its server dependency/configuration is available; verify signatures before any user-plan mutation and store event IDs for replay safety.
- [ ] Update account/pricing UI to show free/pro/pro max credits and monitor slots, no-live-monitoring copy, trial date, provider, and upgrade/manage actions.
- [ ] Run focused tests, typecheck, and browser-check pricing/account/checkout states with missing-config, trial, active, canceled, and provider-error states. Do not use live payment credentials in local tests.

### Task 6: Add admin monitoring and social/publication operations

**Files:**
- Modify: `src/app/admin/dashboard/page.tsx`, `src/components/admin/AdminLayout.tsx`
- Create: `src/app/admin/monitoring/page.tsx`, `src/app/api/admin/monitoring/route.ts`, `src/components/admin/MonitoringHealthPanel.tsx`
- Create: `src/tests/admin-monitoring.test.ts`

**Interfaces:**
- Admin API returns publication freshness/coverage, monitor execution counts/status/skip reasons/credits charged, notification delivery, social-scan freshness, and billing provider/config status.
- Admin route uses the existing admin session/auth middleware and role checks; no new admin login is created.

- [ ] Write failing admin API tests for unauthorized, viewer/read-only, admin, and owner access plus stale/error summaries.
- [ ] Implement read-only admin query/panel with the existing admin components and visual language.
- [ ] Run focused tests and typecheck.
- [ ] Browser-check admin dashboard/monitoring at desktop/mobile widths, including empty/error/stale states and no service-key leakage in network responses.

### Task 7: Integrate, migrate, and verify the full user journey

**Files:**
- Modify: only files identified by focused test failures or integration wiring; do not overwrite auth files with pre-existing user edits.
- Create: `docs/superpowers/verification/2026-08-25-production-dashboard-verification.md`

- [ ] Run `git diff --check` and inspect `git status --short`; verify the two pre-existing auth edits remain unchanged except where explicitly required.
- [ ] Run `npx prisma generate`, migration validation, `npx tsc --noEmit`, `npm run lint`, and `npm test -- --runInBand`.
- [ ] Start a production-like local server with safe test env values and use the browser to exercise public homepage → sign-up/login → dashboard → scan → add watchlist → configure monitor → recent scans → result/social evidence → account/billing → admin monitoring.
- [ ] Repeat key flows at mobile viewport; inspect console errors, failed requests, focus/keyboard behavior, stale/unavailable states, and horizontal overflow.
- [ ] Verify credit ledger counts for manual and automatic scans, duplicate runner retry, unsupported ticker, and no-charge watchlist mutations.
- [ ] Verify screenshots/colors/fonts/spacing against the current production template and confirm no prototype CDN/font/mock-data assets are referenced.
- [ ] Record what was verified locally versus what requires preview/production credentials or deployment access.
- [ ] Only after all checks pass, prepare the deployment/PR handoff. Live deployment must include a post-deploy build-log check and live URL/browser smoke check; do not claim production completion from a local pass.
