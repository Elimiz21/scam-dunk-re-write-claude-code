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
    await updateDailyModelMetrics(
      data.riskLevel,
      data.processingTime,
      data.totalScore,
      data.isLegitimate,
    );
  } catch (error) {
    console.error("Failed to log scan history:", error);
  }
}

/**
 * Update daily model metrics aggregation.
 *
 * Counters are incremented atomically via a single upsert with `{ increment }`,
 * so concurrent scans never lose increments and the first-scan-of-day no longer
 * races on create (a unique violation would previously fail the whole
 * logScanHistory). Averages are NOT maintained as a running mean (which is
 * race-prone and corrupts the divisor on lost updates) — they are recomputed
 * exactly from the day's ScanHistory rows, which already include the row this
 * call corresponds to.
 */
async function updateDailyModelMetrics(
  riskLevel: string,
  _processingTime?: number,
  _totalScore?: number,
  isLegitimate?: boolean,
) {
  const { dayKey } = getDateKeys();

  try {
    // Atomic counter increments — race-free across concurrent scans, and the
    // upsert handles the first-scan-of-day without a unique-violation crash.
    await prisma.modelMetrics.upsert({
      where: { dateKey: dayKey },
      create: {
        dateKey: dayKey,
        totalScans: 1,
        lowRiskCount: riskLevel === "LOW" ? 1 : 0,
        mediumRiskCount: riskLevel === "MEDIUM" ? 1 : 0,
        highRiskCount: riskLevel === "HIGH" ? 1 : 0,
        insufficientCount: riskLevel === "INSUFFICIENT" ? 1 : 0,
        legitDetected: isLegitimate === true ? 1 : 0,
      },
      update: {
        totalScans: { increment: 1 },
        ...(riskLevel === "LOW" ? { lowRiskCount: { increment: 1 } } : {}),
        ...(riskLevel === "MEDIUM"
          ? { mediumRiskCount: { increment: 1 } }
          : {}),
        ...(riskLevel === "HIGH" ? { highRiskCount: { increment: 1 } } : {}),
        ...(riskLevel === "INSUFFICIENT"
          ? { insufficientCount: { increment: 1 } }
          : {}),
        ...(isLegitimate === true ? { legitDetected: { increment: 1 } } : {}),
      },
    });

    // Recompute the day's averages exactly from ScanHistory (no stale divisor).
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dayAgg = await prisma.scanHistory.aggregate({
      where: { createdAt: { gte: startOfDay } },
      _avg: { processingTime: true, totalScore: true },
    });

    await prisma.modelMetrics.update({
      where: { dateKey: dayKey },
      data: {
        avgProcessingTime: dayAgg._avg.processingTime ?? null,
        avgScore: dayAgg._avg.totalScore ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to update daily metrics:", error);
  }
}

/**
 * Get dashboard overview metrics
 */
export async function getDashboardMetrics() {
  const { dayKey } = getDateKeys();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  try {
    // Total users
    const totalUsers = await prisma.user.count();

    const [
      activeUsersRows,
      monthlyScans,
      scansToday,
      todayMetrics,
      riskLevels,
      dailyTrend,
      usersByPlan,
      newUsersToday,
      newUsersThisMonth,
    ] = await Promise.all([
      // Active users (distinct users with scans in the last 30 days).
      // COUNT(DISTINCT) in SQL — avoids materializing every active userId just
      // to take .length. Uses the ScanHistory(userId, createdAt) index.
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint AS count
        FROM "ScanHistory"
        WHERE "userId" IS NOT NULL
          AND "createdAt" >= ${thirtyDaysAgo}
      `,

      // Total scans this month
      prisma.scanHistory.count({
        where: {
          createdAt: { gte: startOfMonth },
        },
      }),

      // Scans today
      prisma.scanHistory.count({
        where: {
          createdAt: { gte: startOfDay },
        },
      }),

      // Processing time for today
      prisma.scanHistory.aggregate({
        where: {
          createdAt: { gte: startOfDay },
        },
        _avg: {
          processingTime: true,
        },
      }),

      // Risk level distribution (last 30 days)
      prisma.scanHistory.groupBy({
        by: ["riskLevel"],
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
      }),

      // Daily scan trend (last 7 days)
      prisma.modelMetrics.findMany({
        where: {
          dateKey: {
            gte: (() => {
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              return sevenDaysAgo.toISOString().split("T")[0];
            })(),
          },
        },
        orderBy: { dateKey: "asc" },
        select: {
          dateKey: true,
          totalScans: true,
        },
      }),

      // Paid vs Free users
      prisma.user.groupBy({
        by: ["plan"],
        _count: true,
      }),

      // New users today
      prisma.user.count({
        where: { createdAt: { gte: startOfDay } },
      }),

      // New users this month
      prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    const riskDistribution = riskLevels.reduce(
      (acc, row) => {
        if (row.riskLevel === "LOW") acc.low = row._count;
        if (row.riskLevel === "MEDIUM") acc.medium = row._count;
        if (row.riskLevel === "HIGH") acc.high = row._count;
        if (row.riskLevel === "INSUFFICIENT") acc.insufficient = row._count;
        return acc;
      },
      { low: 0, medium: 0, high: 0, insufficient: 0 },
    );

    const paidUsers = usersByPlan.find((u) => u.plan === "PAID")?._count ?? 0;
    const freeUsers = totalUsers - paidUsers;

    const activeUsers = Number(activeUsersRows[0]?.count ?? 0);

    return {
      totalUsers,
      activeUsers,
      monthlyScans,
      scansToday,
      paidUsers,
      freeUsers,
      riskDistribution,
      dailyTrend,
      newUsersToday,
      newUsersThisMonth,
      avgProcessingTime: todayMetrics._avg.processingTime || 0,
    };
  } catch (error) {
    console.error("Failed to get dashboard metrics:", error);
    throw error;
  }
}

/**
 * Get API usage summary for cost monitoring
 */
export async function getApiUsageSummary(
  period: "day" | "week" | "month" = "month",
) {
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

    const totalCost = usageByService.reduce(
      (sum, s) => sum + (s._sum.estimatedCost || 0),
      0,
    );
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
      },
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
    const highRiskRate =
      totals.totalScans > 0 ? (totals.highRisk / totals.totalScans) * 100 : 0;

    // Accuracy (if manually marked)
    const totalMarked = totals.falsePositives + totals.falseNegatives;
    const accuracy =
      totalMarked > 0
        ? ((totals.totalScans - totalMarked) / totals.totalScans) * 100
        : null;

    return {
      totals,
      dailyMetrics: metrics,
      topTickers: topTickers.map((t) => ({
        ticker: t.ticker,
        count: t._count,
      })),
      highRiskRate,
      accuracy,
      avgProcessingTime:
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + (m.avgProcessingTime || 0), 0) /
            metrics.length
          : 0,
      avgScore:
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + (m.avgScore || 0), 0) /
            metrics.length
          : 0,
    };
  } catch (error) {
    console.error("Failed to get model efficacy metrics:", error);
    throw error;
  }
}

type ApiCostAlertRow = Awaited<
  ReturnType<typeof prisma.apiCostAlert.findMany>
>[number];

/**
 * Compute the current value for a single alert (READ-ONLY, no writes).
 */
async function evaluateAlertValue(alert: ApiCostAlertRow): Promise<number> {
  const { monthKey } = getDateKeys();

  if (alert.alertType === "COST_THRESHOLD") {
    const usage = await prisma.apiUsageLog.aggregate({
      where: {
        service: alert.service === "ALL" ? undefined : alert.service,
        monthKey,
      },
      _sum: { estimatedCost: true },
    });
    return usage._sum.estimatedCost || 0;
  }

  if (alert.alertType === "RATE_LIMIT") {
    const hourAgo = new Date();
    hourAgo.setHours(hourAgo.getHours() - 1);
    return prisma.apiUsageLog.count({
      where: {
        service: alert.service === "ALL" ? undefined : alert.service,
        createdAt: { gte: hourAgo },
      },
    });
  }

  if (alert.alertType === "ERROR_RATE") {
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
    return totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
  }

  return 0;
}

/**
 * Evaluate active alerts WITHOUT writing (safe to call from GET handlers).
 * Returns the IDs of alerts currently over threshold. Persisting the trigger
 * (lastTriggered/currentValue) is the job of {@link checkAndTriggerAlerts},
 * which should run from a cron — not on every dashboard read.
 */
export async function evaluateActiveAlerts(): Promise<string[]> {
  try {
    const alerts = await prisma.apiCostAlert.findMany({
      where: { isActive: true },
    });

    const results = await Promise.all(
      alerts.map(async (alert) => ({
        id: alert.id,
        over: (await evaluateAlertValue(alert)) >= alert.threshold,
      })),
    );

    return results.filter((r) => r.over).map((r) => r.id);
  } catch (error) {
    console.error("Failed to evaluate alerts:", error);
    return [];
  }
}

/**
 * Check alerts and trigger if thresholds exceeded.
 *
 * WRITE-BEARING: persists lastTriggered/currentValue. Intended to run from a
 * scheduled cron (e.g. Vercel Cron) — do NOT call this from a GET handler.
 */
export async function checkAndTriggerAlerts() {
  try {
    const alerts = await prisma.apiCostAlert.findMany({
      where: { isActive: true },
    });

    const triggeredAlerts: string[] = [];

    for (const alert of alerts) {
      const currentValue = await evaluateAlertValue(alert);

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
 * Backfill ModelMetrics and ScanUsage from ScanHistory.
 *
 * Set-based (INSERT ... SELECT ... GROUP BY ... ON CONFLICT) so the whole
 * aggregation runs inside Postgres — it never loads the ScanHistory table into
 * the lambda and never does per-row upserts inside one 5s interactive
 * transaction. Each statement is a single atomic SQL command.
 *
 * Date/month keys use the stored (UTC) timestamp via to_char, matching the
 * previous toISOString()-based keying.
 */
export async function backfillAdminMetrics() {
  // Rebuild ModelMetrics daily rollups from ScanHistory in one statement.
  const modelMetricsDays = await prisma.$executeRaw`
    INSERT INTO "ModelMetrics" (
      "id", "dateKey", "totalScans",
      "lowRiskCount", "mediumRiskCount", "highRiskCount", "insufficientCount",
      "legitDetected", "avgProcessingTime", "avgScore",
      "uniqueTickers", "uniqueUsers", "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      to_char("createdAt", 'YYYY-MM-DD') AS "dateKey",
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE "riskLevel" = 'LOW')::int,
      COUNT(*) FILTER (WHERE "riskLevel" = 'MEDIUM')::int,
      COUNT(*) FILTER (WHERE "riskLevel" = 'HIGH')::int,
      COUNT(*) FILTER (WHERE "riskLevel" = 'INSUFFICIENT')::int,
      COUNT(*) FILTER (WHERE "isLegitimate" = TRUE)::int,
      AVG("processingTime"),
      AVG("totalScore"),
      COUNT(DISTINCT "ticker")::int,
      COUNT(DISTINCT "userId")::int,
      NOW(),
      NOW()
    FROM "ScanHistory"
    GROUP BY to_char("createdAt", 'YYYY-MM-DD')
    ON CONFLICT ("dateKey") DO UPDATE SET
      "totalScans" = EXCLUDED."totalScans",
      "lowRiskCount" = EXCLUDED."lowRiskCount",
      "mediumRiskCount" = EXCLUDED."mediumRiskCount",
      "highRiskCount" = EXCLUDED."highRiskCount",
      "insufficientCount" = EXCLUDED."insufficientCount",
      "legitDetected" = EXCLUDED."legitDetected",
      "avgProcessingTime" = EXCLUDED."avgProcessingTime",
      "avgScore" = EXCLUDED."avgScore",
      "uniqueTickers" = EXCLUDED."uniqueTickers",
      "uniqueUsers" = EXCLUDED."uniqueUsers",
      "updatedAt" = NOW()
  `;

  // Rebuild ScanUsage monthly per-user counts in one statement.
  const scanUsageEntries = await prisma.$executeRaw`
    INSERT INTO "ScanUsage" (
      "id", "userId", "monthKey", "scanCount", "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      "userId",
      to_char("createdAt", 'YYYY-MM') AS "monthKey",
      COUNT(*)::int,
      NOW(),
      NOW()
    FROM "ScanHistory"
    WHERE "userId" IS NOT NULL
    GROUP BY "userId", to_char("createdAt", 'YYYY-MM')
    ON CONFLICT ("userId", "monthKey") DO UPDATE SET
      "scanCount" = EXCLUDED."scanCount",
      "updatedAt" = NOW()
  `;

  // Total ScanHistory rows (cheap COUNT, not a table load) for the report.
  const totalScanHistory = await prisma.scanHistory.count();

  return {
    totalScanHistory,
    modelMetricsDays,
    scanUsageEntries,
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
    // Single pass over the date range using conditional aggregation, instead of
    // 6 segments x 3 queries (18 round-trips contending for a ~3-connection
    // pool). FILTER (WHERE ...) computes each segment's totals, risk
    // distribution and averages in one scan over the (createdAt, ...) index.
    const segmentDefs = [
      { key: "all", cond: "TRUE" },
      { key: "otc", cond: '"isOtc" = TRUE' },
      { key: "microCap", cond: '"isMicroCap" = TRUE' },
      { key: "highVolume", cond: '"isHighVolume" = TRUE' },
      { key: "aiBackend", cond: '"usedAiBackend" = TRUE' },
      { key: "tsFallback", cond: '"usedAiBackend" = FALSE' },
    ] as const;

    const selectExprs = segmentDefs
      .map(({ key, cond }) => {
        return [
          `COUNT(*) FILTER (WHERE ${cond}) AS "${key}_total"`,
          `COUNT(*) FILTER (WHERE ${cond} AND "riskLevel" = 'LOW') AS "${key}_low"`,
          `COUNT(*) FILTER (WHERE ${cond} AND "riskLevel" = 'MEDIUM') AS "${key}_medium"`,
          `COUNT(*) FILTER (WHERE ${cond} AND "riskLevel" = 'HIGH') AS "${key}_high"`,
          `COUNT(*) FILTER (WHERE ${cond} AND "riskLevel" = 'INSUFFICIENT') AS "${key}_insufficient"`,
          `AVG("totalScore") FILTER (WHERE ${cond}) AS "${key}_avgScore"`,
          `AVG("processingTime") FILTER (WHERE ${cond}) AS "${key}_avgTime"`,
        ].join(",\n        ");
      })
      .join(",\n        ");

    const sql = `
      SELECT
        ${selectExprs}
      FROM "ScanHistory"
      WHERE "createdAt" >= $1
    `;

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
      startDate,
    );
    const row = rows[0] || {};

    const num = (v: unknown): number => (v == null ? 0 : Number(v));

    const buildSegment = (key: string) => {
      const total = num(row[`${key}_total`]);
      const high = num(row[`${key}_high`]);
      return {
        totalScans: total,
        lowRisk: num(row[`${key}_low`]),
        mediumRisk: num(row[`${key}_medium`]),
        highRisk: high,
        insufficient: num(row[`${key}_insufficient`]),
        highRiskRate: total > 0 ? (high / total) * 100 : 0,
        avgScore: num(row[`${key}_avgScore`]),
        avgProcessingTime: Math.round(num(row[`${key}_avgTime`])),
      };
    };

    return {
      period: days,
      segments: {
        all: buildSegment("all"),
        otc: buildSegment("otc"),
        microCap: buildSegment("microCap"),
        highVolume: buildSegment("highVolume"),
        aiBackend: buildSegment("aiBackend"),
        tsFallback: buildSegment("tsFallback"),
      },
    };
  } catch (error) {
    console.error("Failed to get segment efficacy metrics:", error);
    throw error;
  }
}
