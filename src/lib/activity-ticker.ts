import { prisma } from "@/lib/db";

export interface ActivityRiskCounts {
  total: number;
  highRisk: number;
  caution: number;
  lowRisk: number;
}

export interface ActivityTickerPayload {
  status: "AVAILABLE";
  updatedAt: string;
  allTimeScans: number;
  week: ActivityRiskCounts;
  month: ActivityRiskCounts;
  community: Array<{
    displayTicker: string;
    riskLabel: "High risk";
    score: number;
    scannedAt: string;
  }>;
  notice: string;
}

type ActivityTickerClient = {
  scanHistory: {
    count: (args: unknown) => Promise<number>;
    groupBy: (args: unknown) => Promise<unknown[]>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
};

type RiskGroup = {
  riskLevel?: unknown;
  _count?: { _all?: unknown };
};

function startOfUtcWeek(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  const day = result.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  result.setUTCDate(result.getUTCDate() - daysSinceMonday);
  return result;
}

function startOfUtcMonth(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(1);
  return result;
}

function maskedTicker(value: unknown): string {
  const ticker = String(value || "").trim().toUpperCase();
  return ticker ? `${ticker.slice(0, 1)}•••` : "•••";
}

function riskCounts(groups: unknown[]): ActivityRiskCounts {
  const counts: ActivityRiskCounts = {
    total: 0,
    highRisk: 0,
    caution: 0,
    lowRisk: 0,
  };

  for (const group of groups as RiskGroup[]) {
    const count = Math.max(Number(group._count?._all) || 0, 0);
    counts.total += count;
    switch (String(group.riskLevel || "").toUpperCase()) {
      case "HIGH":
        counts.highRisk += count;
        break;
      case "LOW":
        counts.lowRisk += count;
        break;
      case "MEDIUM":
      case "INSUFFICIENT":
        counts.caution += count;
        break;
      default:
        break;
    }
  }

  return counts;
}

export function createActivityTickerService(
  client: ActivityTickerClient = prisma as unknown as ActivityTickerClient,
) {
  async function getActivityTicker({
    excludeUserId,
    now = new Date(),
  }: {
    excludeUserId?: string;
    now?: Date;
  }): Promise<ActivityTickerPayload> {
    const weekStart = startOfUtcWeek(now);
    const monthStart = startOfUtcMonth(now);
    const communityWhere = {
      createdAt: { gte: weekStart },
      riskLevel: "HIGH",
      userId: excludeUserId ? { not: excludeUserId } : { not: null },
    };

    const [allTimeScans, weekGroups, monthGroups, communityRows] =
      await Promise.all([
        client.scanHistory.count({}),
        client.scanHistory.groupBy({
          by: ["riskLevel"],
          where: { createdAt: { gte: weekStart } },
          _count: { _all: true },
        }),
        client.scanHistory.groupBy({
          by: ["riskLevel"],
          where: { createdAt: { gte: monthStart } },
          _count: { _all: true },
        }),
        client.scanHistory.findMany({
          where: communityWhere,
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            ticker: true,
            riskLevel: true,
            totalScore: true,
            createdAt: true,
          },
        }),
      ]);

    return {
      status: "AVAILABLE",
      updatedAt: now.toISOString(),
      allTimeScans: Math.max(Number(allTimeScans) || 0, 0),
      week: riskCounts(weekGroups),
      month: riskCounts(monthGroups),
      community: (communityRows as Array<{
        ticker?: unknown;
        riskLevel?: unknown;
        totalScore?: unknown;
        createdAt?: Date;
      }>).map((row) => ({
        displayTicker: maskedTicker(row.ticker),
        riskLabel: "High risk" as const,
        score: Math.max(Number(row.totalScore) || 0, 0),
        scannedAt: new Date(row.createdAt || now).toISOString(),
      })),
      notice:
        "Counts reflect completed scan records. Community high-risk tickers are masked and limited to the last 7 days.",
    };
  }

  return { getActivityTicker };
}

const defaultService = createActivityTickerService();
export const getActivityTicker = defaultService.getActivityTicker;
