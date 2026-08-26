# ScamDunk Production Dashboard Design Specification

**Status:** Approved product direction; implementation must preserve the existing production visual system and current authentication/billing behavior until each migration is verified.

## Goal

Bring the dashboard, watchlist, active monitoring, Pump Radar, recent scans, and social-scan evidence from `ScamDunkProto-master` into the production ScamDunk Next.js application using the production repository's real APIs and database data. The prototype is an information-architecture and interaction reference only; its mock data, Tailwind CDN, fonts, colors, and static scanning behavior must not ship.

## Product decisions

### Supported scan inputs

- Keep the existing ticker and pasted-message scan flows.
- Keep screenshot/image evidence as an optional input wherever the current production scan flow supports it.
- V1 supports US-listed common stocks only. Reject crypto, options, futures, bonds, ETFs, non-US symbols, and unrecognized tickers with a clear in-product explanation.
- A rejected/unsupported input consumes no scan credit and is not added to history.
- Social-media results are displayed as evidence in scan results when available; they are not presented as a live social feed.

### Plans and entitlements

The product separates saved watchlist capacity from paid active monitoring. Saving/removing a ticker is free and does not consume credits. The initial entitlement table is:

| Plan | Monthly manual scan credits | Saved watchlist | Full monitors | Price monitors | Monitoring behavior |
| --- | ---: | --- | ---: | ---: | --- |
| Free | 5 | No hard cap in V1 | 0 | 1 | Scheduled EOD price check only |
| Pro | 50 | No hard cap in V1 | 2 | 5 | Scheduled EOD monitoring |
| Pro Max | 200 | No hard cap in V1 | 10 | 20 | Scheduled EOD monitoring |

Plan prices and provider product/plan IDs remain configuration, not hard-coded UI logic. The current Pro price is retained unless the billing configuration is intentionally changed. Existing subscribers remain on their current provider. New customers may choose Stripe or PayPal. A free trial requests a card/payment method at trial start; trial users are not charged until the configured trial terms end. Promotional bonus credits may be granted to paid tiers later, but credit purchasing is out of V1 scope.

### Monitoring and credits

- “Price monitoring” is scheduled end-of-day monitoring, not live price monitoring. Every relevant UI surface must say this plainly: “Checked after the trading day closes — not live.”
- Active monitoring supports daily and weekly schedules. Users may choose a duration from 1 month through 24 months, with no minimum commitment beyond the selected duration. No schedule runs after its expiry.
- Daily and weekly automatic monitoring reuses the latest successfully published market-wide end-of-day scan. It must not launch one provider/AI scan per user/ticker when the published market-wide result already covers the ticker.
- Each ticker detected and evaluated by an automatic monitoring run consumes one scan credit. Watchlist changes, unsupported inputs, failed runs, and stale/unpublished market-wide data do not consume credits.
- A full monitor uses the full published risk/evidence layers. A price monitor uses the published price/volume/risk layers and must not be described as a full forensic scan.
- If a scheduled run cannot use a fresh published market-wide result, it is skipped, marked unavailable, and the user is notified in-app and by email; it does not silently consume a credit.
- Monitoring notifications are in-app and email. V1 does not promise SMS, push, or live alerts.

### Risk and Pump Radar language

- The user-facing risk labels are exactly: `High risk`, `Caution`, and `Low risk`.
- Pump Radar is a public/homepage and authenticated-dashboard module showing anonymized, market-wide findings from the latest successfully published scan. It is visible before and after login.
- Pump Radar is not the same as personal monitoring: Pump Radar is market-wide observation; active monitoring is a user's selected watchlist schedule and entitlement.
- Pump Radar must show freshness/coverage metadata, such as the end-of-day date and “last published” time. It must never imply live coverage.
- Pump Radar results may include social-scan evidence summaries when the production social scan has completed for the same or a compatible market-wide run.

## User experience

### Dashboard information architecture

Use the prototype's structure as a reference, implemented as production Next routes/components:

- Dashboard home: scan composer, usage summary, Pump Radar preview, watchlist preview, recent scans preview, and clear freshness labels.
- Watchlist: add/search supported tickers, save/remove without credits, configure a full or price monitor when the plan allows it, show the exact monitor slot usage, schedule, expiry, last evaluated date, and next scheduled evaluation.
- Recent scans: show manual and automatic results with risk labels, source type, date, ticker, and social evidence availability. Include an “Order by” control with `Most recent`, `Highest risk`, and `Date added to watchlist`.
- Scan detail/result: preserve the production result layout and colors; add market, price/volume, pitch/message, and social-media evidence sections only when data exists. Distinguish “not analyzed” from “no risk found.”
- Account/billing: show plan, monthly credits used/remaining, saved watchlist count, full-monitor slots, price-monitor slots, current billing provider, trial state, and upgrade/manage actions.
- Public homepage: preserve the current production hero and scan experience; add a Pump Radar section using the same production typography, colors, spacing, and responsive behavior. Do not copy prototype fonts or CDN CSS.

### Design constraints

- `/src/app/globals.css` and the existing production components are the visual source of truth for font families, sizes, colors, radii, spacing, focus states, risk colors, and dark-mode behavior.
- Do not introduce Inter/Inter Tight, the prototype's teal/ink/paper palette, Tailwind CDN, or visual-only mock cards.
- All new interactions must have loading, empty, error, unauthorized, unsupported-input, quota-exhausted, and stale-data states.
- Mobile layouts must keep the primary scan action, risk label, freshness note, and monitor state legible without horizontal scrolling.
- Use accessible labels, keyboard-operable menus, focus-visible styles, and semantic buttons/links.

## Data and API contract

### Authoritative sources

- User identity and plan: existing authenticated `User`/NextAuth flow.
- Manual scan history: existing `ScanHistory` and current scan API result contract.
- Market-wide risk data: published `TrackedStock`, `StockDailySnapshot`, and `DailyScanSummary` records. A record is eligible for customer display only when the corresponding scan publication is complete according to the existing ingestion/publishing rules.
- Social evidence: `SocialScanRun` and `SocialMention`, joined by ticker and the compatible completed scan date/run.
- Admin operations: existing `/admin` workspace and admin API routes. Add dashboard health/monitoring visibility there; do not replace the admin dashboard.

### New persistence

Add normalized user-owned models for saved watchlist entries, active monitor schedules, monitor execution ledger, and notification delivery/idempotency. Preserve existing rows and use explicit nullable/backfill-safe fields. The execution ledger must support exactly-once credit charging per user/ticker/run and must retain skipped/error reasons for support and admin review.

At minimum, the model/API concepts are:

```ts
type MonitorKind = "FULL" | "PRICE";
type MonitorFrequency = "DAILY" | "WEEKLY";
type MonitorStatus = "ACTIVE" | "EXPIRED" | "PAUSED" | "ERROR";

type WatchlistEntry = {
  id: string;
  userId: string;
  ticker: string;
  addedAt: string;
  lastManualScanAt: string | null;
  lastMarketDataAt: string | null;
};

type ActiveMonitor = {
  id: string;
  watchlistEntryId: string;
  kind: MonitorKind;
  frequency: MonitorFrequency;
  startsAt: string;
  expiresAt: string;
  status: MonitorStatus;
  lastEvaluatedAt: string | null;
  nextEvaluationAt: string | null;
};
```

The read API must return server-calculated plan limits, remaining slots, credits, monitor state, result freshness, and notification state. The client must not calculate entitlement or charge decisions.

Required authenticated endpoints (exact route names may follow repository conventions):

- `GET /api/dashboard` — one server-shaped home payload, including usage, Pump Radar, watchlist preview, recent scans, and freshness.
- `GET/POST/DELETE /api/watchlist` — list/add/remove supported US common stocks; idempotent add; no credit charge.
- `GET/POST/PATCH/DELETE /api/monitors` — list/create/update/delete active monitors; enforce plan slots and 24-month maximum server-side.
- `GET /api/scans/history` — paginated history with safe ordering by recent, highest risk, or watchlist-added date.
- `GET /api/scans/:id` or the repository's equivalent — full result plus social evidence and source/freshness metadata.
- Existing billing endpoints — extend plan/entitlement responses without breaking PayPal subscribers; add Stripe checkout/webhooks/portal only through server-side verified events.
- Public `GET /api/pump-radar` and authenticated dashboard usage of the same response shape — only published market-wide data, never per-user private content.

### Failure and freshness behavior

- Never render fake zeroes or canned tickers when a data query fails. Show the last valid published timestamp if available, otherwise an explicit unavailable state.
- Do not expose provider keys, Supabase service keys, billing secrets, or private social content to the client.
- All mutation APIs validate with Zod or the repository's established validation pattern, require auth/admin auth as appropriate, and return structured errors.
- Credit reservations are atomic and idempotent. A monitor execution may not double-charge on retries.

## Billing migration

- Preserve existing `FREE` and paid users while introducing explicit plan entitlements behind a single server-side plan configuration.
- Keep existing PayPal subscription/webhook behavior working for current subscribers.
- Add Stripe as an equivalent new-customer path with verified webhooks and provider-aware cancellation/portal behavior.
- Do not switch an existing subscriber's provider or silently change their price/renewal terms.
- Trial checkout must request a card/payment method and show the trial end date and post-trial price before confirmation.
- Billing UI must show what is included and what is not: saved watchlist is free; active monitoring uses plan slots and scheduled scan credits; monitoring is not live.

## Admin and operations

Extend the existing admin dashboard with read-only operational views for:

- market-wide scan publication date/status and coverage;
- monitor runs by status, skipped/stale reasons, credits charged, and notification delivery;
- plan/entitlement configuration and billing provider status;
- social-scan completion and evidence freshness;
- user-facing error samples and replay/idempotency keys.

No new standalone admin login or admin application is allowed.

## Verification gates

Every implementation task must pass its focused tests before integration. The final gate must include:

1. TypeScript/lint checks and the full Jest suite.
2. Prisma schema/client generation and migration validation against a disposable/local database where available.
3. API tests for unsupported inputs, no-credit watchlist changes, plan-slot limits, 24-month expiry, stale/unpublished scan behavior, exactly-once credit charging, and provider webhook idempotency.
4. Browser checks on public homepage, authenticated dashboard, watchlist, recent scans, scan detail, billing, and admin monitoring views at desktop and mobile widths. Check console errors, failed network requests, keyboard menus, focus states, empty/error states, and responsive overflow.
5. Visual comparison against the current production design template, not the prototype's CSS. Verify the existing login/signup edits remain intact.
6. Deployment checks that distinguish local build, preview, production deployment, and live URL behavior. Do not call the feature live until the production URL and critical flows are verified.

## Explicit non-goals for V1

- Live/intraday price monitoring or guaranteed real-time alerts.
- Crypto, options, futures, bonds, ETFs, non-US equities, or unsupported asset classes.
- Mock data in production.
- Credit purchases or paid add-on packs.
- SMS/push notifications.
- Replacing the existing admin dashboard.
- Rebuilding the public site from prototype HTML or changing the production design system.
