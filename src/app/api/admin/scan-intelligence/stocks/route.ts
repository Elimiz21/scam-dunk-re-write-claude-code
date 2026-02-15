/**
 * Scan Intelligence - Paginated Stock List
 *
 * Returns filtered, sorted, paginated stocks from the latest scan.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getRepoTree,
  getLatestScanDate,
  fetchPartialArray,
  getHighRiskPath,
  type EnhancedStock,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const date = url.searchParams.get("date") || (await getLatestScanDate());
    const riskLevel = url.searchParams.get("riskLevel") || "";
    const minScore = parseInt(url.searchParams.get("minScore") || "0");
    const hasPumpPattern = url.searchParams.get("hasPumpPattern") === "true";
    const unfilteredOnly = url.searchParams.get("unfilteredOnly") !== "false";
    const sortBy = url.searchParams.get("sortBy") || "totalScore";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const search = url.searchParams.get("search") || "";

    if (!date) {
      return NextResponse.json({ error: "No scan data available" }, { status: 404 });
    }

    const files = await getRepoTree();
    const highRiskPath = getHighRiskPath(date, files);

    if (!highRiskPath) {
      return NextResponse.json({ error: `No high-risk data for ${date}` }, { status: 404 });
    }

    // Fetch a large chunk of the high-risk file
    const stocks = await fetchPartialArray<EnhancedStock>(highRiskPath, 2_000_000);

    // Apply filters
    let filtered = stocks;

    if (unfilteredOnly) {
      filtered = filtered.filter((s) => !s.isFiltered);
    }

    if (riskLevel) {
      filtered = filtered.filter((s) => s.riskLevel === riskLevel);
    }

    if (minScore > 0) {
      filtered = filtered.filter((s) => s.totalScore >= minScore);
    }

    if (hasPumpPattern) {
      filtered = filtered.filter((s) =>
        s.signals.some((sig) =>
          sig.code.includes("PUMP") || sig.code.includes("DUMP")
        )
      );
    }

    if (search) {
      const q = search.toUpperCase();
      filtered = filtered.filter(
        (s) =>
          s.symbol.toUpperCase().includes(q) ||
          s.name.toUpperCase().includes(q)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "totalScore":
          return b.totalScore - a.totalScore;
        case "aiCombined":
          return (b.aiLayers?.combined || 0) - (a.aiLayers?.combined || 0);
        case "layer2":
          return (b.aiLayers?.layer2_anomaly || 0) - (a.aiLayers?.layer2_anomaly || 0);
        case "signals":
          return b.signals.length - a.signals.length;
        case "marketCap":
          return (a.marketCap || 0) - (b.marketCap || 0);
        case "symbol":
          return a.symbol.localeCompare(b.symbol);
        default:
          return b.totalScore - a.totalScore;
      }
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const pageItems = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      date,
      stocks: pageItems,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error("Stock list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock list" },
      { status: 500 }
    );
  }
}
