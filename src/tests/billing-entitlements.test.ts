import {
  getBillingPlanCatalog,
  resolveBillingEntitlements,
} from "../lib/billing/provider";
import { getPayPalConfig } from "../lib/paypal";
import { GET as paypalConfig } from "../app/api/billing/paypal/config/route";
import { NextRequest } from "next/server";

const BILLING_ENV_KEYS = [
  "BILLING_PRO_MONTHLY_PRICE_CENTS",
  "BILLING_PRO_MAX_MONTHLY_PRICE_CENTS",
  "BILLING_FREE_TRIAL_DAYS",
  "PAYPAL_PLAN_ID",
  "PAYPAL_PRO_MAX_PLAN_ID",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "STRIPE_PRICE_PAID_PLAN_ID",
  "STRIPE_PRO_MAX_PRICE_ID",
] as const;

const originalEnv = Object.fromEntries(
  BILLING_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function setBillingEnv(): void {
  process.env.BILLING_PRO_MONTHLY_PRICE_CENTS = "499";
  process.env.BILLING_PRO_MAX_MONTHLY_PRICE_CENTS = "1499";
  process.env.BILLING_FREE_TRIAL_DAYS = "14";
  process.env.PAYPAL_PLAN_ID = "P-LEGACY-PRO";
  process.env.PAYPAL_PRO_MAX_PLAN_ID = "P-PRO-MAX";
  process.env.PAYPAL_CLIENT_ID = "paypal-client";
  process.env.PAYPAL_CLIENT_SECRET = "paypal-secret";
  process.env.STRIPE_PRICE_PAID_PLAN_ID = "price_pro";
  process.env.STRIPE_PRO_MAX_PRICE_ID = "price_pro_max";
}

function restoreBillingEnv(): void {
  for (const key of BILLING_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("billing plan catalog", () => {
  beforeEach(setBillingEnv);
  afterEach(restoreBillingEnv);

  test("exposes the approved credits and scheduled monitor slots from the server catalog", () => {
    const catalog = getBillingPlanCatalog();

    expect(catalog.FREE).toMatchObject({
      displayName: "Free",
      monthlyPriceCents: 0,
      manualScanCredits: 5,
      fullMonitorSlots: 0,
      priceMonitorSlots: 1,
    });
    expect(catalog.PAID).toMatchObject({
      displayName: "Pro",
      monthlyPriceCents: 499,
      manualScanCredits: 50,
      fullMonitorSlots: 2,
      priceMonitorSlots: 5,
      paypalPlanId: "P-LEGACY-PRO",
      stripePriceId: "price_pro",
    });
    expect(catalog.PRO_MAX).toMatchObject({
      displayName: "Pro Max",
      monthlyPriceCents: 1499,
      manualScanCredits: 200,
      fullMonitorSlots: 10,
      priceMonitorSlots: 20,
      paypalPlanId: "P-PRO-MAX",
      stripePriceId: "price_pro_max",
    });
  });

  test("maps an existing paid subscription to PayPal without changing its subscription id", () => {
    const billing = resolveBillingEntitlements({
      plan: "PAID",
      billingCustomerId: "I-EXISTING-PAYPAL-SUBSCRIPTION",
    });

    expect(billing).toMatchObject({
      plan: "PAID",
      displayName: "Pro",
      provider: "PAYPAL",
      subscriptionId: "I-EXISTING-PAYPAL-SUBSCRIPTION",
      manualScanCredits: 50,
      fullMonitorSlots: 2,
      priceMonitorSlots: 5,
    });
  });

  test("requires a payment method before a configured free trial starts", () => {
    const billing = resolveBillingEntitlements({ plan: "FREE" });

    expect(billing.trial).toEqual({
      days: 14,
      requiresPaymentMethod: true,
      startsAt: null,
      endsAt: null,
    });
  });

  test("selects the configured PayPal plan without changing the legacy Pro plan id", () => {
    expect(getPayPalConfig("PAID")).toMatchObject({
      planId: "P-LEGACY-PRO",
      monthlyPriceCents: 499,
      trialDays: 14,
      requiresPaymentMethod: true,
    });
  });

  test("does not expose Pro Max checkout before its persisted plan state exists", async () => {
    const response = await paypalConfig(
      new NextRequest("http://localhost/api/billing/paypal/config?plan=PRO_MAX"),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Pro Max checkout is not available yet",
    });
  });
});
