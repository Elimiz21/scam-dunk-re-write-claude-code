/**
 * Scan Intelligence - Scheme Database
 *
 * Returns the full scheme database with all active and resolved schemes.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { fetchSmallFile, type SchemeDatabase } from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schemeDb = await fetchSmallFile<SchemeDatabase>(
      "scheme-tracking/scheme-database.json"
    );

    if (!schemeDb) {
      return NextResponse.json({
        error: "Scheme database not found",
        schemes: [],
        stats: { total: 0, active: 0, resolved: 0, confirmed: 0 },
      });
    }

    const schemes = Object.values(schemeDb.schemes);
    const active = schemes.filter(
      (s) => s.status === "ONGOING" || s.status === "COOLING" || s.status === "NEW"
    );
    const resolved = schemes.filter(
      (s) => s.status === "NO_SCAM_DETECTED" || s.status === "PUMP_AND_DUMP_ENDED"
    );

    return NextResponse.json({
      lastUpdated: schemeDb.lastUpdated,
      stats: {
        total: schemeDb.totalSchemes,
        active: schemeDb.activeSchemes,
        resolved: schemeDb.resolvedSchemes,
        confirmed: schemeDb.confirmedFrauds,
      },
      active: active.sort((a, b) => b.currentRiskScore - a.currentRiskScore),
      resolved: resolved.sort(
        (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
      ),
    });
  } catch (error) {
    console.error("Scheme database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scheme data" },
      { status: 500 }
    );
  }
}
