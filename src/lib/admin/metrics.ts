/**
 * Admin Metrics Collection
 * Functions for collecting and aggregating app usage metrics
 */

import { prisma } from "@/lib/db";

/**
 * Get current date keys for logging
 */
export function getDateKeys() {
  const now = new Date();
  return {
    monthKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    dayKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    hourKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}`,
  };
}

/**
 * Log API usage for tracking and cost monitoring
 */
export async function logApiUsage(data: {
  service: string;
  endpoint?: string;
  tokensUsed?: number;
  estimatedCost?: number;
  responseTime?: number;
  statusCode?: number;
  errorMessage?: string;
}) {
  try {
    const { monthKey, dayKey, hourKey } = getDateKeys();

    await prisma.apiUsageLog.create({
      data: {
        service: data.service,
        endpoint: data.endpoint,
        tokensUsed: data.tokensUsed,
        estimatedCost: data.estimatedCost,
        responseTime: data.responseTime,
        statusCode: data.statusCode,
        errorMessage: data.errorMessage,
        monthKey,
        dayKey,
        hourKey,
      },
    });
  } catch (error) {
    console.error("Failed to log API usage:", error);
  }
}

/**
 * Log scan history for model efficacy tracking
 */
export async function logScanHistory(data: {
  userId?: string;
  ticker: string;
  assetType: string;
  riskLevel: string;
  totalScore: number;
  signalsCount: number;
  processingTime?: number;
  openaiTokens?: number;
  alphaVantageHit?: boolean;
  isLegitimate?: boolean;
  pitchProvided?: boolean;
  contextProvided?: boolean;
  ipAddress?: string;
  // Segment classification for per-segment efficacy tracking
  isOtc?: boolean;
  isMicroCap?: boolean;
  isHighVolume?: boolean;
  usedAiBackend?: boolean;
}) {
  try {
    await prisma.scanHistory.create({
      data: {
        userId: data.userId,
        ticker: data.ticker,
        assetType: data.assetType || "stock",
        riskLevel: data.riskLevel,
        totalScore: data.totalScore,
        signalsCount: data.signalsCount,
        processingTime: data.processingTime,
        openaiTokens: data.openaiTokens,
        alphaVantageHit: data.alphaVantageHit ?? false,
        isLegitimate: data.isLegitimate,
        pitchProvided: data.pitchProvided ?? false,
        contextProvided: data.contextProvided ?? false,
        ipAddress: data.ipAddress,
        isOtc: data.isOtc ?? false,
        isMicroCap: data.isMicroCap ?? false,
        isHighVolume: data.isHighVolume ?? false,
        usedAiBackend: data.usedAiBackend ?? false,
      },
    });

    // Update daily model metrics
    await updateDailyModelMetrics(data.riskLevel, data.processingTime, data.totalScore, data.isLegitimate);
  } catch (error) {
    console.error("Failed to log scan history:", error);
  }
}

/**
 * Update daily model metrics aggregation
 */
async function updateDailyModelMetrics(
  riskLevel: string,
  processingTime?: number,
  totalScore?: number,
  isLegitimate?: boolean
) {
  const { dayKey } = getDateKeys();

  try {
    const existing = await prisma.modelMetrics.findUnique({
      where: { dateKey: dayKey },
    });

    if (existing) {
      const updates: Record<string, number | null> = {
        totalScans: existing.totalScans + 1,
      };

      if (riskLevel === "LOW") updates.lowRiskCount = existing.lowRiskCount + 1;
      if (riskLevel === "MEDIUM") updates.mediumRiskCount = existing.mediumRiskCount + 1;
      if (riskLevel === "HIGH") updates.highRiskCount = existing.highRiskCount + 1;
      if (riskLevel === "INSUFFICIENT") updates.insufficientCount = existing.insufficientCount + 1;
      if (isLegitimate === true) updates.legitDetected = existing.legitDetected + 1;

      // Update averages
      if (processingTime) {
        const newAvgTime = existing.avgProcessingTime
          ? (existing.avgProcessingTime * existing.totalScans + processingTime) / (existing.totalScans + 1)
          : processingTime;
        updates.avgProcessingTime = newAvgTime;
      }

      if (totalScore !== undefined) {
        const newAvgScore = existing.avgScore
          ? (existing.avgScore * existing.totalScans + totalScore) / (existing.totalScans + 1)
          : totalScore;
        updates.avgScore = newAvgScore;
      }

      await prisma.modelMetrics.update({
        where: { dateKey: dayKey },
        data: updates,
      });
    } else {
      await prisma.modelMetrics.create({
        data: {
          dateKey: dayKey,
          totalScans: 1,
          lowRiskCount: riskLevel === "LOW" ? 1 : 0,
          mediumRiskCount: riskLevel === "MEDIUM" ? 1 : 0,
          highRiskCount: riskLevel === "HIGH" ? 1 : 0,
          insufficientCount: riskLevel === "INSUFFICIENT" ? 1 : 0,
          legitDetected: isLegitimate === true ? 1 : 0,
          avgProcessingTime: processingTime,
          avgScore: totalScore,
        },
      });
    }
  } catch (error) {
    console.error("Failed to update daily metrics:", error);
  }
}

/**
 * Get dashboard overview metrics
 */
export async function getDashboardMetrics() {
  const { monthKey, dayKey } = getDateKeys();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    // Total users
    const totalUsers = await prisma.user.count();

    // Active users (users with scans in the last 30 days)
    const activeUsers = await prisma.scanUsage.groupBy({
      by: ["userId"],
      where: {
        updatedAt: { gte: thirtyDaysAgo },
      },
    });

    // Total scans this month
    const monthlyScans = await prisma.scanUsage.aggregate({
      _sum: { scanCount: true },
      where: { monthKey },
    });

    // Scans today
    const todayMetrics = await prisma.modelMetrics.findUnique({
      where: { dateKey: dayKey },
    });

    // Paid vs Free users
    const usersByPlan = await prisma.user.groupBy({
      by: ["plan"],
      _count: true,
    });

    // Risk level distribution (last 30 days)
    const recentMetrics = await prisma.modelMetrics.findMany({
      where: {
        dateKey: { gte: thirtyDaysAgo.toISOString().split("T")[0] },
      },
    });

    const riskDistribution = recentMetrics.reduce(
      (acc, m) => {
        acc.low += m.lowRiskCount;
        acc.medium += m.mediumRiskCount;
        acc.high += m.highRiskCount;
        acc.insufficient += m.insufficientCount;
        return acc;
      },
      { low: 0, medium: 0, high: 0, insufficient: 0 }
    );

    // Daily scan trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dailyTrend = await prisma.modelMetrics.findMany({
      where: {
        dateKey: { gte: sevenDaysAgo.toISOString().split("T")[0] },
      },
      orderBy: { dateKey: "asc" },
      select: {
        dateKey: true,
        totalScans: true,
      },
    });

    // New users today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const newUsersToday = await prisma.user.count({
      where: { createdAt: { gte: startOfDay } },
    });

    // New users this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newUsersThisMonth = await prisma.user.count({
      where: { createdAt: { gte: startOfMonth } },
    });

    return {
      totalUsers,
      activeUsers: activeUsers.length,
      monthlyScans: monthlyScans._sum.scanCount || 0,
      scansToday: todayMetrics?.totalScans || 0,
      paidUsers: usersByPlan.find((u) => u.plan === "PAID")?._count || 0,
      freeUsers: usersByPlan.find((u) => u.plan === "FREE")?._count || 0,
      riskDistribution,
      dailyTrend,
      newUsersToday,
      newUsersThisMonth,
      avgProcessingTime: todayMetrics?.avgProcessingTime || 0,
    };
  } catch (error) {
    console.error("Failed to get dashboard metrics:", error);
    throw error;
  }
}

/**
 * Get API usage summary for cost monitoring
 */
export async function getApiUsageSummary(period: "day" | "week" | "month" = "month") {
  const now = new Date();
  let startDate: string;

  if (period === "day") {
    startDate = now.toISOString().split("T")[0];
  } else if (period === "week") {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    startDate = weekAgo.toISOString().split("T")[0];
  } else {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }

  try {
    const usageByService = await prisma.apiUsageLog.groupBy({
      by: ["service"],
      where: {
        dayKey: { gte: startDate },
      },
      _count: true,
      _sum: {
        tokensUsed: true,
        estimatedCost: true,
      },
      _avg: {
        responseTime: true,
      },
    });

    const errorCount = await prisma.apiUsageLog.count({
      where: {
        dayKey: { gte: startDate },
        errorMessage: { not: null },
      },
    });

    const totalCost = usageByService.reduce((sum, s) => sum + (s._sum.estimatedCost || 0), 0);
    const totalRequests = usageByService.reduce((sum, s) => sum + s._count, 0);

    // Hourly usage for today
    const todayStart = now.toISOString().split("T")[0];
    const hourlyUsage = await prisma.apiUsageLog.groupBy({
      by: ["hourKey", "service"],
      where: { dayKey: todayStart },
      _count: true,
      _sum: { estimatedCost: true },
    });

    // Get active alerts
    const activeAlerts = await prisma.apiCostAlert.findMany({
      where: { isActive: true },
    });

    return {
      usageByService: usageByService.map((s) => ({
        service: s.service,
        requests: s._count,
        tokensUsed: s._sum.tokensUsed || 0,
        cost: s._sum.estimatedCost || 0,
        avgResponseTime: Math.round(s._avg.responseTime || 0),
      })),
      totalCost,
      totalRequests,
      errorCount,
      errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
      hourlyUsage,
      activeAlerts,
    };
  } catch (error) {
    console.error("Failed to get API usage summary:", error);
    throw error;
  }
}

/**
 * Get model efficacy metrics
 */
export async function getModelEfficacyMetrics(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateKey = startDate.toISOString().split("T")[0];

  try {
    const metrics = await prisma.modelMetrics.findMany({
      where: {
        dateKey: { gte: startDateKey },
      },
      orderBy: { dateKey: "asc" },
    });

    // Aggregate totals
    const totals = metrics.reduce(
      (acc, m) => {
        acc.totalScans += m.totalScans;
        acc.lowRisk += m.lowRiskCount;
        acc.mediumRisk += m.mediumRiskCount;
        acc.highRisk += m.highRiskCount;
        acc.insufficient += m.insufficientCount;
        acc.legitDetected += m.legitDetected;
        acc.falsePositives += m.falsePositives;
        acc.falseNegatives += m.falseNegatives;
        return acc;
      },
      {
        totalScans: 0,
        lowRisk: 0,
        mediumRisk: 0,
        highRisk: 0,
        insufficient: 0,
        legitDetected: 0,
        falsePositives: 0,
        falseNegatives: 0,
      }
    );

    // Top scanned tickers
    const topTickers = await prisma.scanHistory.groupBy({
      by: ["ticker"],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
      orderBy: {
        _count: {
          ticker: "desc",
        },
      },
      take: 10,
    });

    // High risk detection rate
    const highRiskRate = totals.totalScans > 0 ? (totals.highRisk / totals.totalScans) * 100 : 0;

    // Accuracy (if manually marked)
    const totalMarked = totals.falsePositives + totals.falseNegatives;
    const accuracy = totalMarked > 0 ? ((totals.totalScans - totalMarked) / totals.totalScans) * 100 : null;

    return {
      totals,
      dailyMetrics: metrics,
      topTickers: topTickers.map((t) => ({
        ticker: t.ticker,
        count: t._count,
      })),
      highRiskRate,
      accuracy,
      avgProcessingTime: metrics.length > 0
        ? metrics.reduce((sum, m) => sum + (m.avgProcessingTime || 0), 0) / metrics.length
        : 0,
      avgScore: metrics.length > 0
        ? metrics.reduce((sum, m) => sum + (m.avgScore || 0), 0) / metrics.length
        : 0,
    };
  } catch (error) {
    console.error("Failed to get model efficacy metrics:", error);
    throw error;
  }
}

/**
 * Check alerts and trigger if thresholds exceeded
 */
export async function checkAndTriggerAlerts() {
  try {
    const alerts = await prisma.apiCostAlert.findMany({
      where: { isActive: true },
    });

    const { monthKey } = getDateKeys();
    const triggeredAlerts: string[] = [];

    for (const alert of alerts) {
      let currentValue = 0;

      if (alert.alertType === "COST_THRESHOLD") {
        const usage = await prisma.apiUsageLog.aggregate({
          where: {
            service: alert.service === "ALL" ? undefined : alert.service,
            monthKey,
          },
          _sum: { estimatedCost: true },
        });
        currentValue = usage._sum.estimatedCost || 0;
      } else if (alert.alertType === "RATE_LIMIT") {
        const hourAgo = new Date();
        hourAgo.setHours(hourAgo.getHours() - 1);
        const count = await prisma.apiUsageLog.count({
          where: {
            service: alert.service === "ALL" ? undefined : alert.service,
            createdAt: { gte: hourAgo },
          },
        });
        currentValue = count;
      } else if (alert.alertType === "ERROR_RATE") {
        const hourAgo = new Date();
        hourAgo.setHours(hourAgo.getHours() - 1);
        const whereFilter = {
          service: alert.service === "ALL" ? undefined : alert.service,
          createdAt: { gte: hourAgo },
        };
        const [totalRequests, errorRequests] = await Promise.all([
          prisma.apiUsageLog.count({ where: whereFilter }),
          prisma.apiUsageLog.count({
            where: {
              ...whereFilter,
              OR: [{ errorMessage: { not: null } }, { statusCode: { gte: 400 } }],
            },
          }),
        ]);
        currentValue = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
      }

      if (currentValue >= alert.threshold) {
        await prisma.apiCostAlert.update({
          where: { id: alert.id },
          data: {
            lastTriggered: new Date(),
            currentValue,
          },
        });
        triggeredAlerts.push(alert.id);
      }
    }

    return triggeredAlerts;
  } catch (error) {
    console.error("Failed to check alerts:", error);
    return [];
  }
}

/**
 * Backfill ModelMetrics and ScanUsage from ScanHistory
 */
export async function backfillAdminMetrics() {
  const scanHistory = await prisma.scanHistory.findMany({
    select: {
      userId: true,
      ticker: true,
      riskLevel: true,
      totalScore: true,
      processingTime: true,
      isLegitimate: true,
      createdAt: true,
    },
  });

  const dailyMap = new Map<
    string,
    {
      totalScans: number;
      lowRiskCount: number;
      mediumRiskCount: number;
      highRiskCount: number;
      insufficientCount: number;
      legitDetected: number;
      processingTimeSum: number;
      processingTimeCount: number;
      scoreSum: number;
      scoreCount: number;
      uniqueTickers: Set<string>;
      uniqueUsers: Set<string>;
    }
  >();

  const usageMap = new Map<string, { userId: string; monthKey: string; scanCount: number }>();

  for (const scan of scanHistory) {
    const dateKey = scan.createdAt.toISOString().split("T")[0];
    const monthKey = `${scan.createdAt.getFullYear()}-${String(scan.createdAt.getMonth() + 1).padStart(2, "0")}`;

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        totalScans: 0,
        lowRiskCount: 0,
        mediumRiskCount: 0,
        highRiskCount: 0,
        insufficientCount: 0,
        legitDetected: 0,
        processingTimeSum: 0,
        processingTimeCount: 0,
        scoreSum: 0,
        scoreCount: 0,
        uniqueTickers: new Set(),
        uniqueUsers: new Set(),
      });
    }

    const daily = dailyMap.get(dateKey)!;
    daily.totalScans += 1;
    if (scan.riskLevel === "LOW") daily.lowRiskCount += 1;
    if (scan.riskLevel === "MEDIUM") daily.mediumRiskCount += 1;
    if (scan.riskLevel === "HIGH") daily.highRiskCount += 1;
    if (scan.riskLevel === "INSUFFICIENT") daily.insufficientCount += 1;
    if (scan.isLegitimate === true) daily.legitDetected += 1;
    if (scan.processingTime) {
      daily.processingTimeSum += scan.processingTime;
      daily.processingTimeCount += 1;
    }
    daily.scoreSum += scan.totalScore;
    daily.scoreCount += 1;
    daily.uniqueTickers.add(scan.ticker);
    if (scan.userId) daily.uniqueUsers.add(scan.userId);

    if (scan.userId) {
      const usageKey = `${scan.userId}-${monthKey}`;
      const existing = usageMap.get(usageKey);
      if (existing) {
        existing.scanCount += 1;
      } else {
        usageMap.set(usageKey, { userId: scan.userId, monthKey, scanCount: 1 });
      }
    }
  }

  const dailyEntries = Array.from(dailyMap.entries());
  const usageEntries = Array.from(usageMap.values());

  await prisma.$transaction(async (tx) => {
    for (const [dateKey, daily] of dailyEntries) {
      const avgProcessingTime =
        daily.processingTimeCount > 0 ? daily.processingTimeSum / daily.processingTimeCount : null;
      const avgScore = daily.scoreCount > 0 ? daily.scoreSum / daily.scoreCount : null;

      await tx.modelMetrics.upsert({
        where: { dateKey },
        create: {
          dateKey,
          totalScans: daily.totalScans,
          lowRiskCount: daily.lowRiskCount,
          mediumRiskCount: daily.mediumRiskCount,
          highRiskCount: daily.highRiskCount,
          insufficientCount: daily.insufficientCount,
          legitDetected: daily.legitDetected,
          avgProcessingTime,
          avgScore,
          uniqueTickers: daily.uniqueTickers.size,
          uniqueUsers: daily.uniqueUsers.size,
        },
        update: {
          totalScans: daily.totalScans,
          lowRiskCount: daily.lowRiskCount,
          mediumRiskCount: daily.mediumRiskCount,
          highRiskCount: daily.highRiskCount,
          insufficientCount: daily.insufficientCount,
          legitDetected: daily.legitDetected,
          avgProcessingTime,
          avgScore,
          uniqueTickers: daily.uniqueTickers.size,
          uniqueUsers: daily.uniqueUsers.size,
        },
      });
    }

    for (const usage of usageEntries) {
      await tx.scanUsage.upsert({
        where: {
          userId_monthKey: {
            userId: usage.userId,
            monthKey: usage.monthKey,
          },
        },
        create: {
          userId: usage.userId,
          monthKey: usage.monthKey,
          scanCount: usage.scanCount,
        },
        update: {
          scanCount: usage.scanCount,
        },
      });
    }
  });

  return {
    totalScanHistory: scanHistory.length,
    modelMetricsDays: dailyEntries.length,
    scanUsageEntries: usageEntries.length,
  };
}

/**
 * Per-segment efficacy metrics
 *
 * Returns risk distribution and average scores broken down by segment:
 * - OTC stocks
 * - Micro-cap stocks (< $50M market cap)
 * - High-volume-surge stocks (volume >= 3x average)
 * - AI backend vs TypeScript fallback comparison
 */
export async function getSegmentEfficacyMetrics(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Helper: compute distribution for a where-clause
    async function getSegmentStats(where: Record<string, unknown>) {
      const baseWhere = { createdAt: { gte: startDate }, ...where };

      const [total, byRisk, avgData] = await Promise.all([
        prisma.scanHistory.count({ where: baseWhere }),
        prisma.scanHistory.groupBy({
          by: ["riskLevel"],
          where: baseWhere,
          _count: true,
        }),
        prisma.scanHistory.aggregate({
          where: baseWhere,
          _avg: { totalScore: true, processingTime: true },
        }),
      ]);

      const riskMap: Record<string, number> = {};
      for (const r of byRisk) {
        riskMap[r.riskLevel] = r._count;
      }

      return {
        totalScans: total,
        lowRisk: riskMap["LOW"] || 0,
        mediumRisk: riskMap["MEDIUM"] || 0,
        highRisk: riskMap["HIGH"] || 0,
        insufficient: riskMap["INSUFFICIENT"] || 0,
        highRiskRate: total > 0 ? ((riskMap["HIGH"] || 0) / total) * 100 : 0,
        avgScore: avgData._avg.totalScore || 0,
        avgProcessingTime: Math.round(avgData._avg.processingTime || 0),
      };
    }

    const [all, otc, microCap, highVolume, aiBackend, tsFallback] =
      await Promise.all([
        getSegmentStats({}),
        getSegmentStats({ isOtc: true }),
        getSegmentStats({ isMicroCap: true }),
        getSegmentStats({ isHighVolume: true }),
        getSegmentStats({ usedAiBackend: true }),
        getSegmentStats({ usedAiBackend: false }),
      ]);

    return {
      period: days,
      segments: {
        all,
        otc,
        microCap,
        highVolume,
        aiBackend,
        tsFallback,
      },
    };
  } catch (error) {
    console.error("Failed to get segment efficacy metrics:", error);
    throw error;
  }
}
