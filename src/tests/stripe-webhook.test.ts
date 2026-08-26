import { getStripeIntegrationStatus } from "../lib/billing/provider";
import { shouldApplyStripeSubscriptionEvent } from "../lib/stripe";
import { POST as checkout } from "../app/api/billing/stripe/checkout/route";
import { POST as webhook } from "../app/api/billing/stripe/webhook/route";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

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
  test("reports configured Stripe checkout and webhook readiness", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_configured";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_configured";
    process.env.STRIPE_PRICE_PAID_PLAN_ID = "price_pro";
    process.env.STRIPE_PRO_MAX_PRICE_ID = "price_pro_max";

    expect(getStripeIntegrationStatus()).toMatchObject({
      available: true,
      checkout: true,
      webhooks: true,
      reason: null,
      prices: { paid: true, proMax: true },
    });
  });

  test("requires authentication for checkout and signature verification for webhooks", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const checkoutResponse = await checkout(new Request("http://localhost/api/billing/stripe/checkout", { method: "POST", body: JSON.stringify({ plan: "PAID" }) }) as never);
    const webhookResponse = await webhook(new Request("http://localhost/api/billing/stripe/webhook", { method: "POST" }) as never);
    expect(checkoutResponse.status).toBe(401);
    expect(webhookResponse.status).toBe(503);
  });

  test("ignores delayed events from a superseded Stripe subscription", () => {
    const currentEventAt = new Date("2026-08-26T12:00:00.000Z");
    expect(
      shouldApplyStripeSubscriptionEvent(
        "sub-current",
        "sub-old",
        currentEventAt,
        new Date("2026-08-26T11:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      shouldApplyStripeSubscriptionEvent(
        "sub-current",
        "sub-current",
        currentEventAt,
        new Date("2026-08-26T11:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      shouldApplyStripeSubscriptionEvent(
        "sub-current",
        "sub-current",
        currentEventAt,
        new Date("2026-08-26T13:00:00.000Z"),
      ),
    ).toBe(true);
    expect(shouldApplyStripeSubscriptionEvent(null, "sub-first", null, currentEventAt)).toBe(true);
    expect(
      shouldApplyStripeSubscriptionEvent(
        "sub-old",
        "sub-new",
        currentEventAt,
        new Date("2026-08-26T11:00:00.000Z"),
        true,
      ),
    ).toBe(true);
  });
});
