/**
 * Scan Intelligence Dashboard API
 *
 * Returns the main dashboard data: latest scan summary, AI layer stats,
 * risk funnel, top suspicious stocks, active schemes, and comparison
 * with the previous scan.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getRepoTree,
  getScanDates,
  fetchSmallFile,
  fetchPartialArray,
  getHighRiskPath,
  generateSchemeName,
  type DailyReport,
  type FmpSummary,
  type SchemeDatabase,
  type EnhancedStock,
  type SocialScanFile,
  type PromotedStocksFile,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const requestedDate = url.searchParams.get("date");

    const [dates, files] = await Promise.all([getScanDates(), getRepoTree()]);

    if (dates.length === 0) {
      return NextResponse.json({ error: "No scan data found" }, { status: 404 });
    }

    const targetDate = requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0];
    const prevDate = dates[dates.indexOf(targetDate) + 1] || null;

    // Fetch data for the target date in parallel
    const [dailyReport, fmpSummary, schemeDb, socialScan, promotedStocks] = await Promise.all([
      fetchSmallFile<DailyReport>(`reports/daily-report-${targetDate}.json`),
      fetchSmallFile<FmpSummary>(`daily-summaries/fmp-summary-${targetDate}.json`),
      fetchSmallFile<SchemeDatabase>(`scheme-tracking/scheme-database.json`),
      fetchSmallFile<SocialScanFile>(`social-media-scans/social-media-scan-${targetDate}.json`).catch(() => null),
      fetchSmallFile<PromotedStocksFile>(`promoted-stocks/promoted-stocks-${targetDate}.json`).catch(() => null),
    ]);

    // Fetch previous date data for comparison
    let prevReport: DailyReport | null = null;
    if (prevDate) {
      prevReport = await fetchSmallFile<DailyReport>(`reports/daily-report-${prevDate}.json`);
    }

    // Fetch top suspicious stocks from the high-risk file (partial read)
    const highRiskPath = getHighRiskPath(targetDate, files);
    let topStocks: EnhancedStock[] = [];
    if (highRiskPath) {
      const allHighRisk = await fetchPartialArray<EnhancedStock>(highRiskPath, 200_000);
      // Sort by totalScore descending, take top 30
      topStocks = allHighRisk
        .filter((s) => !s.isFiltered)
        .sort((a, b) => b.totalScore - a.totalScore || (b.aiLayers?.combined || 0) - (a.aiLayers?.combined || 0))
        .slice(0, 30);
    }

    // Compute AI layer coverage stats from the top stocks sample
    const aiStats = computeAIStats(topStocks);

    // Compute risk funnel
    const funnel = {
      evaluated: dailyReport?.totalStocksScanned || fmpSummary?.evaluated || 0,
      highRisk: dailyReport?.highRiskBeforeFilters || 0,
      filteredMarketCap: dailyReport?.filteredByMarketCap || 0,
      filteredVolume: dailyReport?.filteredByVolume || 0,
      filteredNews: dailyReport?.filteredByNews || 0,
      suspicious: dailyReport?.remainingSuspicious || 0,
    };

    // Compute deltas with previous scan
    const deltas = prevReport
      ? {
          stocksScanned: (dailyReport?.totalStocksScanned || 0) - prevReport.totalStocksScanned,
          highRisk: (dailyReport?.highRiskBeforeFilters || 0) - prevReport.highRiskBeforeFilters,
          suspicious: (dailyReport?.remainingSuspicious || 0) - prevReport.remainingSuspicious,
          schemes: (dailyReport?.activeSchemes || 0) - prevReport.activeSchemes,
        }
      : null;

    // Extract active schemes with generated names
    const activeSchemes = schemeDb
      ? Object.values(schemeDb.schemes)
          .filter((s) => s.status === "ONGOING" || s.status === "COOLING" || s.status === "NEW")
          .map((s) => ({
            ...s,
            schemeName: generateSchemeName(s),
            promoterAccounts: s.promoterAccounts || [],
            coordinationIndicators: s.coordinationIndicators || [],
          }))
      : [];

    // Compute social scan summary
    const socialSummary = socialScan
      ? {
          totalScanned: socialScan.totalScanned,
          highPromotion: socialScan.highPromotionCount,
          mediumPromotion: socialScan.mediumPromotionCount,
        }
      : null;

    // Top promoted stocks
    const topPromoted = promotedStocks
      ? promotedStocks.promotedStocks
          .sort((a, b) => b.riskScore - a.riskScore)
          .slice(0, 10)
      : [];

    return NextResponse.json({
      date: targetDate,
      previousDate: prevDate,
      availableDates: dates.slice(0, 15),
      dailyReport,
      fmpSummary,
      funnel,
      deltas,
      aiStats,
      topStocks,
      activeSchemes,
      schemeDb: schemeDb
        ? {
            totalSchemes: schemeDb.totalSchemes,
            activeSchemes: schemeDb.activeSchemes,
            resolvedSchemes: schemeDb.resolvedSchemes,
            lastUpdated: schemeDb.lastUpdated,
          }
        : null,
      socialSummary,
      topPromoted,
    });
  } catch (error) {
    console.error("Scan intelligence error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan intelligence data" },
      { status: 500 }
    );
  }
}

function computeAIStats(stocks: EnhancedStock[]) {
  if (stocks.length === 0) {
    return { total: 0, withBackend: 0, layer1: 0, layer2: 0, layer3: 0, layer4: 0 };
  }
  let withBackend = 0, layer1 = 0, layer2 = 0, layer3 = 0, layer4 = 0;
  for (const s of stocks) {
    if (!s.aiLayers) continue;
    if (s.aiLayers.usedPythonBackend) withBackend++;
    if (s.aiLayers.layer1_deterministic !== null) layer1++;
    if (s.aiLayers.layer2_anomaly !== null) layer2++;
    if (s.aiLayers.layer3_rf !== null) layer3++;
    if (s.aiLayers.layer4_lstm !== null) layer4++;
  }
  return { total: stocks.length, withBackend, layer1, layer2, layer3, layer4 };
}
