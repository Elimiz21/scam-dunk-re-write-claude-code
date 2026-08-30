import Stripe from "stripe";

import type { BillingPlan } from "@/lib/billing/provider";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_NOT_CONFIGURED");
  stripeClient ??= new Stripe(secret);
  return stripeClient;
}

export function getStripePriceId(plan: BillingPlan): string | null {
  if (plan === "PAID") return process.env.STRIPE_PRICE_PAID_PLAN_ID?.trim() || null;
  if (plan === "PRO_MAX") return process.env.STRIPE_PRO_MAX_PRICE_ID?.trim() || null;
  return null;
}

export function getPlanForStripePrice(priceId: string | null | undefined): BillingPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PAID_PLAN_ID) return "PAID";
  if (priceId === process.env.STRIPE_PRO_MAX_PRICE_ID) return "PRO_MAX";
  return null;
}

export function shouldApplyStripeSubscriptionEvent(
  currentSubscriptionId: string | null,
  incomingSubscriptionId: string,
  currentEventAt: Date | null,
  incomingEventAt: Date,
  allowReplacement = false,
): boolean {
  if (currentSubscriptionId !== incomingSubscriptionId) {
    return !currentSubscriptionId || allowReplacement;
  }
  return !currentEventAt || incomingEventAt >= currentEventAt;
}
