## Status

Complete within the assigned billing/provider/account scope. Added one server-side billing catalog that consumes Task 1 entitlements and supplies plan labels, configured prices/product IDs, trial terms, credits, and monitor slots. Existing paid subscribers remain mapped to Pro and retain their stored PayPal subscription ID. The PayPal client now requests the configured Pro plan; Pro Max checkout is deliberately blocked because the current persisted user plan only supports `FREE`/`PAID`.

Stripe is fail-closed. The installed dependencies do not include a Stripe SDK, runtime Stripe configuration is absent, and the current schema has no persistent Stripe webhook-event/replay store or provider/trial fields. Checkout and webhook routes therefore return `503 STRIPE_UNAVAILABLE` without parsing events or mutating users. This is safer than an in-memory or unsigned implementation.

The account response now returns server-calculated current-plan data and a plan catalog. The account UI displays credits, full/price-monitor slots, provider, configured trial terms, plan comparison, and the required “checked after the trading day closes — not live” wording. Unauthenticated account access remains redirected to login. The public landing was intentionally left unchanged because it contains no pricing surface and the task requires preserving the production visual template.

## Commit hashes

- The Task 5 handoff supplies the final commit hash after this report is committed.

## Verification

- TDD red/green observed for the new billing provider, PayPal catalog details, Pro Max checkout guard, and Stripe unavailable routes.
- Focused Jest: 7 passed (`billing-entitlements.test.ts`, `stripe-webhook.test.ts`).
- `git diff --check` passed for Task 5 files.
- `npx tsc --noEmit` remains blocked by 10 pre-existing type errors in `src/tests/e2e.test.ts`; no Task 5 path appears in its output.
- `CI=1 npm run lint` cannot run because this checkout has no ESLint configuration and Next.js opens its interactive setup prompt.
- Browser smoke check on the local placeholder-env server: public homepage loaded at 1440px and 390px with no horizontal overflow; unauthenticated `/account` redirected to the login page with no runtime error. Local middleware correctly prevented unauthenticated billing-endpoint calls. A pre-existing `SyntaxError: Invalid or unexpected token` from `/_next/static/chunks/app/layout.js` remained visible; it also appeared in Task 1's browser report and was not introduced by this task.

## Concerns

- A production Stripe launch still requires an explicit database migration for provider, trial, Stripe customer/subscription, and unique webhook-event ID storage; then it needs signature-verified, idempotent checkout/webhook/portal integration and live provider verification.
- A production Pro Max checkout still requires persisted `PRO_MAX` state and provider product configuration. The UI shows the tier but refuses checkout until that state exists.
- Authenticated pricing, trial-active, active/canceled, and provider-error visual states cannot be browser-tested without a safe local test user/database or staging credentials. No credentials or payment data were entered.
- Existing unrelated parallel work and pre-existing login/signup edits were preserved and not staged.
