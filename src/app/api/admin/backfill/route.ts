/**
 * Admin Backfill API - Rebuild ModelMetrics and ScanUsage from ScanHistory
 */

import { NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { backfillAdminMetrics } from "@/lib/admin/metrics";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasRole(session, ["OWNER", "ADMIN"])) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const result = await backfillAdminMetrics();

    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "ADMIN_BACKFILL",
        details: JSON.stringify(result),
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { error: "Failed to backfill admin metrics", details: String(error) },
      { status: 500 }
    );
  }
}
