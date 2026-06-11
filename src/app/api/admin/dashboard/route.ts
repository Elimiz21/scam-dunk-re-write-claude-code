/**
 * Admin Dashboard API - Get main dashboard metrics
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getDashboardMetrics } from "@/lib/admin/metrics";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Unpersonalized aggregate — cache for 60s across admin viewers/refreshes.
    const metrics = await cached("dashboard:metrics", 60, () =>
      getDashboardMetrics(),
    );

    return NextResponse.json({
      ...metrics,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard metrics" },
      { status: 500 },
    );
  }
}
