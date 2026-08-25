import { NextResponse } from "next/server";
import { getStripeIntegrationStatus } from "@/lib/billing/provider";

/**
 * Do not accept or process Stripe events until the webhook signature and event
 * replay record can both be verified persistently.
 */
export async function POST() {
  const status = getStripeIntegrationStatus();
  return NextResponse.json(
    { error: status.reason, code: "STRIPE_UNAVAILABLE" },
    { status: 503 },
  );
}
