/**
 * Scan Intelligence - Single Stock Deep Dive
 *
 * Returns all data for a single stock: latest evaluation, historical
 * snapshots across scan dates, scheme membership, social evidence.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getScanDates,
  getRepoTree,
  fetchPartialArray,
  fetchSmallFile,
  getHighRiskPath,
  getEvalPath,
  type EnhancedStock,
  type SchemeDatabase,
  type SocialScanFile,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();

    const [dates, files] = await Promise.all([getScanDates(), getRepoTree()]);

    // Find this stock in the latest scan
    let latestStock: EnhancedStock | null = null;
    let foundDate: string | null = null;

    for (const date of dates.slice(0, 5)) {
      const highRiskPath = getHighRiskPath(date, files);
      const evalPath = getEvalPath(date, files);
      const searchPath = highRiskPath || evalPath;
      if (!searchPath) continue;

      const stocks = await fetchPartialArray<EnhancedStock>(searchPath, 3_000_000);
      const match = stocks.find((s) => s.symbol.toUpperCase() === upperSymbol);
      if (match) {
        latestStock = match;
        foundDate = date;
        break;
      }
    }

    if (!latestStock || !foundDate) {
      return NextResponse.json(
        { error: `Stock ${upperSymbol} not found in recent scans` },
        { status: 404 }
      );
    }

    // Get social media data for this stock
    let socialData = null;
    const socialScan = await fetchSmallFile<SocialScanFile>(
      `social-media-scans/social-media-scan-${foundDate}.json`
    ).catch(() => null);

    if (socialScan) {
      const socialMatch = socialScan.results?.find(
        (r) => r.symbol.toUpperCase() === upperSymbol
      );
      if (socialMatch) {
        socialData = socialMatch;
      }
    }

    // Check scheme membership
    const schemeDb = await fetchSmallFile<SchemeDatabase>(
      "scheme-tracking/scheme-database.json"
    );
    let schemeData = null;
    if (schemeDb) {
      for (const [, scheme] of Object.entries(schemeDb.schemes)) {
        if (scheme.symbol.toUpperCase() === upperSymbol) {
          schemeData = scheme;
          break;
        }
      }
    }

    // Build historical data (risk score across dates)
    const history: { date: string; totalScore: number; riskLevel: string; price: number | null; aiCombined: number | null }[] = [];

    // Check last 10 dates for this stock
    for (const date of dates.slice(0, 10)) {
      const hrPath = getHighRiskPath(date, files);
      if (!hrPath) continue;

      const stocks = await fetchPartialArray<EnhancedStock>(hrPath, 3_000_000);
      const match = stocks.find((s) => s.symbol.toUpperCase() === upperSymbol);
      if (match) {
        history.push({
          date,
          totalScore: match.totalScore,
          riskLevel: match.riskLevel,
          price: match.lastPrice,
          aiCombined: match.aiLayers?.combined || null,
        });
      }
    }

    return NextResponse.json({
      stock: latestStock,
      foundDate,
      socialData,
      schemeData,
      history: history.reverse(),
    });
  } catch (error) {
    console.error("Stock deep dive error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
