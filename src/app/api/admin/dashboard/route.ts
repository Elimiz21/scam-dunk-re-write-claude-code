/**
 * Admin Dashboard API - Get main dashboard metrics
 */

import { getAdminSession } from "@/lib/admin/auth";
import { getDashboardMetrics } from "@/lib/admin/metrics";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return apiUnauthorized();
    }

    const metrics = await getDashboardMetrics();

    return apiSuccess({
      ...metrics,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard metrics error:", error);
    return apiError("Failed to fetch dashboard metrics");
  }
}
