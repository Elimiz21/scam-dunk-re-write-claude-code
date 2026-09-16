import { expectedMarketDate, isCurrentMarketPublication } from "@/lib/market-publication-freshness";
import { prisma } from "@/lib/db";
import { getRiskLabel } from "@/lib/entitlements";
import type { RiskLevel } from "@/lib/types";
import {
  getTickerCoverage,
  parseRunMetadata,
} from "@/lib/social-scan/coverage";

export type PumpRadarViewer = "PUBLIC" | "AUTHENTICATED";
export type PumpRadarFreshness = "FRESH" | "STALE";

const US_COMMON_STOCK_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX"]);
const NON_COMMON_SECURITY_NAME =
  /\b(?:ETF|FUND|DEPOSITARY|ADR|WARRANT|UNIT|PREFERRED|BOND|NOTE|RIGHTS?)\b/i;
const PUBLIC_SOCIAL_PLATFORM_LABELS: Record<string, string> = {
  REDDIT: "Reddit",
  YOUTUBE: "YouTube",
  DISCORD: "Discord",
  STOCKTWITS: "StockTwits",
  TWITTER: "Twitter",
  X: "X",
  TIKTOK: "TikTok",
  WEB: "Web",
};

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
      executedAt: null;
      freshness: null;
      coverage: null;
      socialPublication: null;
      rows: [];
      notice: string;
    }
  | {
      status: "AVAILABLE";
      asOf: string;
      publishedAt: string | null;
      executedAt: string | null;
      freshness: PumpRadarFreshness;
      coverage: {
        total: number;
        evaluated: number;
        skipped: number;
        evaluatedPercent: number | null;
      };
      socialPublication: {
        status: "COMPLETED" | "PARTIAL";
        scanDate: string;
        updatedAt: string;
      } | null;
      rows: Array<{
        displayTicker: string;
        ticker?: string;
        companyName?: string;
        riskLabel: "High risk" | "Caution" | "Low risk";
        score: number;
        signalCount: number;
        signalSummary?: string | null;
        lastPrice: number | null;
        priceChangePct: number | null;
        volumeRatio: number | null;
        socialSummary: {
          mentionCount: number;
          promotionalMentions: number;
          maxPromotionScore: number;
          platforms: string[];
        } | null;
        socialCoverage: {
          status:
            | "COMPLETE"
            | "PARTIAL"
            | "NOT_SEARCHED"
            | "NOT_TARGETED"
            | "UNKNOWN";
          searchedPlatforms: string[];
          incompletePlatforms: string[];
          rateLimitedPlatforms: string[];
        };
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
  return isCurrentMarketPublication(scanDate, now);
}

function utcDayRange(date: Date): { gte: Date; lt: Date } {
  const gte = new Date(date);
  gte.setUTCHours(0, 0, 0, 0);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function publicSocialPlatformLabel(value: unknown): string | null {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return PUBLIC_SOCIAL_PLATFORM_LABELS[normalized] ?? null;
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
    const platform = publicSocialPlatformLabel(mention.platform);
    if (platform) current.platforms.add(platform);
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

function isUsCommonStockSnapshot(snapshot: any): boolean {
  const stock = snapshot?.stock;
  if (!stock || stock.isOTC) return false;
  if (!US_COMMON_STOCK_EXCHANGES.has(String(stock.exchange).toUpperCase())) {
    return false;
  }
  return !NON_COMMON_SECURITY_NAME.test(String(stock.name || ""));
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
      where: { OR: [{ artifactRevisionId: null }, { artifactRevision: { status: "PUBLISHED" } }] },
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: {
        scanDate: true,
        publishedAt: true,
        artifactRevision: { select: { status: true, producerExecutedAt: true } },
        totalStocks: true,
        evaluated: true,
        skippedNoData: true,
      },
    });

    // Revised publications are visible only after atomic completion. Legacy
    // summaries remain readable, with unknown publication/execution times.
    if (!summary || (summary.artifactRevision && summary.artifactRevision.status !== "PUBLISHED")) {
      return {
        status: "UNAVAILABLE",
        asOf: null,
        publishedAt: null,
        executedAt: null,
        freshness: null,
        coverage: null,
        socialPublication: null,
        rows: [],
        notice: "No published end-of-day market scan is available.",
      };
    }

    const publicationCandidates = await client.stockDailySnapshot.findMany({
      where: {
        scanDate: summary.scanDate,
        stock: {
          exchange: { in: Array.from(US_COMMON_STOCK_EXCHANGES) },
          isOTC: false,
        },
      },
      orderBy: [{ totalScore: "desc" }, { signalCount: "desc" }],
      take: Math.min(safeLimit * 4, 200),
      select: {
        riskLevel: true,
        totalScore: true,
        signalCount: true,
        signalSummary: true,
        lastPrice: true,
        priceChangePct: true,
        volumeRatio: true,
        stock: {
          select: {
            symbol: true,
            name: true,
            exchange: true,
            isOTC: true,
          },
        },
      },
    });
    const snapshots = publicationCandidates
      .filter(isUsCommonStockSnapshot)
      .slice(0, safeLimit);

    const dayRange = utcDayRange(summary.scanDate);
    const socialRun = await client.socialScanRun.findFirst({
      where: {
        status: { in: ["COMPLETED", "PARTIAL"] },
        scanDate: dayRange,
      },
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        scanDate: true,
        updatedAt: true,
        platformsUsed: true,
      },
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
    const socialMetadata = parseRunMetadata(socialRun?.platformsUsed);

    const rows = snapshots.map((snapshot) => {
      const ticker = String(snapshot.stock.symbol).toUpperCase();
      const base = {
        displayTicker: viewer === "PUBLIC" ? maskTicker(ticker) : ticker,
        riskLabel: getRiskLabel(snapshot.riskLevel as RiskLevel),
        score: snapshot.totalScore,
        signalCount: snapshot.signalCount,
        lastPrice: snapshot.lastPrice ?? null,
        priceChangePct: snapshot.priceChangePct ?? null,
        volumeRatio: snapshot.volumeRatio ?? null,
        socialSummary: socialByTicker.get(ticker) ?? null,
        socialCoverage: getTickerCoverage(socialMetadata, ticker),
      };

      if (viewer === "PUBLIC") return base;
      return {
        ...base,
        ticker,
        companyName: snapshot.stock.name,
        signalSummary: snapshot.signalSummary ?? null,
      };
    });

    return {
      status: "AVAILABLE",
      asOf: summary.scanDate.toISOString(),
      publishedAt: summary.artifactRevision ? summary.publishedAt?.toISOString() ?? null : null,
      executedAt: summary.artifactRevision?.producerExecutedAt?.toISOString() ?? null,
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
      socialPublication: socialRun
        ? {
            status: socialRun.status as "COMPLETED" | "PARTIAL",
            scanDate: socialRun.scanDate.toISOString(),
            updatedAt: socialRun.updatedAt.toISOString(),
          }
        : null,
      rows,
      notice: expectedMarketDate(now)
        ? "Checked after the trading day closes — not live."
        : "Market data is not live. Freshness cannot be confirmed outside the supported 2026–2028 market calendar.",
    };
  }

  return { getPumpRadar };
}

const defaultService = createPumpRadarService();
export const getPumpRadar = defaultService.getPumpRadar;
