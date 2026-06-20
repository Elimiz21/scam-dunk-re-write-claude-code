/**
 * Admin API Usage API - Get API usage and costs
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getApiUsageSummary, evaluateActiveAlerts } from "@/lib/admin/metrics";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period =
      (searchParams.get("period") as "day" | "week" | "month") || "month";

    // Unpersonalized aggregate — cache for 60s to absorb dashboard refreshes.
    // Alerts are evaluated READ-ONLY here; persisting triggers
    // (lastTriggered/currentValue) is done by a cron via checkAndTriggerAlerts.
    // TODO(cron): schedule checkAndTriggerAlerts() (e.g. Vercel Cron) so alert
    // state is recorded and notifications can fire off the request path.
    const [usage, triggeredAlerts] = await Promise.all([
      cached(`api-usage:${period}`, 60, () => getApiUsageSummary(period)),
      cached("api-usage:alerts", 60, () => evaluateActiveAlerts()),
    ]);

    return NextResponse.json({
      ...usage,
      triggeredAlerts,
    });
  } catch (error) {
    console.error("API usage error:", error);
    return NextResponse.json(
      { error: "Failed to fetch API usage" },
      { status: 500 },
    );
  }
}
