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
import { config } from "./config";
import { logApiUsage } from "@/lib/admin/metrics";

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
export function isPayPalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_PLAN_ID
  );
}

/**
 * Get PayPal configuration for frontend
 */
export function getPayPalConfig() {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    planId: process.env.PAYPAL_PLAN_ID || "",
    mode: process.env.PAYPAL_MODE || "sandbox",
  };
}

/**
 * Verify PayPal webhook signature
 */
export async function verifyWebhookSignature(
  webhookId: string,
  headers: Record<string, string>,
  body: any
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
      }
    );

    await logApiUsage({
      service: "PAYPAL",
      endpoint: "/v1/notifications/verify-webhook-signature",
      responseTime: Date.now() - startTime,
      statusCode: response.status,
      errorMessage: response.ok ? undefined : "PayPal webhook verification failed",
    });

    if (!response.ok) {
      console.error("PayPal webhook verification failed:", await response.text());
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
      }
    );

    await logApiUsage({
      service: "PAYPAL",
      endpoint: "/v1/billing/subscriptions/{id}",
      responseTime: Date.now() - startTime,
      statusCode: response.status,
      errorMessage: response.ok ? undefined : "Failed to get subscription details",
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
  body: any
): Promise<{ success: boolean; error?: string }> {
  if (!isPayPalConfigured()) {
    return { success: false, error: "PayPal not configured" };
  }

  try {
    // Verify webhook signature if webhook ID is configured
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (webhookId) {
      const isValid = await verifyWebhookSignature(webhookId, headers, body);
      if (!isValid) {
        console.error("Invalid PayPal webhook signature");
        return { success: false, error: "Invalid webhook signature" };
      }
    }

    const eventType = body.event_type;
    const resource = body.resource;

    console.log(`Processing PayPal webhook: ${eventType}`);

    switch (eventType) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        // Subscription was activated (after payment)
        const subscriptionId = resource.id;
        const customId = resource.custom_id; // We'll store userId here

        if (customId) {
          await prisma.user.update({
            where: { id: customId },
            data: {
              plan: "PAID",
              billingCustomerId: subscriptionId,
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

        const user = await prisma.user.findFirst({
          where: { billingCustomerId: subscriptionId },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { plan: "FREE" },
          });
          console.log(`User ${user.id} downgraded to FREE plan (PayPal subscription ${eventType})`);
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.UPDATED": {
        // Subscription was updated
        const subscriptionId = resource.id;
        const status = resource.status;

        const user = await prisma.user.findFirst({
          where: { billingCustomerId: subscriptionId },
        });

        if (user) {
          const newPlan = status === "ACTIVE" ? "PAID" : "FREE";
          await prisma.user.update({
            where: { id: user.id },
            data: { plan: newPlan },
          });
          console.log(`User ${user.id} subscription updated: ${status}`);
        }
        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        // Recurring payment was successful
        const subscriptionId = resource.billing_agreement_id;

        const user = await prisma.user.findFirst({
          where: { billingCustomerId: subscriptionId },
        });

        if (user && user.plan !== "PAID") {
          await prisma.user.update({
            where: { id: user.id },
            data: { plan: "PAID" },
          });
          console.log(`User ${user.id} payment completed, ensured PAID plan`);
        }
        break;
      }

      default:
        console.log(`Unhandled PayPal webhook event: ${eventType}`);
    }

    return { success: true };
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Webhook processing failed",
    };
  }
}

/**
 * Update user's subscription with PayPal subscription ID
 * Called from the frontend after successful subscription approval
 */
export async function activateSubscription(
  userId: string,
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get subscription details to verify it's active
    const subscription = await getSubscriptionDetails(subscriptionId);

    if (subscription.status !== "ACTIVE" && subscription.status !== "APPROVED") {
      return {
        success: false,
        error: "Subscription is not active",
      };
    }

    // Update user to PAID plan
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: "PAID",
        billingCustomerId: subscriptionId,
      },
    });

    console.log(`User ${userId} activated PayPal subscription ${subscriptionId}`);
    return { success: true };
  } catch (error) {
    console.error("Error activating subscription:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to activate subscription",
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
  subscriptionId?: string;
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
    canManage: Boolean(user.billingCustomerId) && isPayPalConfigured(),
    subscriptionId: user.billingCustomerId || undefined,
  };
}

/**
 * Cancel a user's PayPal subscription
 */
export async function cancelSubscription(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, billingCustomerId: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (!user.billingCustomerId) {
      return { success: false, error: "No active subscription found" };
    }

    // Cancel the subscription via PayPal API
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
      }
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
      return { success: false, error: "Failed to cancel subscription with PayPal" };
    }

    // Update user to FREE plan
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE" },
    });

    console.log(`User ${userId} cancelled PayPal subscription ${user.billingCustomerId}`);
    return { success: true };
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to cancel subscription",
    };
  }
}

/**
 * Get user's subscription info including next billing date
 */
export async function getUserSubscriptionInfo(userId: string): Promise<{
  plan: "FREE" | "PAID";
  subscriptionId?: string;
  status?: string;
  nextBillingDate?: string;
  startDate?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, billingCustomerId: true },
  });

  if (!user) {
    return { plan: "FREE" };
  }

  const result: {
    plan: "FREE" | "PAID";
    subscriptionId?: string;
    status?: string;
    nextBillingDate?: string;
    startDate?: string;
  } = {
    plan: user.plan as "FREE" | "PAID",
  };

  // If user has a subscription, fetch details from PayPal
  if (user.billingCustomerId && isPayPalConfigured()) {
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
