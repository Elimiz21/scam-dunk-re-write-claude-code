/**
 * Scan Intelligence - Promoter Database
 *
 * Returns the promoter matrix database, either from the dedicated
 * promoter-database.json file or by aggregating from the scheme database.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  fetchSmallFile,
  type PromoterDatabase,
  type SchemeDatabase,
  type PromoterEntry,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try dedicated promoter database first
    let promoterDb = await fetchSmallFile<PromoterDatabase>(
      "scheme-tracking/promoter-database.json"
    );

    // Fall back to aggregating from scheme database
    if (!promoterDb) {
      const schemeDb = await fetchSmallFile<SchemeDatabase>(
        "scheme-tracking/scheme-database.json"
      );

      if (!schemeDb) {
        return NextResponse.json({
          promoters: [],
          stats: { total: 0, active: 0, serialOffenders: 0 },
        });
      }

      // Build promoter database from scheme data
      promoterDb = aggregatePromotersFromSchemes(schemeDb);
    }

    const promoters = Object.values(promoterDb.promoters);

    return NextResponse.json({
      lastUpdated: promoterDb.lastUpdated,
      stats: {
        total: promoterDb.totalPromoters,
        active: promoterDb.activePromoters,
        serialOffenders: promoterDb.serialOffenders,
      },
      promoters: promoters.sort(
        (a, b) =>
          b.stocksPromoted.length - a.stocksPromoted.length ||
          b.totalPosts - a.totalPosts
      ),
    });
  } catch (error) {
    console.error("Promoter database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch promoter data" },
      { status: 500 }
    );
  }
}

/**
 * Build a promoter database by aggregating promoter accounts across all schemes.
 */
function aggregatePromotersFromSchemes(
  schemeDb: SchemeDatabase
): PromoterDatabase {
  const schemes = Object.values(schemeDb.schemes);
  const promoterMap = new Map<string, PromoterEntry>();
  const activeStatuses = ["ONGOING", "COOLING", "NEW"];

  for (const scheme of schemes) {
    const accounts = scheme.promoterAccounts || [];
    for (const account of accounts) {
      // Skip if it's a legacy string entry
      if (typeof account === "string") continue;

      const key = `${account.platform}::${account.identifier}`;
      let promoter = promoterMap.get(key);

      if (!promoter) {
        promoter = {
          promoterId: `PROM-${account.platform.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6)}-${account.identifier.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10)}`,
          identifier: account.identifier,
          platform: account.platform,
          firstSeen: account.firstSeen,
          lastSeen: account.lastSeen,
          totalPosts: 0,
          confidence: account.confidence,
          stocksPromoted: [],
          coPromoters: [],
          riskLevel: "LOW",
          isActive: false,
        };
        promoterMap.set(key, promoter);
      }

      promoter.totalPosts += account.postCount;
      if (account.firstSeen < promoter.firstSeen)
        promoter.firstSeen = account.firstSeen;
      if (account.lastSeen > promoter.lastSeen)
        promoter.lastSeen = account.lastSeen;
      if (account.confidence === "high") promoter.confidence = "high";

      const existing = promoter.stocksPromoted.find(
        (s) => s.schemeId === scheme.schemeId
      );
      if (!existing) {
        promoter.stocksPromoted.push({
          symbol: scheme.symbol,
          schemeId: scheme.schemeId,
          schemeName: scheme.name,
          schemeStatus: scheme.status,
          firstSeen: account.firstSeen,
          lastSeen: account.lastSeen,
          postCount: account.postCount,
        });
      }

      if (activeStatuses.includes(scheme.status)) {
        promoter.isActive = true;
      }
    }
  }

  // Build co-promoter relationships
  const promoterList = Array.from(promoterMap.values());
  for (const promoter of promoterList) {
    const myStocks = new Set(promoter.stocksPromoted.map((s) => s.symbol));
    for (const other of promoterList) {
      if (other.promoterId === promoter.promoterId) continue;
      const sharedStocks = other.stocksPromoted
        .filter((s) => myStocks.has(s.symbol))
        .map((s) => s.symbol);
      if (sharedStocks.length > 0) {
        promoter.coPromoters.push({
          promoterId: other.promoterId,
          identifier: other.identifier,
          platform: other.platform,
          sharedStocks,
        });
      }
    }

    // Assign risk levels
    const stockCount = promoter.stocksPromoted.length;
    const high = promoter.confidence === "high";
    const hasCo = promoter.coPromoters.length > 0;
    if (stockCount >= 3 || (stockCount >= 2 && high && hasCo)) {
      promoter.riskLevel = "SERIAL_OFFENDER";
    } else if (stockCount >= 2 || (high && hasCo)) {
      promoter.riskLevel = "HIGH";
    } else if (high || hasCo) {
      promoter.riskLevel = "MEDIUM";
    }
  }

  return {
    lastUpdated: schemeDb.lastUpdated,
    totalPromoters: promoterList.length,
    activePromoters: promoterList.filter((p) => p.isActive).length,
    serialOffenders: promoterList.filter(
      (p) => p.riskLevel === "SERIAL_OFFENDER"
    ).length,
    promoters: Object.fromEntries(
      promoterList.map((p) => [p.promoterId, p])
    ),
  };
}
