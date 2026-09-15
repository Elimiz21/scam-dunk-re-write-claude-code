import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { getRiskLabel } from "@/lib/entitlements";
import type { RiskLevel } from "@/lib/types";

export type PumpRadarViewer = "PUBLIC" | "AUTHENTICATED";
export type PumpRadarFreshness = "FRESH" | "STALE";

const MAX_PUBLICATION_AGE_MS = 4 * 24 * 60 * 60 * 1000;
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
        sector: string;
        marketCapBand: string;
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
      }>;
      notice: string;
    };

const RADAR_SECTORS = new Set([
  "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
  "Consumer Defensive", "Industrials", "Energy", "Basic Materials",
  "Real Estate", "Utilities", "Communication Services",
]);

function marketCapBand(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Cap unavailable";
  if (value < 300_000_000) return "Micro cap";
  if (value < 2_000_000_000) return "Small cap";
  if (value < 10_000_000_000) return "Mid cap";
  return "Large cap";
}

// Use opaque database IDs, never an enumerable hash of the stock symbol.
function caseLabel(snapshotId: string): string {
  return `Case ${createHash("sha256").update(snapshotId).digest("hex").slice(0, 10).toUpperCase()}`;
}

function patternSummary(snapshot: any): string {
  const patterns: string[] = [];
  if (snapshot.volumeRatio >= 3) patterns.push("Elevated trading volume");
  if (Math.abs(snapshot.priceChangePct ?? 0) >= 10) patterns.push("Sharp price movement");
  return patterns.length ? patterns.join(" · ") : "Combined risk signals";
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
        id: true,
        marketCap: true,
        riskLevel: true,
        totalScore: true,
        signalCount: true,
        priceChangePct: true,
        volumeRatio: true,
        stock: {
          select: {
            symbol: true,
            sector: true,
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
      return {
        displayTicker: caseLabel(snapshot.id),
        sector: RADAR_SECTORS.has(snapshot.stock.sector) ? snapshot.stock.sector : "Sector unavailable",
        marketCapBand: marketCapBand(snapshot.marketCap),
        signalSummary: patternSummary(snapshot),
        riskLabel: getRiskLabel(snapshot.riskLevel as RiskLevel),
        score: snapshot.totalScore,
        signalCount: snapshot.signalCount,
        // Precise market observations can identify a stock by matching public quotes.
        // Retain nullable keys for API compatibility; publish only broad patterns.
        lastPrice: null,
        priceChangePct: null,
        volumeRatio: null,
        socialSummary: socialByTicker.get(ticker) ?? null,
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
