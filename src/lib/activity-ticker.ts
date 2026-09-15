import { prisma } from "@/lib/db";

export interface ActivityMarketScan {
  scanDate: string;
  totalStocks: number;
  evaluated: number;
  skipped: number;
  highRisk: number;
  caution: number;
  lowRisk: number;
  coveragePercent: number | null;
}

export type ActivityTickerPayload =
  | {
      status: "AVAILABLE";
      updatedAt: string;
      latestScan: ActivityMarketScan;
      allTimeEvaluations: number;
      notice: string;
    }
  | {
      status: "UNAVAILABLE";
      updatedAt: string;
      latestScan: null;
      allTimeEvaluations: null;
      notice: string;
    };

type DailyScanSummaryRow = {
  scanDate: Date;
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  lowRiskCount: number;
  mediumRiskCount: number;
  highRiskCount: number;
  insufficientCount: number;
};

type ActivityTickerClient = {
  dailyScanSummary: {
    findFirst: (args: unknown) => Promise<DailyScanSummaryRow | null>;
    aggregate: (args: unknown) => Promise<{ _sum: { evaluated: number | null } }>;
  };
};

function safeCount(value: unknown): number {
  return Math.max(Number(value) || 0, 0);
}

function unavailable(updatedAt: string, notice: string): ActivityTickerPayload {
  return {
    status: "UNAVAILABLE",
    updatedAt,
    latestScan: null,
    allTimeEvaluations: null,
    notice,
  };
}

export function createActivityTickerService(
  client: ActivityTickerClient = prisma as unknown as ActivityTickerClient,
) {
  async function getActivityTicker({
    now = new Date(),
  }: {
    now?: Date;
  } = {}): Promise<ActivityTickerPayload> {
    const [latest, allTime] = await Promise.all([
      client.dailyScanSummary.findFirst({
        orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
        select: {
          scanDate: true,
          totalStocks: true,
          evaluated: true,
          skippedNoData: true,
          lowRiskCount: true,
          mediumRiskCount: true,
          highRiskCount: true,
          insufficientCount: true,
        },
      }),
      client.dailyScanSummary.aggregate({ _sum: { evaluated: true } }),
    ]);

    if (!latest) {
      return unavailable(
        now.toISOString(),
        "No completed market-wide scan is available yet.",
      );
    }

    const totalStocks = safeCount(latest.totalStocks);
    const evaluated = safeCount(latest.evaluated);
    const skipped = safeCount(latest.skippedNoData);
    const highRisk = safeCount(latest.highRiskCount);
    const caution =
      safeCount(latest.mediumRiskCount) + safeCount(latest.insufficientCount);
    const lowRisk = safeCount(latest.lowRiskCount);
    const allTimeEvaluations = safeCount(allTime._sum.evaluated);
    const scanDateValid =
      latest.scanDate instanceof Date && !Number.isNaN(latest.scanDate.getTime());
    const publicationIsComplete =
      scanDateValid &&
      totalStocks > 0 &&
      evaluated > 0 &&
      evaluated <= totalStocks &&
      evaluated + skipped === totalStocks &&
      highRisk + caution + lowRisk === evaluated &&
      allTimeEvaluations >= evaluated;

    if (!publicationIsComplete) {
      return unavailable(
        now.toISOString(),
        "The latest market-wide scan publication is incomplete.",
      );
    }

    return {
      status: "AVAILABLE",
      updatedAt: now.toISOString(),
      latestScan: {
        scanDate: latest.scanDate.toISOString(),
        totalStocks,
        evaluated,
        skipped,
        highRisk,
        caution,
        lowRisk,
        coveragePercent:
          totalStocks > 0
            ? Math.round((evaluated / totalStocks) * 1000) / 10
            : null,
      },
      allTimeEvaluations,
      notice:
        "Verified market-wide end-of-day scan totals. Monitoring is not live.",
    };
  }

  return { getActivityTicker };
}

const defaultService = createActivityTickerService();
export const getActivityTicker = defaultService.getActivityTicker;
