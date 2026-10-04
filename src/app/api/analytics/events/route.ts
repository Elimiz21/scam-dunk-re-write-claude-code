import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isAnalyticsClientId, recordConversionFunnelEvent } from "@/lib/conversion-funnel-server";

const eventSchema = z.object({
  eventType: z.enum(["PAYWALL_VIEW", "BEGIN_CHECKOUT"]),
  idempotencyKey: z.string().min(8).max(180),
  plan: z.enum(["PAID", "PRO_MAX"]).optional(),
  provider: z.enum(["STRIPE", "PAYPAL"]).optional(),
  transactionId: z.string().max(180).optional(),
  clientId: z.string().max(80).optional(),
  valueCents: z.number().int().min(0).max(100_000).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });

  const input = parsed.data;
  if (input.eventType === "BEGIN_CHECKOUT" && (!input.plan || !input.provider || !input.transactionId)) {
    return NextResponse.json({ error: "Incomplete checkout event." }, { status: 400 });
  }

  const event = await recordConversionFunnelEvent({
    userId: session.user.id,
    eventType: input.eventType,
    source: "web",
    idempotencyKey: input.idempotencyKey,
    plan: input.plan,
    provider: input.provider,
    transactionId: input.transactionId,
    valueCents: input.valueCents,
    currency: input.valueCents === undefined ? undefined : "USD",
    clientId: isAnalyticsClientId(input.clientId) ? input.clientId : undefined,
  });
  return NextResponse.json({ recorded: event.created });
}
