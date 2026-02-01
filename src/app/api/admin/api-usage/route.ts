/**
 * Admin API Usage API - Get API usage and costs
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getApiUsageSummary, checkAndTriggerAlerts } from "@/lib/admin/metrics";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get("period") as "day" | "week" | "month") || "month";

    const [usage, triggeredAlerts] = await Promise.all([
      getApiUsageSummary(period),
      checkAndTriggerAlerts(),
    ]);

    return NextResponse.json({
      ...usage,
      triggeredAlerts,
    });
  } catch (error) {
    console.error("API usage error:", error);
    return NextResponse.json(
      { error: "Failed to fetch API usage" },
      { status: 500 }
    );
  }
}
