import { NextRequest, NextResponse } from "next/server";
import { getPayPalConfig } from "@/lib/paypal";
import { BillingPlan } from "@/lib/billing/provider";

/**
 * GET /api/billing/paypal/config
 *
 * Returns PayPal configuration for the frontend
 */
export async function GET(request: NextRequest) {
  try {
    const requestedPlan = request.nextUrl.searchParams.get("plan");
    const plan: BillingPlan =
      requestedPlan === "PRO_MAX"
        ? "PRO_MAX"
        : requestedPlan === "PAID" || requestedPlan === null
          ? "PAID"
          : "FREE";

    if (plan === "FREE") {
      return NextResponse.json(
        { error: "Free does not require checkout" },
        { status: 400 },
      );
    }

    // The current persistence contract records only FREE/PAID. Do not sell a
    // Pro Max PayPal subscription until its plan state can be stored safely.
    if (plan === "PRO_MAX") {
      return NextResponse.json(
        { error: "Pro Max checkout is not available yet" },
        { status: 409 },
      );
    }

    const config = getPayPalConfig(plan);

    if (!config.clientId || !config.planId) {
      return NextResponse.json(
        { error: "PayPal not configured" },
        { status: 503 },
      );
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Error getting PayPal config:", error);
    return NextResponse.json(
      { error: "Failed to get PayPal configuration" },
      { status: 500 },
    );
  }
}
