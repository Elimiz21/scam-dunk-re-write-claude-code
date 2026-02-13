import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelSubscription } from "@/lib/paypal";

/**
 * POST /api/billing/paypal/cancel
 *
 * Cancels the current user's PayPal subscription and
 * downgrades their plan to FREE.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await cancelSubscription(session.user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to cancel subscription" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
