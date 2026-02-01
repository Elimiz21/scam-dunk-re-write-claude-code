/**
 * Admin Model Efficacy API
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getModelEfficacyMetrics } from "@/lib/admin/metrics";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "30", 10);

    const metrics = await getModelEfficacyMetrics(days);

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("Model efficacy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch model efficacy metrics" },
      { status: 500 }
    );
  }
}
