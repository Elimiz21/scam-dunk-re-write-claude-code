import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { prisma } from "@/lib/db";
import {
  getPlanForStripePrice,
  getStripeClient,
  shouldApplyStripeSubscriptionEvent,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const periodEnd = (subscription as Stripe.Subscription & {
    current_period_end?: number;
  }).current_period_end;
  return periodEnd ? new Date(periodEnd * 1000) : null;
}

/**
 * Do not accept or process Stripe events until the webhook signature and event
 * replay record can both be verified persistently.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured.", code: "STRIPE_UNAVAILABLE" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      try {
        await transaction.billingEvent.create({
          data: { provider: "STRIPE", eventId: event.id, eventType: event.type },
        });
      } catch (error) {
        if ((error as { code?: string })?.code === "P2002") return;
        throw error;
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId || session.client_reference_id;
        const subscription = typeof session.subscription === "string"
          ? await getStripeClient().subscriptions.retrieve(session.subscription)
          : session.subscription;
        const actualPlan = subscription && typeof subscription !== "string"
          ? getPlanForStripePrice(subscription.items.data[0]?.price?.id)
          : null;
        const requestedPlan = session.metadata?.plan;
        const subscriptionActive = subscription && typeof subscription !== "string"
          && ["active", "trialing", "past_due"].includes(subscription.status);
        const currentUser = userId
          ? await transaction.user.findUnique({
              where: { id: userId },
              select: { billingSubscriptionId: true },
            })
          : null;
        if (
          userId &&
          currentUser &&
          subscription &&
          typeof subscription !== "string" &&
          shouldApplyStripeSubscriptionEvent(currentUser.billingSubscriptionId, subscription.id) &&
          session.mode === "subscription" &&
          actualPlan &&
          actualPlan === requestedPlan &&
          subscriptionActive
        ) {
          const trialStart = subscription.trial_start;
          const trialEnd = subscription.trial_end;
          await transaction.user.update({
            where: { id: userId },
            data: {
              plan: actualPlan,
              billingProvider: "STRIPE",
              billingCustomerId: typeof session.customer === "string" ? session.customer : null,
              trialStartedAt: trialStart ? new Date(trialStart * 1000) : null,
              trialEndsAt: trialEnd ? new Date(trialEnd * 1000) : null,
              subscriptionStore: "stripe",
              subscriptionExpiresAt: subscriptionPeriodEnd(subscription),
              billingSubscriptionId: subscription.id,
            },
          });
        }
      }

      if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanForStripePrice(priceId);
        const userId = subscription.metadata?.userId;
        const user = userId
          ? await transaction.user.findUnique({ where: { id: userId }, select: { id: true, billingSubscriptionId: true } })
          : await transaction.user.findFirst({ where: { billingProvider: "STRIPE", billingCustomerId: String(subscription.customer) }, select: { id: true, billingSubscriptionId: true } });
        if (user && shouldApplyStripeSubscriptionEvent(user.billingSubscriptionId, subscription.id)) {
          const active = event.type !== "customer.subscription.deleted" && ["active", "trialing", "past_due"].includes(subscription.status);
          await transaction.user.update({
            where: { id: user.id },
            data: {
              plan: active && plan ? plan : "FREE",
              billingProvider: active && plan ? "STRIPE" : "NONE",
              billingCustomerId: String(subscription.customer),
              subscriptionStore: active && plan ? "stripe" : null,
              subscriptionExpiresAt: active ? subscriptionPeriodEnd(subscription) : null,
              billingSubscriptionId: active && plan ? subscription.id : null,
              formerPro: !active,
              trialStartedAt: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
              trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            },
          });
        }
      }
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}
