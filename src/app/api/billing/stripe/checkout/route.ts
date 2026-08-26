import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBillingPlanCatalog } from "@/lib/billing/provider";
import { getPlanForStripePrice, getStripeClient, getStripePriceId } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Returning a 503 prevents checkout from succeeding without a verified,
 * persistent entitlement update path.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Authentication required.", code: "UNAUTHORIZED" }, { status: 401 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const plan = body && typeof body === "object" && "plan" in body ? (body as { plan?: unknown }).plan : null;
  if (plan !== "PAID" && plan !== "PRO_MAX") {
    return NextResponse.json({ error: "A supported billing plan is required.", code: "INVALID_PLAN" }, { status: 400 });
  }
  const priceId = getStripePriceId(plan);
  const catalog = getBillingPlanCatalog()[plan];
  if (!priceId || !catalog.stripePriceId || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "This Stripe plan is not configured.", code: "STRIPE_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, billingProvider: true, billingCustomerId: true },
    });
    if (user && user.plan !== "FREE" && user.billingCustomerId) {
      return NextResponse.json(
        { error: "An active subscription is already attached to this account.", code: "ACTIVE_SUBSCRIPTION" },
        { status: 409 },
      );
    }
    const stripe = getStripeClient();
    const trialDays = Number.parseInt(process.env.BILLING_FREE_TRIAL_DAYS || "0", 10);
    const subscriptionData: { metadata: Record<string, string>; trial_period_days?: number } = {
      metadata: { userId: session.user.id, plan },
    };
    if (Number.isInteger(trialDays) && trialDays > 0) subscriptionData.trial_period_days = trialDays;
    const baseUrl = process.env.NEXTAUTH_URL || "https://scamdunk.com";
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: session.user.email,
      client_reference_id: session.user.id,
      payment_method_collection: "always",
      subscription_data: subscriptionData,
      success_url: `${baseUrl}/account?billing=success`,
      cancel_url: `${baseUrl}/account?billing=cancelled`,
      metadata: { userId: session.user.id, plan },
    }, {
      idempotencyKey: `checkout:${session.user.id}:${plan}:${Math.floor(Date.now() / 300000)}`,
    });
    return NextResponse.json({ url: checkout.url, id: checkout.id });
  } catch (error) {
    console.error("Stripe checkout creation failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Stripe checkout is temporarily unavailable.", code: "STRIPE_UNAVAILABLE" }, { status: 503 });
  }
}
