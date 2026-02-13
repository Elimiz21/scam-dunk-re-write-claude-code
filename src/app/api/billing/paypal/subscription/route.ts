import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserSubscriptionInfo } from "@/lib/paypal";

/**
 * GET /api/billing/paypal/subscription
 *
 * Returns the current user's subscription details including
 * plan, status, next billing date, and start date.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const info = await getUserSubscriptionInfo(session.user.id);
    return NextResponse.json(info);
  } catch (error) {
    console.error("Error getting subscription info:", error);
    return NextResponse.json(
      { error: "Failed to get subscription info" },
      { status: 500 }
    );
  }
}
