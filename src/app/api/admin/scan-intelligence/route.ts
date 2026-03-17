/**
 * Scan Intelligence Dashboard API
 *
 * Returns the main dashboard data: latest scan summary, AI layer stats,
 * risk funnel, top suspicious stocks, active schemes, and comparison
 * with the previous scan.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import {
  getRepoTree,
  getScanDates,
  fetchSmallFile,
  fetchPartialArray,
  getHighRiskPath,
  generateSchemeName,
  computeAIStats,
  type DailyReport,
  type FmpSummary,
  type SchemeDatabase,
  type EnhancedStock,
  type SocialScanFile,
  type PromotedStocksFile,
} from "@/lib/admin/scan-data";

export const dynamic = "force-dynamic";

function deriveSchemeMilestones(scheme: any) {
  const priceAtDetection = scheme.priceAtDetection || 0;
  const peakPrice = scheme.peakPrice || 0;
  const currentPrice = scheme.currentPrice || 0;

  // Floor = pre-pump baseline price (priceAtDetection should be the pre-pump price)
  // Only fall back to min of other prices if priceAtDetection is clearly wrong (0 or same as peak)
  const floorPriceBeforePump =
    priceAtDetection > 0 && priceAtDetection < peakPrice
      ? priceAtDetection
      : priceAtDetection > 0
        ? priceAtDetection
        : Math.min(currentPrice || Infinity, peakPrice || Infinity) || 0;

  // Trough = lowest price after peak (dump phase)
  const troughPriceAfterPeak =
    currentPrice > 0 && currentPrice < peakPrice ? currentPrice : peakPrice;

  const daysFloorToPeak = Math.max(
    0,
    Math.round((scheme.daysActive || 0) * 0.4),
  );
  const daysPeakToTrough = Math.max(
    0,
    (scheme.daysActive || 0) - daysFloorToPeak,
  );

  // Pump: floor → peak
  const pumpPct =
    floorPriceBeforePump > 0
      ? ((peakPrice - floorPriceBeforePump) / floorPriceBeforePump) * 100
      : 0;

  // Dump: peak → current
  const dumpPct =
    peakPrice > 0 ? ((currentPrice - peakPrice) / peakPrice) * 100 : 0;

  return {
    floorPriceBeforePump,
    troughPriceAfterPeak,
    daysFloorToPeak,
    daysPeakToTrough,
    pumpPct,
    dumpPct,
    weakPumpSignal: pumpPct < 5,
  };
}

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
      return NextResponse.json(
        { error: "No scan data found" },
        { status: 404 },
      );
    }

    const targetDate =
      requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0];
    const prevDate = dates[dates.indexOf(targetDate) + 1] || null;

    // Fetch data for the target date in parallel
    const [dailyReport, fmpSummary, schemeDb, socialScan, promotedStocks] =
      await Promise.all([
        fetchSmallFile<DailyReport>(`reports/daily-report-${targetDate}.json`),
        fetchSmallFile<FmpSummary>(
          `daily-summaries/fmp-summary-${targetDate}.json`,
        ),
        fetchSmallFile<SchemeDatabase>(`scheme-tracking/scheme-database.json`),
        fetchSmallFile<SocialScanFile>(
          `social-media-scans/social-media-scan-${targetDate}.json`,
        ).catch(() => null),
        fetchSmallFile<PromotedStocksFile>(
          `promoted-stocks/promoted-stocks-${targetDate}.json`,
        ).catch(() => null),
      ]);

    // Fetch previous date data for comparison
    let prevReport: DailyReport | null = null;
    let prevSocialScan: SocialScanFile | null = null;
    let prevPromotedStocks: PromotedStocksFile | null = null;
    if (prevDate) {
      [prevReport, prevSocialScan, prevPromotedStocks] = await Promise.all([
        fetchSmallFile<DailyReport>(`reports/daily-report-${prevDate}.json`),
        fetchSmallFile<SocialScanFile>(
          `social-media-scans/social-media-scan-${prevDate}.json`,
        ).catch(() => null),
        fetchSmallFile<PromotedStocksFile>(
          `promoted-stocks/promoted-stocks-${prevDate}.json`,
        ).catch(() => null),
      ]);
    }

    // Fetch top suspicious stocks from the high-risk file (partial read)
    const highRiskPath = getHighRiskPath(targetDate, files);
    let topStocks: EnhancedStock[] = [];
    let highRiskUnfiltered: EnhancedStock[] = [];
    if (highRiskPath) {
      const allHighRisk = await fetchPartialArray<EnhancedStock>(
        highRiskPath,
        200_000,
      );
      highRiskUnfiltered = allHighRisk.filter((s) => !s.isFiltered);
      // Sort by totalScore descending, take top 30
      topStocks = highRiskUnfiltered
        .sort(
          (a, b) =>
            b.totalScore - a.totalScore ||
            (b.aiLayers?.combined || 0) - (a.aiLayers?.combined || 0),
        )
        .slice(0, 30);
    }

    // Compute AI layer coverage stats from the full unfiltered high-risk set.
    // Using only the top-30 sample can make coverage percentages look disconnected
    // from the underlying scan output.
    const aiStats = computeAIStats(highRiskUnfiltered);

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
          stocksScanned:
            (dailyReport?.totalStocksScanned || 0) -
            prevReport.totalStocksScanned,
          highRisk:
            (dailyReport?.highRiskBeforeFilters || 0) -
            prevReport.highRiskBeforeFilters,
          suspicious:
            (dailyReport?.remainingSuspicious || 0) -
            prevReport.remainingSuspicious,
          schemes: (dailyReport?.activeSchemes || 0) - prevReport.activeSchemes,
        }
      : null;

    // Extract active schemes with generated names
    const activeSchemes = schemeDb
      ? Object.values(schemeDb.schemes)
          .filter(
            (s) =>
              s.status === "ONGOING" ||
              s.status === "COOLING" ||
              s.status === "NEW",
          )
          .map((s) => ({
            ...s,
            ...deriveSchemeMilestones(s),
            schemeName: generateSchemeName(s),
            promoterAccounts: s.promoterAccounts || [],
            coordinationIndicators: s.coordinationIndicators || [],
          }))
      : [];

    // Compute social scan summary — fall back to DB if JSON file has no results
    // (this happens when the deployed API path stores data directly in Supabase)
    let effectiveSocialScan = socialScan;
    if (!socialScan || socialScan.socialMediaScannedCount === 0) {
      try {
        const targetDateStart = new Date(targetDate + "T00:00:00Z");
        const targetDateEnd = new Date(targetDate + "T23:59:59Z");

        const scanRun = await prisma.socialScanRun.findFirst({
          where: {
            scanDate: { gte: targetDateStart, lte: targetDateEnd },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            tickersScanned: true,
            tickersWithMentions: true,
            totalMentions: true,
            platformsUsed: true,
            errors: true,
          },
        });

        if (scanRun && (scanRun.tickersScanned ?? 0) > 0) {
          const mentionStats = await prisma.socialMention.groupBy({
            by: ["ticker"],
            where: { scanRunId: scanRun.id },
            _count: true,
            _avg: { promotionScore: true },
          });

          const highPromo = mentionStats.filter(
            (m) => (m._avg.promotionScore || 0) >= 60,
          ).length;
          const medPromo = mentionStats.filter((m) => {
            const avg = m._avg.promotionScore || 0;
            return avg >= 40 && avg < 60;
          }).length;

          effectiveSocialScan = {
            scanDate: targetDate,
            totalScanned: scanRun.tickersScanned ?? 0,
            socialMediaScannedCount: scanRun.tickersWithMentions ?? 0,
            highPromotionCount: highPromo,
            mediumPromotionCount: medPromo,
            results: [],
          } as SocialScanFile;
        }
      } catch {
        /* non-blocking — keep file-based data */
      }
    }

    const socialSummary = effectiveSocialScan
      ? {
          totalScanned: effectiveSocialScan.totalScanned,
          highPromotion: effectiveSocialScan.highPromotionCount,
          mediumPromotion: effectiveSocialScan.mediumPromotionCount,
        }
      : null;

    const prevSocialSummary = prevSocialScan
      ? {
          totalScanned: prevSocialScan.totalScanned,
          highPromotion: prevSocialScan.highPromotionCount,
          mediumPromotion: prevSocialScan.mediumPromotionCount,
        }
      : null;

    const promotionDeltas = prevSocialSummary
      ? {
          totalPromotions:
            (socialSummary?.highPromotion || 0) +
            (socialSummary?.mediumPromotion || 0) -
            prevSocialSummary.highPromotion -
            prevSocialSummary.mediumPromotion,
          promotedStocks:
            (promotedStocks?.promotedStocks.length || 0) -
            (prevPromotedStocks?.promotedStocks.length || 0),
        }
      : null;

    // Top promoted stocks
    const topPromoted = promotedStocks
      ? promotedStocks.promotedStocks
          .sort((a, b) => b.riskScore - a.riskScore)
          .slice(0, 10)
      : [];

    // Recent high-priority social evidence (from DB if available)
    let socialEvidence: Array<{
      id: string;
      ticker: string;
      platform: string;
      author: string | null;
      title: string | null;
      url: string | null;
      promotionScore: number;
      postDate: string | null;
      createdAt: string;
    }> = [];
    try {
      const mentions = await prisma.socialMention.findMany({
        where: {
          OR: [{ isPromotional: true }, { promotionScore: { gte: 50 } }],
        },
        orderBy: [{ promotionScore: "desc" }, { createdAt: "desc" }],
        take: 15,
        select: {
          id: true,
          ticker: true,
          platform: true,
          author: true,
          title: true,
          url: true,
          promotionScore: true,
          postDate: true,
          createdAt: true,
        },
      });
      socialEvidence = mentions.map((m) => ({
        ...m,
        postDate: m.postDate ? m.postDate.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
      }));
    } catch {
      socialEvidence = [];
    }

    const coverage = {
      topStocksWithSchemes: topStocks.filter((s) => Boolean(s.schemeId)).length,
      topStocksWithSocial: topStocks.filter((s) =>
        Boolean(s.socialMediaScanned),
      ).length,
      activeSchemesWithPromoters: activeSchemes.filter(
        (s) => (s.promoterAccounts?.length || 0) > 0,
      ).length,
      activeSchemesWithoutPromoters: activeSchemes.filter(
        (s) => (s.promoterAccounts?.length || 0) === 0,
      ).length,
      definitions: {
        topStocksWithSchemes:
          "Top suspicious stocks that are linked to a tracked scheme ID.",
        topStocksWithSocial:
          "Top suspicious stocks where social scanning has been executed.",
        activeSchemesWithPromoters:
          "Active schemes with at least one identified promoter account.",
        activeSchemesWithoutPromoters:
          "Active schemes that still lack linked promoter accounts.",
      },
      source:
        "scan-intelligence aggregate (high-risk stocks + scheme database + social scan)",
      generatedAt: new Date().toISOString(),
    };

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
      prevSocialSummary,
      promotionDeltas,
      topPromoted,
      socialEvidence,
      coverage,
    });
  } catch (error) {
    console.error("Scan intelligence error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan intelligence data" },
      { status: 500 },
    );
  }
}

// computeAIStats is now imported from @/lib/admin/scan-data
