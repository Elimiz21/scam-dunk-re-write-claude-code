import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserSubscriptionInfo } from "@/lib/paypal";
import {
  getBillingEntitlements,
  getBillingPlanCatalog,
  getStripeIntegrationStatus,
} from "@/lib/billing/provider";

export const dynamic = "force-dynamic";

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

    const [info, billing] = await Promise.all([
      getUserSubscriptionInfo(session.user.id),
      getBillingEntitlements(session.user.id),
    ]);
    return NextResponse.json({
      ...info,
      billing,
      plans: Object.values(getBillingPlanCatalog()),
      stripe: getStripeIntegrationStatus(),
    });
  } catch (error) {
    console.error("Error getting subscription info:", error);
    return NextResponse.json(
      { error: "Failed to get subscription info" },
      { status: 500 },
    );
  }
}
