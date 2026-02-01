import { NextRequest, NextResponse } from "next/server";
import { handleWebhook } from "@/lib/paypal";

/**
 * POST /api/billing/paypal/webhook
 *
 * Handles PayPal webhook events (IPN - Instant Payment Notification)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Extract PayPal webhook headers
    const headers: Record<string, string> = {
      "paypal-auth-algo": req.headers.get("paypal-auth-algo") || "",
      "paypal-cert-url": req.headers.get("paypal-cert-url") || "",
      "paypal-transmission-id": req.headers.get("paypal-transmission-id") || "",
      "paypal-transmission-sig": req.headers.get("paypal-transmission-sig") || "",
      "paypal-transmission-time": req.headers.get("paypal-transmission-time") || "",
    };

    const result = await handleWebhook(headers, body);

    if (!result.success) {
      console.error("PayPal webhook processing failed:", result.error);
      return NextResponse.json(
        { error: result.error || "Webhook processing failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
