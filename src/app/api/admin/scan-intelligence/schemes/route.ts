/**
 * Scan Intelligence - Scheme Database
 *
 * Returns the full scheme database with all active and resolved schemes,
 * including auto-generated human-readable scheme names and promoter data.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  fetchSmallFile,
  generateSchemeName,
  type SchemeDatabase,
  type PromoterDatabase,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

function buildPromoterId(platform: string, identifier: string): string {
  return `PROM-${platform
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 6)}-${identifier
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 10)}`;
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schemeDb = await fetchSmallFile<SchemeDatabase>(
      "scheme-tracking/scheme-database.json",
    );
    const promoterDb = await fetchSmallFile<PromoterDatabase>(
      "scheme-tracking/promoter-database.json",
    );

    if (!schemeDb) {
      return NextResponse.json({
        error: "Scheme database not found",
        schemes: [],
        stats: { total: 0, active: 0, resolved: 0, confirmed: 0 },
      });
    }

    const promoterIdByAccount = new Map<string, string>();
    if (promoterDb?.promoters) {
      for (const promoter of Object.values(promoterDb.promoters)) {
        const key = `${promoter.platform.toLowerCase()}::${promoter.identifier.toLowerCase()}`;
        promoterIdByAccount.set(key, promoter.promoterId);
      }
    }

    // Add generated scheme names and ensure all fields are present
    const schemes = Object.values(schemeDb.schemes).map((s) => ({
      ...s,
      schemeName: generateSchemeName(s),
      promoterAccounts: (s.promoterAccounts || []).map((p) => {
        const key = `${p.platform.toLowerCase()}::${p.identifier.toLowerCase()}`;
        return {
          ...p,
          promoterId:
            promoterIdByAccount.get(key) ||
            buildPromoterId(p.platform, p.identifier),
        };
      }),
      coordinationIndicators: s.coordinationIndicators || [],
      notes: s.notes || [],
      investigationFlags: s.investigationFlags || [],
    }));

    const active = schemes.filter(
      (s) =>
        s.status === "ONGOING" || s.status === "COOLING" || s.status === "NEW",
    );
    const resolved = schemes.filter(
      (s) =>
        s.status === "NO_SCAM_DETECTED" || s.status === "PUMP_AND_DUMP_ENDED",
    );

    // Aggregate all promoter accounts across all schemes
    const allPromoters: Record<
      string,
      {
        platform: string;
        identifier: string;
        schemes: string[];
        totalPosts: number;
        confidence: string;
      }
    > = {};
    for (const s of schemes) {
      for (const p of s.promoterAccounts) {
        const key = `${p.platform}:${p.identifier}`;
        if (!allPromoters[key]) {
          allPromoters[key] = {
            platform: p.platform,
            identifier: p.identifier,
            schemes: [],
            totalPosts: 0,
            confidence: p.confidence,
          };
        }
        allPromoters[key].schemes.push(s.symbol);
        allPromoters[key].totalPosts += p.postCount;
      }
    }

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
        (a, b) =>
          new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
      ),
      promoters: Object.values(allPromoters).sort(
        (a, b) =>
          b.schemes.length - a.schemes.length || b.totalPosts - a.totalPosts,
      ),
    });
  } catch (error) {
    console.error("Scheme database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scheme data" },
      { status: 500 },
    );
  }
}
