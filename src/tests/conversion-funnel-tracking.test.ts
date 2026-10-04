import {
  buildAnalyticsIdentity,
  buildPurchasePayload,
  buildSubscriptionItem,
  deriveFunnelStage,
} from "../lib/conversion-funnel";

describe("conversion funnel analytics contract", () => {
  test("segments a verified free user who has started scanning", () => {
    expect(
      buildAnalyticsIdentity({
        userId: "usr_test_1",
        plan: "FREE",
        emailVerified: true,
        hasStartedScanning: true,
      }),
    ).toEqual({
      userId: "usr_test_1",
      userProperties: {
        user_type: "free",
        subscription_plan: "free",
        funnel_stage: "started_scanning",
      },
    });
  });

  test("segments paid users with their actual plan", () => {
    expect(
      buildAnalyticsIdentity({
        userId: "usr_test_2",
        plan: "PRO_MAX",
        emailVerified: true,
        hasStartedScanning: true,
      }).userProperties,
    ).toEqual({
      user_type: "paid",
      subscription_plan: "pro_max",
      funnel_stage: "paid",
    });
  });

  test("uses the earliest incomplete funnel milestone before a scan begins", () => {
    expect(deriveFunnelStage({ emailVerified: false, hasStartedScanning: false, plan: "FREE" })).toBe("signed_up");
    expect(deriveFunnelStage({ emailVerified: true, hasStartedScanning: false, plan: "FREE" })).toBe("email_verified");
  });

  test("builds a GA4-compatible subscription purchase payload", () => {
    expect(
      buildPurchasePayload({
        transactionId: "cs_test_123",
        plan: "PAID",
        valueCents: 499,
        currency: "usd",
      }),
    ).toEqual({
      transaction_id: "cs_test_123",
      value: 4.99,
      currency: "USD",
      items: [
        {
          item_id: "scamdunk_pro",
          item_name: "ScamDunk Pro",
          item_category: "subscription",
          price: 4.99,
          quantity: 1,
        },
      ],
    });
  });

  test("uses clear plan names in ecommerce items", () => {
    expect(buildSubscriptionItem("PRO_MAX", 1499)).toMatchObject({
      item_id: "scamdunk_pro_max",
      item_name: "ScamDunk Pro Max",
      price: 14.99,
    });
  });
});
