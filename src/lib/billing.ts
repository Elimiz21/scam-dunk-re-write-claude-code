/**
 * Billing Module
 *
 * Handles Stripe integration for subscription management.
 * This implementation includes stubs that can be replaced with actual Stripe calls.
 *
 * Required environment variables:
 * - STRIPE_SECRET_KEY
 * - STRIPE_PUBLISHABLE_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - STRIPE_PRICE_PAID_PLAN_ID
 */

import Stripe from "stripe";
import { config } from "./config";
import { prisma } from "./db";

// Initialize Stripe client (lazy initialization)
let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    if (!config.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeClient = new Stripe(config.stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return stripeClient;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return Boolean(config.stripeSecretKey && config.stripePricePaidPlanId);
}

/**
 * Create a Stripe Checkout session for upgrading to paid plan
 *
 * @param userId - The user's ID
 * @param userEmail - The user's email
 * @returns Checkout session URL or null if not configured
 */
export async function createCheckoutSession(
  userId: string,
  userEmail: string
): Promise<{ url: string | null; error?: string }> {
  if (!isStripeConfigured()) {
    // Return placeholder URL when Stripe is not configured
    console.warn("Stripe not configured - returning placeholder");
    return {
      url: null,
      error: "Payment system not configured. Please contact support.",
    };
  }

  try {
    const stripe = getStripe();

    // Check if user already has a Stripe customer ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { billingCustomerId: true },
    });

    let customerId = user?.billingCustomerId;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID
      await prisma.user.update({
        where: { id: userId },
        data: { billingCustomerId: customerId },
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: config.stripePricePaidPlanId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${config.nextAuthUrl}/account?upgraded=true`,
      cancel_url: `${config.nextAuthUrl}/account?canceled=true`,
      metadata: {
        userId: userId,
      },
    });

    return { url: session.url };
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return { url: null, error: "Failed to create checkout session" };
  }
}

/**
 * Create a Stripe Customer Portal session for managing subscription
 *
 * @param userId - The user's ID
 * @returns Portal session URL or null if not configured
 */
export async function createPortalSession(
  userId: string
): Promise<{ url: string | null; error?: string }> {
  if (!isStripeConfigured()) {
    return {
      url: null,
      error: "Payment system not configured. Please contact support.",
    };
  }

  try {
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { billingCustomerId: true },
    });

    if (!user?.billingCustomerId) {
      return { url: null, error: "No billing account found" };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.billingCustomerId,
      return_url: `${config.nextAuthUrl}/account`,
    });

    return { url: session.url };
  } catch (error) {
    console.error("Error creating portal session:", error);
    return { url: null, error: "Failed to create portal session" };
  }
}

/**
 * Handle Stripe webhook events
 *
 * @param body - Raw request body
 * @param signature - Stripe signature header
 * @returns Result of webhook processing
 */
export async function handleWebhook(
  body: string,
  signature: string
): Promise<{ success: boolean; error?: string }> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const stripe = getStripe();

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      config.stripeWebhookSecret
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;

        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: { plan: "PAID" },
          });
          console.log(`User ${userId} upgraded to PAID plan`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({
          where: { billingCustomerId: customerId },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { plan: "FREE" },
          });
          console.log(`User ${user.id} downgraded to FREE plan`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({
          where: { billingCustomerId: customerId },
        });

        if (user) {
          const isActive = subscription.status === "active";
          await prisma.user.update({
            where: { id: user.id },
            data: { plan: isActive ? "PAID" : "FREE" },
          });
          console.log(
            `User ${user.id} subscription updated: ${subscription.status}`
          );
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Webhook error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Webhook processing failed",
    };
  }
}

/**
 * Get user's subscription status
 */
export async function getSubscriptionStatus(userId: string): Promise<{
  plan: "FREE" | "PAID";
  isActive: boolean;
  canManage: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, billingCustomerId: true },
  });

  if (!user) {
    return { plan: "FREE", isActive: false, canManage: false };
  }

  return {
    plan: user.plan as "FREE" | "PAID",
    isActive: user.plan === "PAID",
    canManage: Boolean(user.billingCustomerId) && isStripeConfigured(),
  };
}
