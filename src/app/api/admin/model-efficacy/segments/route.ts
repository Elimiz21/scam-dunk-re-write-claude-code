/**
 * Admin Segment Efficacy API
 *
 * Returns scan efficacy metrics broken down by segment:
 * OTC, micro-cap, high-volume-surge, AI backend vs TS fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getSegmentEfficacyMetrics } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "30", 10);

    const metrics = await getSegmentEfficacyMetrics(days);

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("Segment efficacy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch segment efficacy metrics" },
      { status: 500 }
    );
  }
}
