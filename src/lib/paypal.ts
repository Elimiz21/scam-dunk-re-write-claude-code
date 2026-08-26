/**
 * PayPal Billing Module
 *
 * Handles PayPal integration for subscription management.
 *
 * Required environment variables:
 * - PAYPAL_CLIENT_ID
 * - PAYPAL_CLIENT_SECRET
 * - PAYPAL_PLAN_ID
 * - PAYPAL_WEBHOOK_ID (optional, for webhook verification)
 * - PAYPAL_MODE (sandbox or live)
 */

import { prisma } from "./db";
import { logApiUsage } from "@/lib/admin/metrics";
import {
  BillingPlan,
  getBillingPlanCatalog,
  resolveBillingEntitlements,
} from "@/lib/billing/provider";

const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

/**
 * Get PayPal access token for API calls
 */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const startTime = Date.now();

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  await logApiUsage({
    service: "PAYPAL",
    endpoint: "/v1/oauth2/token",
    responseTime: Date.now() - startTime,
    statusCode: response.status,
    errorMessage: response.ok ? undefined : "Failed to get PayPal access token",
  });

  if (!response.ok) {
    throw new Error("Failed to get PayPal access token");
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Check if PayPal is configured
 */
export function isPayPalConfigured(plan: BillingPlan = "PAID"): boolean {
  const billingPlan = getBillingPlanCatalog()[plan];

  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    billingPlan.paypalPlanId,
  );
}

/**
 * Get PayPal configuration for frontend
 */
export function getPayPalConfig(plan: BillingPlan = "PAID") {
  const billingPlan = getBillingPlanCatalog()[plan];
  const trial = resolveBillingEntitlements({
    plan: "FREE",
    billingCustomerId: null,
  }).trial;

  return {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    planId: billingPlan.paypalPlanId || "",
    mode: process.env.PAYPAL_MODE || "sandbox",
    monthlyPriceCents: billingPlan.monthlyPriceCents,
    currency: billingPlan.currency,
    trialDays: trial.days,
    requiresPaymentMethod: trial.requiresPaymentMethod,
  };
}

export function planForPayPalPlanId(planId: unknown): Exclude<BillingPlan, "FREE"> | null {
  const catalog = getBillingPlanCatalog();
  if (planId && planId === catalog.PRO_MAX.paypalPlanId) return "PRO_MAX";
  if (planId && planId === catalog.PAID.paypalPlanId) return "PAID";
  return null;
}

/**
 * Verify PayPal webhook signature
 */
export async function verifyWebhookSignature(
  webhookId: string,
  headers: Record<string, string>,
  body: any,
): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    const startTime = Date.now();

    const verificationData = {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: body,
    };

    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(verificationData),
      },
    );

    await logApiUsage({
      service: "PAYPAL",
      endpoint: "/v1/notifications/verify-webhook-signature",
      responseTime: Date.now() - startTime,
      statusCode: response.status,
      errorMessage: response.ok
        ? undefined
        : "PayPal webhook verification failed",
    });

    if (!response.ok) {
      console.error(
        "PayPal webhook verification failed:",
        await response.text(),
      );
      return false;
    }

    const result = await response.json();
    return result.verification_status === "SUCCESS";
  } catch (error) {
    console.error("Error verifying PayPal webhook:", error);
    return false;
  }
}

/**
 * Get subscription details from PayPal
 */
export async function getSubscriptionDetails(subscriptionId: string) {
  try {
    const accessToken = await getAccessToken();
    const startTime = Date.now();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    await logApiUsage({
      service: "PAYPAL",
      endpoint: "/v1/billing/subscriptions/{id}",
      responseTime: Date.now() - startTime,
      statusCode: response.status,
      errorMessage: response.ok
        ? undefined
        : "Failed to get subscription details",
    });

    if (!response.ok) {
      throw new Error("Failed to get subscription details");
    }

    return await response.json();
  } catch (error) {
    console.error("Error getting subscription details:", error);
    throw error;
  }
}

/**
 * Handle PayPal webhook events
 */
export async function handleWebhook(
  headers: Record<string, string>,
  body: any,
): Promise<{ success: boolean; error?: string }> {
  if (!isPayPalConfigured()) {
    return { success: false, error: "PayPal not configured" };
  }

  try {
    // Verify webhook signature (required)
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      console.error("PAYPAL_WEBHOOK_ID is not configured — rejecting webhook");
      return { success: false, error: "Webhook verification not configured" };
    }
    const isValid = await verifyWebhookSignature(webhookId, headers, body);
    if (!isValid) {
      console.error("Invalid PayPal webhook signature");
      return { success: false, error: "Invalid webhook signature" };
    }

    const eventId = typeof body.id === "string" ? body.id : "";
    const eventType = body.event_type;
    const resource = body.resource;
    if (!eventId || typeof eventType !== "string" || !resource) {
      return { success: false, error: "Invalid webhook payload" };
    }

    console.log(`Processing PayPal webhook: ${eventType}`);

    await prisma.$transaction(async (transaction) => {
      try {
        await transaction.billingEvent.create({
          data: { provider: "PAYPAL", eventId, eventType },
        });
      } catch (error) {
        if ((error as { code?: string })?.code === "P2002") return;
        throw error;
      }

      switch (eventType) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        // Subscription was activated (after payment)
        const subscriptionId = resource.id;
        const customId = resource.custom_id; // We'll store userId here
        const plan = planForPayPalPlanId(resource.plan_id);
        if (!plan) throw new Error("Unsupported PayPal plan id");

        if (customId) {
          await transaction.user.update({
            where: { id: customId },
            data: {
              plan,
              billingProvider: "PAYPAL",
              billingCustomerId: subscriptionId,
              subscriptionStore: "paypal",
              subscriptionExpiresAt: resource.billing_info?.next_billing_time
                ? new Date(resource.billing_info.next_billing_time)
                : null,
            },
          });
          console.log(`User ${customId} upgraded to PAID plan via PayPal`);
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.EXPIRED": {
        // Subscription was cancelled, suspended, or expired
        const subscriptionId = resource.id;

        const user = await transaction.user.findFirst({
          where: { billingCustomerId: subscriptionId },
        });

        if (user) {
          await transaction.user.update({
            where: { id: user.id },
            data: {
              plan: "FREE",
              billingProvider: "NONE",
              billingCustomerId: null,
              subscriptionStore: null,
              subscriptionExpiresAt: null,
              formerPro: true,
            },
          });
          console.log(
            `User ${user.id} downgraded to FREE plan (PayPal subscription ${eventType})`,
          );
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.UPDATED": {
        // Subscription was updated
        const subscriptionId = resource.id;
        const status = resource.status;

        const user = await transaction.user.findFirst({
          where: { billingCustomerId: subscriptionId },
        });

        if (user) {
          const resolvedPlan = status === "ACTIVE"
            ? planForPayPalPlanId(resource.plan_id)
            : null;
          if (status === "ACTIVE" && !resolvedPlan) {
            throw new Error("Unsupported PayPal plan id");
          }
          const newPlan = resolvedPlan || "FREE";
          await transaction.user.update({
            where: { id: user.id },
            data: {
              plan: newPlan,
              billingProvider: newPlan === "FREE" ? "NONE" : "PAYPAL",
              subscriptionStore: newPlan === "FREE" ? null : "paypal",
              subscriptionExpiresAt: newPlan === "FREE"
                ? null
                : resource.billing_info?.next_billing_time
                  ? new Date(resource.billing_info.next_billing_time)
                  : null,
              ...(newPlan === "FREE" ? { formerPro: true, billingCustomerId: null } : {}),
            },
          });
          console.log(`User ${user.id} subscription updated: ${status}`);
        }
        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        // Recurring payment was successful
        const subscriptionId = resource.billing_agreement_id;

        const user = await transaction.user.findFirst({
          where: { billingCustomerId: subscriptionId },
        });

        if (user && user.plan === "FREE") {
          const plan = planForPayPalPlanId(resource.plan_id);
          if (!plan) throw new Error("Unsupported PayPal plan id");
          await transaction.user.update({
            where: { id: user.id },
            data: {
              plan,
              billingProvider: "PAYPAL",
              subscriptionStore: "paypal",
              subscriptionExpiresAt: resource.billing_info?.next_billing_time
                ? new Date(resource.billing_info.next_billing_time)
                : null,
            },
          });
          console.log(`User ${user.id} payment completed, ensured PAID plan`);
        }
        break;
      }

      case "PAYMENT.SALE.DENIED":
      case "PAYMENT.SALE.REFUNDED":
      case "PAYMENT.SALE.REVERSED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        // Payment failed, refunded, or reversed — PayPal will retry automatically.
        // We do NOT revoke PRO here; PayPal retries up to 3 times over ~15 days.
        // If all retries fail, PayPal suspends the subscription and sends
        // BILLING.SUBSCRIPTION.SUSPENDED, which is handled above and revokes PRO.
        const subscriptionId = resource.billing_agreement_id || resource.id;

        const user = await transaction.user.findFirst({
          where: { billingCustomerId: subscriptionId },
        });

        console.warn(
          `PayPal payment issue for user ${user?.id || "unknown"}: ${eventType}` +
            ` (subscription: ${subscriptionId}). PayPal will retry automatically.`,
        );
        break;
      }

      default:
        console.log(`Unhandled PayPal webhook event: ${eventType}`);
      }
    });

    return { success: true };
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Webhook processing failed",
    };
  }
}

/**
 * Update user's subscription with PayPal subscription ID
 * Called from the frontend after successful subscription approval
 */
export async function activateSubscription(
  userId: string,
  subscriptionId: string,
  requestedPlan: BillingPlan = "PAID",
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get subscription details to verify it's active and belongs to user
    const subscription = await getSubscriptionDetails(subscriptionId);

    if (
      subscription.status !== "ACTIVE" &&
      subscription.status !== "APPROVED"
    ) {
      return {
        success: false,
        error: "Subscription is not active",
      };
    }

    const expectedPlanId = getBillingPlanCatalog()[requestedPlan].paypalPlanId;
    if (!expectedPlanId || subscription.plan_id !== expectedPlanId) {
      return { success: false, error: "Subscription plan does not match the selected plan" };
    }

    // Verify subscription ownership
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const subscriberEmail =
      subscription.subscriber?.email_address?.toLowerCase();
    const customId = subscription.custom_id;
    if (customId !== userId && subscriberEmail !== user?.email?.toLowerCase()) {
      return {
        success: false,
        error: "Subscription does not belong to this user",
      };
    }

    // Update user to the verified PayPal plan.
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: requestedPlan,
        billingProvider: "PAYPAL",
        billingCustomerId: subscriptionId,
        subscriptionStore: "paypal",
        subscriptionExpiresAt: subscription.billing_info?.next_billing_time
          ? new Date(subscription.billing_info.next_billing_time)
          : null,
      },
    });

    console.log(
      `User ${userId} activated PayPal subscription ${subscriptionId}`,
    );
    return { success: true };
  } catch (error) {
    console.error("Error activating subscription:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to activate subscription",
    };
  }
}

/**
 * Get user's subscription status
 */
export async function getSubscriptionStatus(userId: string): Promise<{
  plan: "FREE" | "PAID" | "PRO_MAX";
  isActive: boolean;
  canManage: boolean;
  subscriptionId?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, billingCustomerId: true, billingProvider: true },
  });

  if (!user) {
    return { plan: "FREE", isActive: false, canManage: false };
  }

  return {
    plan: user.plan as "FREE" | "PAID" | "PRO_MAX",
    isActive: user.plan === "PAID" || user.plan === "PRO_MAX",
    canManage:
      Boolean(user.billingCustomerId) &&
      (user.billingProvider === "PAYPAL" || !user.billingProvider) &&
      isPayPalConfigured(),
    subscriptionId: user.billingCustomerId || undefined,
  };
}

/**
 * Cancel a user's PayPal subscription
 */
export async function cancelSubscription(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, billingCustomerId: true, billingProvider: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (user.plan !== "PAID" && user.plan !== "PRO_MAX") {
      return { success: true };
    }

    if (user.billingProvider && user.billingProvider !== "PAYPAL") {
      return { success: false, error: "Manage this subscription with its original billing provider." };
    }

    // If there's a PayPal subscription, cancel it via the API
    if (user.billingCustomerId) {
      const accessToken = await getAccessToken();
      const startTime = Date.now();

      const response = await fetch(
        `${PAYPAL_API_BASE}/v1/billing/subscriptions/${user.billingCustomerId}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "User requested cancellation from account settings",
          }),
        },
      );

      await logApiUsage({
        service: "PAYPAL",
        endpoint: "/v1/billing/subscriptions/{id}/cancel",
        responseTime: Date.now() - startTime,
        statusCode: response.status,
        errorMessage: response.ok ? undefined : "Failed to cancel subscription",
      });

      // PayPal returns 204 No Content on successful cancellation
      if (response.status !== 204 && !response.ok) {
        const errorText = await response.text();
        console.error("PayPal cancel subscription failed:", errorText);
        return {
          success: false,
          error: "Failed to cancel subscription with PayPal",
        };
      }

      console.log(
        `User ${userId} cancelled PayPal subscription ${user.billingCustomerId}`,
      );
    } else {
      console.log(
        `User ${userId} cancelled manually-upgraded Pro plan (no PayPal subscription)`,
      );
    }

    // Update user to FREE plan and mark as former Pro
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE", billingProvider: "NONE", formerPro: true },
    });

    return { success: true };
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to cancel subscription",
    };
  }
}

/**
 * Get user's subscription info including next billing date
 */
export async function getUserSubscriptionInfo(userId: string): Promise<{
  plan: "FREE" | "PAID" | "PRO_MAX";
  subscriptionId?: string;
  status?: string;
  nextBillingDate?: string;
  startDate?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, billingCustomerId: true, billingProvider: true },
  });

  if (!user) {
    return { plan: "FREE" };
  }

  const result: {
    plan: "FREE" | "PAID" | "PRO_MAX";
    subscriptionId?: string;
    status?: string;
    nextBillingDate?: string;
    startDate?: string;
  } = {
    plan: user.plan as "FREE" | "PAID" | "PRO_MAX",
  };

  // Only fetch PayPal details for active PAID subscribers to avoid
  // unnecessary API calls for ex-subscribers who still have billingCustomerId
  if (
    (user.plan === "PAID" || user.plan === "PRO_MAX") &&
    user.billingProvider === "PAYPAL" &&
    user.billingCustomerId &&
    isPayPalConfigured(user.plan as BillingPlan)
  ) {
    try {
      const details = await getSubscriptionDetails(user.billingCustomerId);
      result.subscriptionId = user.billingCustomerId;
      result.status = details.status;
      result.startDate = details.start_time;
      if (details.billing_info?.next_billing_time) {
        result.nextBillingDate = details.billing_info.next_billing_time;
      }
    } catch (error) {
      // If we can't fetch subscription details, just return what we have
      console.error("Failed to fetch subscription details:", error);
      result.subscriptionId = user.billingCustomerId;
    }
  }

  return result;
}
