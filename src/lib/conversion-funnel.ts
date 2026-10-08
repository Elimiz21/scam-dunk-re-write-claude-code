export type FunnelPlan = "FREE" | "PAID" | "PRO_MAX";

export type FunnelStage =
  | "signed_up"
  | "email_verified"
  | "started_scanning"
  | "paid";

export type AnalyticsUserProperties = {
  user_type: "free" | "paid";
  subscription_plan: "free" | "pro" | "pro_max";
  funnel_stage: FunnelStage;
};

export function deriveFunnelStage(input: {
  emailVerified: boolean;
  hasStartedScanning: boolean;
  plan: FunnelPlan;
}): FunnelStage {
  if (input.plan !== "FREE") return "paid";
  if (input.hasStartedScanning) return "started_scanning";
  return input.emailVerified ? "email_verified" : "signed_up";
}

export function analyticsPlan(plan: FunnelPlan): Pick<
  AnalyticsUserProperties,
  "user_type" | "subscription_plan"
> {
  if (plan === "PRO_MAX") {
    return { user_type: "paid", subscription_plan: "pro_max" };
  }
  if (plan === "PAID") {
    return { user_type: "paid", subscription_plan: "pro" };
  }
  return { user_type: "free", subscription_plan: "free" };
}

export function buildAnalyticsIdentity(input: {
  userId: string;
  plan: FunnelPlan;
  emailVerified: boolean;
  hasStartedScanning: boolean;
}): { userId: string; userProperties: AnalyticsUserProperties } {
  return {
    userId: input.userId,
    userProperties: {
      ...analyticsPlan(input.plan),
      funnel_stage: deriveFunnelStage(input),
    },
  };
}

export function buildSubscriptionItem(plan: Exclude<FunnelPlan, "FREE">, valueCents: number) {
  const isProMax = plan === "PRO_MAX";
  return {
    item_id: isProMax ? "scamdunk_pro_max" : "scamdunk_pro",
    item_name: isProMax ? "ScamDunk Pro Max" : "ScamDunk Pro",
    item_category: "subscription",
    price: valueCents / 100,
    quantity: 1,
  };
}

export function buildPurchasePayload(input: {
  transactionId: string;
  plan: Exclude<FunnelPlan, "FREE">;
  valueCents: number;
  currency: string;
}) {
  return {
    transaction_id: input.transactionId,
    value: input.valueCents / 100,
    currency: input.currency.toUpperCase(),
    items: [buildSubscriptionItem(input.plan, input.valueCents)],
  };
}
