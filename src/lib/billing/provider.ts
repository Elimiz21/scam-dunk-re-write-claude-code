import { prisma } from "@/lib/db";
import { getPlanEntitlements } from "@/lib/entitlements";

export type BillingPlan = "FREE" | "PAID" | "PRO_MAX";
export type BillingProvider = "NONE" | "PAYPAL" | "MANUAL";

export interface BillingPlanConfig {
  plan: BillingPlan;
  displayName: "Free" | "Pro" | "Pro Max";
  monthlyPriceCents: number | null;
  currency: "USD";
  paypalPlanId: string | null;
  stripePriceId: string | null;
  manualScanCredits: number;
  fullMonitorSlots: number;
  priceMonitorSlots: number;
  savedWatchlistLimit: null;
}

export interface BillingEntitlements extends BillingPlanConfig {
  provider: BillingProvider;
  subscriptionId: string | null;
  trial: {
    days: number;
    requiresPaymentMethod: true;
    startsAt: null;
    endsAt: null;
  };
}

interface BillingUserRecord {
  plan: string;
  billingCustomerId?: string | null;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function configuredString(value: string | undefined): string | null {
  return value?.trim() || null;
}

function configuredPrice(value: string | undefined, fallback: number | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function planConfig(plan: BillingPlan, price: number | null, paypalPlanId: string | null, stripePriceId: string | null): BillingPlanConfig {
  const entitlements = getPlanEntitlements(plan);

  return {
    ...entitlements,
    monthlyPriceCents: price,
    currency: "USD",
    paypalPlanId,
    stripePriceId,
  };
}

/**
 * Server-only catalog used by billing responses and provider adapters. Product
 * identifiers and prices are configuration, never client-side constants.
 */
export function getBillingPlanCatalog(): Record<BillingPlan, BillingPlanConfig> {
  return {
    FREE: planConfig("FREE", 0, null, null),
    PAID: planConfig(
      "PAID",
      configuredPrice(process.env.BILLING_PRO_MONTHLY_PRICE_CENTS, 499),
      configuredString(process.env.PAYPAL_PLAN_ID),
      configuredString(process.env.STRIPE_PRICE_PAID_PLAN_ID),
    ),
    PRO_MAX: planConfig(
      "PRO_MAX",
      configuredPrice(process.env.BILLING_PRO_MAX_MONTHLY_PRICE_CENTS, null),
      configuredString(process.env.PAYPAL_PRO_MAX_PLAN_ID),
      configuredString(process.env.STRIPE_PRO_MAX_PRICE_ID),
    ),
  };
}

function billingPlan(plan: string): BillingPlan {
  return plan === "PRO_MAX" ? "PRO_MAX" : plan === "PAID" ? "PAID" : "FREE";
}

function trialTerms() {
  return {
    days: nonNegativeInteger(process.env.BILLING_FREE_TRIAL_DAYS, 0),
    requiresPaymentMethod: true as const,
    startsAt: null,
    endsAt: null,
  };
}

/**
 * Resolves server-calculated display data while preserving legacy paid users as
 * Pro and treating their saved subscription ID as a PayPal subscription.
 */
export function resolveBillingEntitlements(
  user: BillingUserRecord,
): BillingEntitlements {
  const plan = billingPlan(user.plan);
  const planConfig = getBillingPlanCatalog()[plan];
  const subscriptionId = user.billingCustomerId || null;

  return {
    ...planConfig,
    provider:
      plan === "FREE" ? "NONE" : subscriptionId ? "PAYPAL" : "MANUAL",
    subscriptionId,
    trial: trialTerms(),
  };
}

/**
 * Reads only the persisted account state needed to build billing display data.
 * The current schema has no Stripe provider or trial fields, so only existing
 * PayPal subscription IDs are represented as provider-managed subscriptions.
 */
export async function getBillingEntitlements(
  userId: string,
): Promise<BillingEntitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, billingCustomerId: true },
  });

  return resolveBillingEntitlements(
    user ?? { plan: "FREE", billingCustomerId: null },
  );
}

/**
 * Stripe is intentionally disabled until a persistent event-id store exists.
 * In-memory deduplication is not safe in a serverless deployment.
 */
export function getStripeIntegrationStatus() {
  return {
    available: false,
    checkout: false,
    webhooks: false,
    reason: "Persistent Stripe webhook replay protection is not configured",
  } as const;
}
