import { NextResponse } from "next/server";
import { getPayPalConfig } from "@/lib/paypal";

/**
 * GET /api/billing/paypal/config
 *
 * Returns PayPal configuration for the frontend
 */
export async function GET() {
  try {
    const config = getPayPalConfig();

    if (!config.clientId || !config.planId) {
      return NextResponse.json(
        { error: "PayPal not configured" },
        { status: 500 }
      );
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Error getting PayPal config:", error);
    return NextResponse.json(
      { error: "Failed to get PayPal configuration" },
      { status: 500 }
    );
  }
}
