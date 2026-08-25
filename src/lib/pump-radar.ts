import { prisma } from "@/lib/db";
import { getRiskLabel } from "@/lib/entitlements";
import type { RiskLevel } from "@/lib/types";

export type PumpRadarViewer = "PUBLIC" | "AUTHENTICATED";
export type PumpRadarFreshness = "FRESH" | "STALE";

const MAX_PUBLICATION_AGE_MS = 4 * 24 * 60 * 60 * 1000;

type PumpRadarClient = {
  dailyScanSummary: {
    findFirst: (args: unknown) => Promise<any>;
  };
  stockDailySnapshot: {
    findMany: (args: unknown) => Promise<any[]>;
  };
  socialScanRun: {
    findFirst: (args: unknown) => Promise<any>;
  };
  socialMention: {
    findMany: (args: unknown) => Promise<any[]>;
  };
};

export type PumpRadarPayload =
  | {
      status: "UNAVAILABLE";
      asOf: null;
      publishedAt: null;
      freshness: null;
      coverage: null;
      rows: [];
      notice: string;
    }
  | {
      status: "AVAILABLE";
      asOf: string;
      publishedAt: string;
      freshness: PumpRadarFreshness;
      coverage: {
        total: number;
        evaluated: number;
        skipped: number;
        evaluatedPercent: number | null;
      };
      rows: Array<{
        displayTicker: string;
        ticker?: string;
        companyName?: string;
        riskLabel: "High risk" | "Caution" | "Low risk";
        score: number;
        signalCount: number;
        signalSummary: string | null;
        lastPrice: number | null;
        priceChangePct: number | null;
        volumeRatio: number | null;
        socialSummary: {
          mentionCount: number;
          promotionalMentions: number;
          maxPromotionScore: number;
          platforms: string[];
        } | null;
      }>;
      notice: string;
    };

export function maskTicker(ticker: string): string {
  return `${ticker.slice(0, 1).toUpperCase()}•••`;
}

export function isFreshMarketPublication(
  scanDate: Date,
  now: Date,
): boolean {
  const age = now.getTime() - scanDate.getTime();
  return age >= 0 && age <= MAX_PUBLICATION_AGE_MS;
}

function utcDayRange(date: Date): { gte: Date; lt: Date } {
  const gte = new Date(date);
  gte.setUTCHours(0, 0, 0, 0);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function buildSocialSummary(mentions: any[]) {
  const summaries = new Map<
    string,
    {
      mentionCount: number;
      promotionalMentions: number;
      maxPromotionScore: number;
      platforms: Set<string>;
    }
  >();

  for (const mention of mentions) {
    const ticker = String(mention.ticker || "").toUpperCase();
    if (!ticker) continue;
    const current = summaries.get(ticker) ?? {
      mentionCount: 0,
      promotionalMentions: 0,
      maxPromotionScore: 0,
      platforms: new Set<string>(),
    };
    current.mentionCount += 1;
    if (mention.isPromotional) current.promotionalMentions += 1;
    current.maxPromotionScore = Math.max(
      current.maxPromotionScore,
      Number(mention.promotionScore) || 0,
    );
    if (mention.platform) current.platforms.add(String(mention.platform));
    summaries.set(ticker, current);
  }

  return new Map(
    Array.from(summaries.entries()).map(([ticker, summary]) => [
      ticker,
      {
        mentionCount: summary.mentionCount,
        promotionalMentions: summary.promotionalMentions,
        maxPromotionScore: summary.maxPromotionScore,
        platforms: Array.from(summary.platforms).sort(),
      },
    ]),
  );
}

export function createPumpRadarService(
  client: PumpRadarClient = prisma as unknown as PumpRadarClient,
) {
  async function getPumpRadar({
    limit,
    viewer,
    now = new Date(),
  }: {
    limit: number;
    viewer: PumpRadarViewer;
    now?: Date;
  }): Promise<PumpRadarPayload> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
    const summary = await client.dailyScanSummary.findFirst({
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: {
        scanDate: true,
        createdAt: true,
        totalStocks: true,
        evaluated: true,
        skippedNoData: true,
      },
    });

    // DailyScanSummary is written only after snapshot ingestion completes, so
    // its presence is the repository's current publication-complete marker.
    if (!summary) {
      return {
        status: "UNAVAILABLE",
        asOf: null,
        publishedAt: null,
        freshness: null,
        coverage: null,
        rows: [],
        notice: "No published end-of-day market scan is available.",
      };
    }

    const snapshots = await client.stockDailySnapshot.findMany({
      where: { scanDate: summary.scanDate },
      orderBy: [{ totalScore: "desc" }, { signalCount: "desc" }],
      take: safeLimit,
      select: {
        riskLevel: true,
        totalScore: true,
        signalCount: true,
        signalSummary: true,
        lastPrice: true,
        priceChangePct: true,
        volumeRatio: true,
        stock: { select: { symbol: true, name: true } },
      },
    });

    const dayRange = utcDayRange(summary.scanDate);
    const socialRun = await client.socialScanRun.findFirst({
      where: {
        status: "COMPLETED",
        scanDate: dayRange,
      },
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    const socialMentions = socialRun
      ? await client.socialMention.findMany({
          where: { scanRunId: socialRun.id },
          select: {
            ticker: true,
            platform: true,
            isPromotional: true,
            promotionScore: true,
          },
        })
      : [];
    const socialByTicker = buildSocialSummary(socialMentions);

    const rows = snapshots.map((snapshot) => {
      const ticker = String(snapshot.stock.symbol).toUpperCase();
      const base = {
        displayTicker: viewer === "PUBLIC" ? maskTicker(ticker) : ticker,
        riskLabel: getRiskLabel(snapshot.riskLevel as RiskLevel),
        score: snapshot.totalScore,
        signalCount: snapshot.signalCount,
        signalSummary: snapshot.signalSummary ?? null,
        lastPrice: snapshot.lastPrice ?? null,
        priceChangePct: snapshot.priceChangePct ?? null,
        volumeRatio: snapshot.volumeRatio ?? null,
        socialSummary: socialByTicker.get(ticker) ?? null,
      };

      if (viewer === "PUBLIC") return base;
      return {
        ...base,
        ticker,
        companyName: snapshot.stock.name,
      };
    });

    return {
      status: "AVAILABLE",
      asOf: summary.scanDate.toISOString(),
      publishedAt: summary.createdAt.toISOString(),
      freshness: isFreshMarketPublication(summary.scanDate, now)
        ? "FRESH"
        : "STALE",
      coverage: {
        total: summary.totalStocks,
        evaluated: summary.evaluated,
        skipped: summary.skippedNoData,
        evaluatedPercent:
          summary.totalStocks > 0
            ? Math.round((summary.evaluated / summary.totalStocks) * 1000) / 10
            : null,
      },
      rows,
      notice: "Checked after the trading day closes — not live.",
    };
  }

  return { getPumpRadar };
}

const defaultService = createPumpRadarService();
export const getPumpRadar = defaultService.getPumpRadar;
