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
  fetchLargeFile,
  fetchSmallFile,
  getHighRiskPath,
  getEvalPath,
  ScanDataFetchError,
  type EnhancedStock,
  type SchemeDatabase,
  type SocialScanFile,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";
// This route fans out to several GitHub downloads; give it headroom beyond the
// default 10s so a slow upstream surfaces as an error rather than a 504.
export const maxDuration = 60;

async function findStockInPath(
  path: string,
  symbol: string,
): Promise<EnhancedStock | null> {
  const partial = await fetchPartialArray<EnhancedStock>(path, 3_000_000);
  const partialMatch = partial.find((s) => s.symbol.toUpperCase() === symbol);
  if (partialMatch) return partialMatch;

  const full = await fetchLargeFile<EnhancedStock[]>(path);
  if (!full) return null;
  return full.find((s) => s.symbol.toUpperCase() === symbol) || null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();

    const [dates, files] = await Promise.all([getScanDates(), getRepoTree()]);

    // Find this stock in the latest scan. Search the 5 most recent dates
    // concurrently, then pick the match from the most recent date (dates are
    // sorted newest-first) — preserving "latest" semantics without serial
    // multi-MB downloads.
    const recentDates = dates.slice(0, 5);
    const latestCandidates = await Promise.all(
      recentDates.map(async (date) => {
        const highRiskPath = getHighRiskPath(date, files);
        const evalPath = getEvalPath(date, files);
        const searchPaths = [highRiskPath, evalPath].filter((p): p is string =>
          Boolean(p),
        );
        for (const searchPath of searchPaths) {
          const match = await findStockInPath(searchPath, upperSymbol);
          if (match) return { date, match };
        }
        return null;
      }),
    );

    const latest = latestCandidates.find((c) => c !== null) ?? null;
    const latestStock: EnhancedStock | null = latest?.match ?? null;
    const foundDate: string | null = latest?.date ?? null;

    if (!latestStock || !foundDate) {
      return NextResponse.json(
        { error: `Stock ${upperSymbol} not found in recent scans` },
        { status: 404 },
      );
    }

    // Social data, scheme membership and the 10-date history are independent —
    // fetch them all concurrently (previously serial, re-downloading 3MB per
    // date in a loop).
    const [socialScan, schemeDb, historyResults] = await Promise.all([
      fetchSmallFile<SocialScanFile>(
        `social-media-scans/social-media-scan-${foundDate}.json`,
      ).catch(() => null),
      fetchSmallFile<SchemeDatabase>("scheme-tracking/scheme-database.json"),
      Promise.all(
        dates.slice(0, 10).map(async (date) => {
          const hrPath = getHighRiskPath(date, files);
          if (!hrPath) return null;
          const stocks = await fetchPartialArray<EnhancedStock>(
            hrPath,
            3_000_000,
          );
          const match = stocks.find(
            (s) => s.symbol.toUpperCase() === upperSymbol,
          );
          if (!match) return null;
          return {
            date,
            totalScore: match.totalScore,
            riskLevel: match.riskLevel,
            price: match.lastPrice,
            aiCombined: match.aiLayers?.combined || null,
          };
        }),
      ),
    ]);

    // Get social media data for this stock
    let socialData = null;
    if (socialScan) {
      const socialMatch = socialScan.results?.find(
        (r) => r.symbol.toUpperCase() === upperSymbol,
      );
      if (socialMatch) {
        socialData = socialMatch;
      }
    }

    // Check scheme membership
    let schemeData = null;
    if (schemeDb) {
      for (const [, scheme] of Object.entries(schemeDb.schemes)) {
        if (scheme.symbol.toUpperCase() === upperSymbol) {
          schemeData = scheme;
          break;
        }
      }
    }

    // Build historical data (risk score across dates), newest dates already
    // first; reverse to chronological order for charting.
    const history = historyResults.filter(
      (h): h is NonNullable<typeof h> => h !== null,
    );

    return NextResponse.json({
      stock: latestStock,
      foundDate,
      socialData,
      schemeData,
      history: history.reverse(),
    });
  } catch (error) {
    console.error("Stock deep dive error:", error);
    if (error instanceof ScanDataFetchError) {
      return NextResponse.json(
        { error: "Scan data source is unavailable", code: "scan_data_upstream" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 },
    );
  }
}
