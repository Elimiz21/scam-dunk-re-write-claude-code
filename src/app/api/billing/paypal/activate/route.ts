import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { activateSubscription } from "@/lib/paypal";

/**
 * POST /api/billing/paypal/activate
 *
 * Activates a PayPal subscription for the user after approval
 * Body: { subscriptionId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { subscriptionId } = body;

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 }
      );
    }

    const result = await activateSubscription(session.user.id, subscriptionId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to activate subscription" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error activating PayPal subscription:", error);
    return NextResponse.json(
      { error: "Failed to activate subscription" },
      { status: 500 }
    );
  }
}
