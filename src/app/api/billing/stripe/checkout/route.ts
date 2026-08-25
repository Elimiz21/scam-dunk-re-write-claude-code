import { NextResponse } from "next/server";
import { getStripeIntegrationStatus } from "@/lib/billing/provider";

/**
 * Stripe is intentionally unavailable until a persistent webhook-event store
 * is deployed. Returning a 503 prevents an unverified checkout from being
 * mistaken for a working purchase path.
 */
export async function POST() {
  const status = getStripeIntegrationStatus();
  return NextResponse.json(
    { error: status.reason, code: "STRIPE_UNAVAILABLE" },
    { status: 503 },
  );
}
