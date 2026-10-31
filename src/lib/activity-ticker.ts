import { prisma } from "@/lib/db";
import { SCORING_VERSION } from "@/lib/scoring/policy";
import { publishedExcludedCount } from "@/lib/publication-counts";
import { isCurrentMarketPublication } from "@/lib/market-publication-freshness";

export interface ActivityMarketScan {
  scanDate: string;
  totalStocks: number;
  evaluated: number;
  skipped: number;
  excluded: number;
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
  artifactRevisionId: string | null;
  artifactRevision: { status: string } | null;
  byExchange: string;
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
    findMany?: (args: unknown) => Promise<DailyScanSummaryRow[]>;
    aggregate: (args: unknown) => Promise<{ _sum: { evaluated: number | null } }>;
  };
  stockDailySnapshot: {
    groupBy: (args: unknown) => Promise<Array<{ scoringVersion: string | null; _count: { _all: number } }>>;
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
    const summaryQuery = {
      where: { artifactRevision: { is: { status: "PUBLISHED" } } },
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: {
        artifactRevisionId: true,
        artifactRevision: { select: { status: true } },
        byExchange: true,
        scanDate: true,
        totalStocks: true,
        evaluated: true,
        skippedNoData: true,
        lowRiskCount: true,
        mediumRiskCount: true,
        highRiskCount: true,
        insufficientCount: true,
      },
    };
    const [latest, allTime] = await Promise.all([
      client.dailyScanSummary.findFirst(summaryQuery),
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
    const excluded = publishedExcludedCount(latest.byExchange);
    const allTimeEvaluations = safeCount(allTime._sum.evaluated);
    const publicationIsComplete = latest.artifactRevisionId && latest.artifactRevision?.status === "PUBLISHED" &&
      latest.scanDate instanceof Date && isCurrentMarketPublication(latest.scanDate, now) &&
      [latest.totalStocks, latest.evaluated, latest.skippedNoData, latest.highRiskCount, latest.mediumRiskCount, latest.insufficientCount, latest.lowRiskCount]
        .every(value => Number.isSafeInteger(value) && value >= 0) &&
      totalStocks > 0 && evaluated > 0 && excluded !== null &&
      evaluated + skipped + excluded === totalStocks && highRisk + caution + lowRisk === evaluated && allTimeEvaluations >= evaluated;

    if (!publicationIsComplete) {
      return unavailable(
        now.toISOString(),
        "The latest market-wide scan publication is incomplete or out of date.",
      );
    }

    const versions = await client.stockDailySnapshot.groupBy({
      by: ["scoringVersion"],
      where: { artifactRevisionId: latest.artifactRevisionId, scanDate: latest.scanDate },
      _count: { _all: true },
    });
    if (versions.length !== 1 || versions[0].scoringVersion !== SCORING_VERSION || versions[0]._count._all !== evaluated) {
      return unavailable(now.toISOString(), "The latest market-wide scan does not contain a complete current-rule cohort.");
    }

    return {
      status: "AVAILABLE",
      updatedAt: now.toISOString(),
      latestScan: {
        scanDate: latest.scanDate.toISOString(),
        totalStocks,
        evaluated,
        skipped,
        excluded: excluded!,
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
