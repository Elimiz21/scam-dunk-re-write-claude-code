import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { analyticsPlan, buildPurchasePayload, type FunnelPlan } from "@/lib/conversion-funnel";

export const CONVERSION_EVENT_TYPES = {
  PAYWALL_VIEW: "PAYWALL_VIEW",
  BEGIN_CHECKOUT: "BEGIN_CHECKOUT",
  PURCHASE: "PURCHASE",
} as const;

export type ConversionEventType =
  (typeof CONVERSION_EVENT_TYPES)[keyof typeof CONVERSION_EVENT_TYPES];

type ConversionEventInput = {
  userId?: string | null;
  eventType: ConversionEventType;
  source: "web" | "stripe_webhook" | "paypal";
  idempotencyKey: string;
  plan?: Exclude<FunnelPlan, "FREE">;
  provider?: "STRIPE" | "PAYPAL";
  transactionId?: string;
  valueCents?: number;
  currency?: string;
  clientId?: string;
  occurredAt?: Date;
};

export function isAnalyticsClientId(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+$/.test(value) && value.length <= 80;
}

/**
 * Persists first-party conversion facts before attempting any external
 * analytics call. Unique idempotency keys make webhook and retry delivery safe.
 */
export async function recordConversionFunnelEvent(input: ConversionEventInput) {
  try {
    const event = await prisma.conversionFunnelEvent.create({
      data: {
        userId: input.userId ?? null,
        eventType: input.eventType,
        source: input.source,
        plan: input.plan,
        provider: input.provider,
        transactionId: input.transactionId,
        valueCents: input.valueCents,
        currency: input.currency?.toUpperCase(),
        clientId: input.clientId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
      },
    });
    return { created: true, event };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { created: false, event: null };
    }
    throw error;
  }
}

type ServerAnalyticsEvent = {
  clientId?: string | null;
  userId?: string | null;
  name: "purchase";
  params: Record<string, unknown>;
  plan: Exclude<FunnelPlan, "FREE">;
};

/**
 * Server-to-server GA4 delivery is intentionally best-effort: a GA outage can
 * never block or roll back a confirmed payment. The first-party ledger above
 * remains the authoritative source for internal reporting.
 */
export async function sendServerAnalyticsEvent(input: ServerAnalyticsEvent) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-377T7N93Q6";
  const apiSecret = process.env.GA4_API_SECRET;
  if (!apiSecret || !isAnalyticsClientId(input.clientId)) {
    return { sent: false, reason: "not_configured_or_missing_client_id" as const };
  }

  const userProperties = analyticsPlan(input.plan);
  try {
    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: input.clientId,
          ...(input.userId ? { user_id: input.userId } : {}),
          user_properties: Object.fromEntries(
            Object.entries(userProperties).map(([key, value]) => [key, { value }]),
          ),
          events: [{ name: input.name, params: { engagement_time_msec: 1, ...input.params } }],
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      console.error("GA4 Measurement Protocol delivery failed", response.status);
      return { sent: false, reason: "ga4_rejected" as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error("GA4 Measurement Protocol delivery failed", error instanceof Error ? error.name : "unknown");
    return { sent: false, reason: "ga4_unreachable" as const };
  }
}

export async function recordPurchase(input: {
  userId: string;
  transactionId: string;
  plan: Exclude<FunnelPlan, "FREE">;
  valueCents: number;
  currency: string;
  provider: "STRIPE" | "PAYPAL";
  clientId?: string | null;
  occurredAt: Date;
}) {
  const recorded = await recordConversionFunnelEvent({
    userId: input.userId,
    eventType: "PURCHASE",
    source: input.provider === "STRIPE" ? "stripe_webhook" : "paypal",
    idempotencyKey: `${input.provider.toLowerCase()}:purchase:${input.transactionId}`,
    plan: input.plan,
    provider: input.provider,
    transactionId: input.transactionId,
    valueCents: input.valueCents,
    currency: input.currency,
    clientId: input.clientId ?? undefined,
    occurredAt: input.occurredAt,
  });

  if (recorded.created) {
    await sendServerAnalyticsEvent({
      clientId: input.clientId,
      userId: input.userId,
      name: "purchase",
      params: buildPurchasePayload({
        transactionId: input.transactionId,
        plan: input.plan,
        valueCents: input.valueCents,
        currency: input.currency,
      }),
      plan: input.plan,
    });
  }
  return recorded;
}

export async function recordStripePurchase(input: {
  userId: string;
  checkoutSessionId: string;
  plan: Exclude<FunnelPlan, "FREE">;
  valueCents: number;
  currency: string;
  clientId?: string | null;
  occurredAt: Date;
}) {
  return recordPurchase({
    ...input,
    transactionId: input.checkoutSessionId,
    provider: "STRIPE",
  });
}
