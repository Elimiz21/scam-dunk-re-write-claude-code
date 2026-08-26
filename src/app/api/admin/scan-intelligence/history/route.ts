/**
 * Scan Intelligence - Scan History
 *
 * Returns scan-over-scan comparison data for the timeline view.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getScanDates,
  getRepoTree,
  fetchSmallFile,
  ScanDataFetchError,
  type DailyReport,
  type FmpSummary,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [dates, files] = await Promise.all([getScanDates(), getRepoTree()]);

    // Fetch the per-date summaries for the 15 most recent dates concurrently
    // (previously this issued ~30 sequential Contents-API calls, which could
    // exhaust the hourly GitHub budget on a single page load).
    const history = await Promise.all(
      dates.slice(0, 15).map(async (date) => {
        const [report, summary] = await Promise.all([
          fetchSmallFile<DailyReport>(`reports/daily-report-${date}.json`),
          fetchSmallFile<FmpSummary>(`daily-summaries/fmp-summary-${date}.json`),
        ]);

        // Determine what format was used
        const hasEnhanced = files.some(
          (f) =>
            f.path === `evaluation-results/enhanced-evaluation-${date}.json`,
        );
        const hasLegacy = files.some(
          (f) => f.path === `evaluation-results/fmp-evaluation-${date}.json`,
        );
        const hasSocialScan = files.some(
          (f) => f.path === `social-media-scans/social-media-scan-${date}.json`,
        );
        const hasPromoted = files.some(
          (f) => f.path === `promoted-stocks/promoted-stocks-${date}.json`,
        );
        const hasSuspicious = files.some(
          (f) => f.path === `suspicious-stocks/suspicious-stocks-${date}.json`,
        );
        const hasSchemeReport = files.some(
          (f) => f.path === `scheme-tracking/scheme-report-${date}.md`,
        );

        // Get file sizes for the main evaluation file
        const evalFile = files.find(
          (f) =>
            f.path === `evaluation-results/enhanced-evaluation-${date}.json` ||
            f.path === `evaluation-results/fmp-evaluation-${date}.json`,
        );

        return {
          date,
          format: hasEnhanced ? "enhanced" : hasLegacy ? "legacy" : "none",
          stocksScanned: report?.totalStocksScanned || summary?.evaluated || 0,
          highRisk:
            report?.highRiskBeforeFilters || summary?.byRiskLevel?.HIGH || 0,
          suspicious: report?.remainingSuspicious || 0,
          activeSchemes: report?.activeSchemes || 0,
          processingMinutes:
            report?.processingTimeMinutes || summary?.durationMinutes || 0,
          riskDistribution: report?.byRiskLevel || summary?.byRiskLevel || null,
          filteredByNews: report?.filteredByNews || 0,
          filteredByMarketCap: report?.filteredByMarketCap || 0,
          files: {
            evaluation: hasEnhanced || hasLegacy,
            socialScan: hasSocialScan,
            promoted: hasPromoted,
            suspicious: hasSuspicious,
            schemeReport: hasSchemeReport,
            evalSize: evalFile?.size || 0,
          },
        };
      }),
    );

    return NextResponse.json({ history });
  } catch (error) {
    console.error("Scan history error:", error);
    if (error instanceof ScanDataFetchError) {
      return NextResponse.json(
        { error: "Scan data source is unavailable", code: "scan_data_upstream" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch scan history" },
      { status: 500 },
    );
  }
}
