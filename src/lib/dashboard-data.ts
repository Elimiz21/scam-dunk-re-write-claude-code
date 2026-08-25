import { getCurrentMonthKey } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getPlanEntitlements, getRiskLabel } from "@/lib/entitlements";
import { createPumpRadarService } from "@/lib/pump-radar";
import type { RiskLevel } from "@/lib/types";

export const HISTORY_ORDERS = [
  "MOST_RECENT",
  "HIGHEST_RISK",
  "DATE_ADDED",
] as const;
export type HistoryOrder = (typeof HISTORY_ORDERS)[number];

type DashboardDataClient = {
  user?: { findUnique: (args: unknown) => Promise<any> };
  scanUsage?: { findUnique: (args: unknown) => Promise<any> };
  watchlistEntry?: { findMany: (args: unknown) => Promise<any[]> };
  activeMonitor?: { findMany: (args: unknown) => Promise<any[]> };
  scanHistory: {
    findMany: (args: unknown) => Promise<any[]>;
    findFirst?: (args: unknown) => Promise<any>;
    count?: (args: unknown) => Promise<number>;
  };
  trackedStock?: { findUnique: (args: unknown) => Promise<any> };
  stockDailySnapshot?: {
    findMany?: (args: unknown) => Promise<any[]>;
    findFirst?: (args: unknown) => Promise<any>;
  };
  dailyScanSummary?: { findFirst: (args: unknown) => Promise<any> };
  socialScanRun?: { findFirst: (args: unknown) => Promise<any> };
  socialMention: { findMany: (args: unknown) => Promise<any[]> };
};

const RISK_ORDER: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  INSUFFICIENT: 2,
  LOW: 1,
};

const US_COMMON_STOCK_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX"]);
const NON_COMMON_SECURITY_NAME =
  /\b(?:ETF|FUND|DEPOSITARY|ADR|WARRANT|UNIT|PREFERRED|BOND|NOTE|RIGHTS?)\b/i;

function sourceType(assetType: string) {
  if (assetType === "monitor-full") return "AUTOMATIC_FULL" as const;
  if (assetType === "monitor-price") return "AUTOMATIC_PRICE" as const;
  return "MANUAL" as const;
}

function startOfUtcDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function endOfUtcDayExclusive(date: Date): Date {
  const result = startOfUtcDay(date);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isTrackedUsCommonStock(stock: {
  exchange?: string | null;
  isOTC?: boolean | null;
  name?: string | null;
} | null): boolean {
  if (!stock || stock.isOTC) return false;
  if (!US_COMMON_STOCK_EXCHANGES.has(String(stock.exchange).toUpperCase())) {
    return false;
  }
  return !NON_COMMON_SECURITY_NAME.test(String(stock.name || ""));
}

export function createDashboardDataService(
  client: DashboardDataClient = prisma as unknown as DashboardDataClient,
) {
  async function getScanHistory(
    userId: string,
    options: { order: HistoryOrder; page: number; limit: number },
  ) {
    const page = Math.max(Math.trunc(options.page), 1);
    const limit = Math.min(Math.max(Math.trunc(options.limit), 1), 50);
    const [scans, watchlist] = await Promise.all([
      client.scanHistory.findMany({
        where: { userId },
        select: {
          id: true,
          ticker: true,
          assetType: true,
          riskLevel: true,
          totalScore: true,
          signalsCount: true,
          createdAt: true,
        },
      }),
      options.order === "DATE_ADDED" && client.watchlistEntry
        ? client.watchlistEntry.findMany({
            where: { userId },
            select: { ticker: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const watchlistDates = new Map<string, number>(
      watchlist.map((entry) => [
        String(entry.ticker).toUpperCase(),
        new Date(entry.createdAt).getTime(),
      ]),
    );
    const sorted = [...scans].sort((left, right) => {
      if (options.order === "HIGHEST_RISK") {
        const riskDifference =
          (RISK_ORDER[right.riskLevel] ?? 0) -
          (RISK_ORDER[left.riskLevel] ?? 0);
        if (riskDifference !== 0) return riskDifference;
        if (right.totalScore !== left.totalScore) {
          return right.totalScore - left.totalScore;
        }
      }
      if (options.order === "DATE_ADDED") {
        const dateDifference =
          (watchlistDates.get(String(right.ticker).toUpperCase()) ?? -1) -
          (watchlistDates.get(String(left.ticker).toUpperCase()) ?? -1);
        if (dateDifference !== 0) return dateDifference;
      }
      return (
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime()
      );
    });

    const offset = (page - 1) * limit;
    const pagedScans = sorted.slice(offset, offset + limit);
    const tickers = Array.from(
      new Set(pagedScans.map((scan) => String(scan.ticker).toUpperCase())),
    );
    const mentions = tickers.length
      ? await client.socialMention.findMany({
          where: { ticker: { in: tickers } },
          select: { ticker: true },
          distinct: ["ticker"],
        })
      : [];
    const socialTickers = new Set(
      mentions.map((mention) => String(mention.ticker).toUpperCase()),
    );

    const items = pagedScans.map((scan) => ({
      id: scan.id,
      ticker: scan.ticker,
      source: sourceType(scan.assetType),
      riskLabel: getRiskLabel(scan.riskLevel as RiskLevel),
      score: scan.totalScore,
      signalCount: scan.signalsCount,
      scannedAt: new Date(scan.createdAt).toISOString(),
      watchlistAddedAt: watchlistDates.has(String(scan.ticker).toUpperCase())
        ? new Date(
            watchlistDates.get(String(scan.ticker).toUpperCase())!,
          ).toISOString()
        : null,
      socialEvidenceAvailable: socialTickers.has(
        String(scan.ticker).toUpperCase(),
      ),
    }));

    const total = scans.length;
    return {
      order: options.order,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  async function getScanDetail(userId: string, scanId: string) {
    if (!client.scanHistory.findFirst) {
      throw new Error("Scan detail lookup is unavailable.");
    }
    const scan = await client.scanHistory.findFirst({
      where: { id: scanId, userId },
      select: {
        id: true,
        ticker: true,
        assetType: true,
        riskLevel: true,
        totalScore: true,
        signalsCount: true,
        isLegitimate: true,
        pitchProvided: true,
        contextProvided: true,
        createdAt: true,
      },
    });
    if (!scan) return null;

    const trackedStock = client.trackedStock
      ? await client.trackedStock.findUnique({
          where: { symbol: String(scan.ticker).toUpperCase() },
          select: { id: true, symbol: true, name: true, exchange: true },
        })
      : null;
    const marketSnapshot =
      trackedStock && client.stockDailySnapshot?.findFirst
        ? await client.stockDailySnapshot.findFirst({
            where: {
              stockId: trackedStock.id,
              scanDate: { lte: startOfUtcDay(scan.createdAt) },
            },
            orderBy: { scanDate: "desc" },
            select: {
              scanDate: true,
              evaluatedAt: true,
              lastPrice: true,
              previousClose: true,
              priceChangePct: true,
              volume: true,
              avgVolume: true,
              volumeRatio: true,
              marketCap: true,
              signals: true,
              signalSummary: true,
            },
          })
        : null;

    const socialRun = client.socialScanRun
      ? await client.socialScanRun.findFirst({
          where: {
            status: "COMPLETED",
            scanDate: {
              gte: startOfUtcDay(scan.createdAt),
              lt: endOfUtcDayExclusive(scan.createdAt),
            },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, scanDate: true, createdAt: true },
        })
      : null;
    const socialEvidence = socialRun
      ? await client.socialMention.findMany({
          where: {
            scanRunId: socialRun.id,
            ticker: String(scan.ticker).toUpperCase(),
          },
          orderBy: [{ promotionScore: "desc" }, { createdAt: "desc" }],
          take: 20,
          select: {
            id: true,
            platform: true,
            title: true,
            url: true,
            postDate: true,
            sentiment: true,
            isPromotional: true,
            promotionScore: true,
            redFlags: true,
          },
        })
      : [];

    return {
      id: scan.id,
      ticker: scan.ticker,
      source: sourceType(scan.assetType),
      riskLabel: getRiskLabel(scan.riskLevel as RiskLevel),
      score: scan.totalScore,
      signalCount: scan.signalsCount,
      scannedAt: scan.createdAt.toISOString(),
      isLegitimate: scan.isLegitimate,
      evidenceProvided: {
        pitch: scan.pitchProvided,
        context: scan.contextProvided,
        social: socialRun !== null,
      },
      market: trackedStock
        ? {
            companyName: trackedStock.name,
            exchange: trackedStock.exchange,
            asOf: marketSnapshot?.scanDate?.toISOString() ?? null,
            evaluatedAt: marketSnapshot?.evaluatedAt?.toISOString() ?? null,
            lastPrice: marketSnapshot?.lastPrice ?? null,
            previousClose: marketSnapshot?.previousClose ?? null,
            priceChangePct: marketSnapshot?.priceChangePct ?? null,
            volume: marketSnapshot?.volume ?? null,
            avgVolume: marketSnapshot?.avgVolume ?? null,
            volumeRatio: marketSnapshot?.volumeRatio ?? null,
            marketCap: marketSnapshot?.marketCap ?? null,
            signalSummary: marketSnapshot?.signalSummary ?? null,
            signals: parseJsonArray(marketSnapshot?.signals),
          }
        : null,
      social: socialRun
        ? {
            status: "ANALYZED" as const,
            asOf: socialRun.scanDate.toISOString(),
            evidence: socialEvidence.map((mention) => ({
              id: mention.id,
              platform: mention.platform,
              title: mention.title ?? null,
              url:
                typeof mention.url === "string" &&
                /^https?:\/\//i.test(mention.url)
                  ? mention.url
                  : null,
              postDate: mention.postDate?.toISOString() ?? null,
              sentiment: mention.sentiment ?? null,
              isPromotional: mention.isPromotional,
              promotionScore: mention.promotionScore,
              redFlags: parseJsonArray(mention.redFlags),
            })),
          }
        : { status: "NOT_ANALYZED" as const, asOf: null, evidence: [] },
    };
  }

  async function getDashboardPayload(userId: string) {
    if (
      !client.user ||
      !client.scanUsage ||
      !client.watchlistEntry ||
      !client.activeMonitor ||
      !client.dailyScanSummary ||
      !client.stockDailySnapshot ||
      !client.socialScanRun
    ) {
      throw new Error("Dashboard data source is unavailable.");
    }

    const monthKey = getCurrentMonthKey();
    const [user, usage, watchlist, monitors, recentScans, pumpRadar] =
      await Promise.all([
        client.user.findUnique({
          where: { id: userId },
          select: { plan: true },
        }),
        client.scanUsage.findUnique({
          where: { userId_monthKey: { userId, monthKey } },
          select: { scanCount: true },
        }),
        client.watchlistEntry.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            monitors: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
            },
          },
        }),
        client.activeMonitor.findMany({
          where: { status: "ACTIVE", watchlistEntry: { userId } },
          select: { kind: true },
        }),
        getScanHistory(userId, {
          order: "MOST_RECENT",
          page: 1,
          limit: 5,
        }),
        createPumpRadarService(client as never).getPumpRadar({
          limit: 5,
          viewer: "AUTHENTICATED",
        }),
      ]);
    if (!user) throw new Error("User not found.");

    const entitlements = getPlanEntitlements(user.plan);
    const fullUsed = monitors.filter((monitor) => monitor.kind === "FULL").length;
    const priceUsed = monitors.filter(
      (monitor) => monitor.kind === "PRICE",
    ).length;
    const creditsUsed = usage?.scanCount ?? 0;

    return {
      plan: {
        id: entitlements.plan,
        displayName: entitlements.displayName,
      },
      usage: {
        monthKey,
        creditsUsed,
        creditsLimit: entitlements.manualScanCredits,
        creditsRemaining: Math.max(
          entitlements.manualScanCredits - creditsUsed,
          0,
        ),
      },
      monitorSlots: {
        full: {
          used: fullUsed,
          limit: entitlements.fullMonitorSlots,
          remaining: Math.max(entitlements.fullMonitorSlots - fullUsed, 0),
        },
        price: {
          used: priceUsed,
          limit: entitlements.priceMonitorSlots,
          remaining: Math.max(entitlements.priceMonitorSlots - priceUsed, 0),
        },
      },
      watchlist: watchlist.map((entry) => ({
        id: entry.id,
        ticker: entry.ticker,
        addedAt: entry.createdAt.toISOString(),
        lastDataAt: entry.lastDataAt?.toISOString() ?? null,
        monitors: entry.monitors.map((monitor) => ({
          id: monitor.id,
          kind: monitor.kind,
          frequency: monitor.frequency,
          status: monitor.status,
          expiresAt: monitor.expiresAt.toISOString(),
          lastEvaluatedAt: monitor.lastEvaluatedAt?.toISOString() ?? null,
          nextEvaluationAt: monitor.nextEvaluationAt?.toISOString() ?? null,
        })),
      })),
      recentScans: recentScans.items,
      pumpRadar,
      freshness:
        pumpRadar.status === "AVAILABLE"
          ? {
              asOf: pumpRadar.asOf,
              publishedAt: pumpRadar.publishedAt,
              state: pumpRadar.freshness,
              notice: pumpRadar.notice,
            }
          : {
              asOf: null,
              publishedAt: null,
              state: "UNAVAILABLE" as const,
              notice: pumpRadar.notice,
            },
    };
  }

  return { getDashboardPayload, getScanHistory, getScanDetail };
}

const defaultService = createDashboardDataService();
export const getDashboardPayload = defaultService.getDashboardPayload;
export const getScanHistory = defaultService.getScanHistory;
export const getScanDetail = defaultService.getScanDetail;
