import { getStripeIntegrationStatus } from "../lib/billing/provider";
import { POST as checkout } from "../app/api/billing/stripe/checkout/route";
import { POST as webhook } from "../app/api/billing/stripe/webhook/route";

const STRIPE_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PAID_PLAN_ID",
  "STRIPE_PRO_MAX_PRICE_ID",
] as const;

const originalEnv = Object.fromEntries(
  STRIPE_ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of STRIPE_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("Stripe safety gate", () => {
  test("refuses checkout and webhook processing without persistent replay protection", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_configured";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_configured";
    process.env.STRIPE_PRICE_PAID_PLAN_ID = "price_pro";
    process.env.STRIPE_PRO_MAX_PRICE_ID = "price_pro_max";

    expect(getStripeIntegrationStatus()).toEqual({
      available: false,
      checkout: false,
      webhooks: false,
      reason: "Persistent Stripe webhook replay protection is not configured",
    });
  });

  test("returns service unavailable from checkout and webhook routes before any billing mutation", async () => {
    const [checkoutResponse, webhookResponse] = await Promise.all([
      checkout(),
      webhook(),
    ]);

    expect(checkoutResponse.status).toBe(503);
    expect(await checkoutResponse.json()).toMatchObject({
      code: "STRIPE_UNAVAILABLE",
    });
    expect(webhookResponse.status).toBe(503);
    expect(await webhookResponse.json()).toMatchObject({
      code: "STRIPE_UNAVAILABLE",
    });
  });
});
