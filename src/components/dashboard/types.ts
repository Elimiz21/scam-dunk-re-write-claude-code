export type CustomerRiskLabel = "High risk" | "Caution" | "Low risk";

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

export interface ApiErrorShape {
  code: string;
  message: string;
}

export interface SocialSummary {
  mentionCount: number;
  promotionalMentions: number;
  maxPromotionScore?: number;
  platforms: string[];
}

export interface PumpRadarCoverage {
  total: number;
  evaluated: number;
  skipped: number;
  evaluatedPercent: number | null;
}

export interface PumpRadarRow {
  displayTicker: string;
  ticker?: string;
  companyName?: string;
  riskLabel: CustomerRiskLabel;
  score: number;
  signalCount: number;
  signalSummary: string | null;
  lastPrice: number | null;
  priceChangePct: number | null;
  volumeRatio: number | null;
  socialSummary: SocialSummary | null;
}

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
      freshness: "FRESH" | "STALE";
      coverage: PumpRadarCoverage;
      rows: PumpRadarRow[];
      notice: string;
    };

export interface MonitorDto {
  id: string;
  kind: "FULL" | "PRICE";
  frequency: "DAILY" | "WEEKLY";
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED" | string;
  startsAt?: string;
  expiresAt: string;
  lastEvaluatedAt: string | null;
  nextEvaluationAt: string | null;
}

export interface WatchlistEntryDto {
  id: string;
  ticker: string;
  addedAt: string;
  lastDataAt: string | null;
  monitors: MonitorDto[];
}

export interface WatchlistPayload {
  entries: WatchlistEntryDto[];
  savedWatchlistLimit: number | null;
}

export interface SlotUsage {
  used: number;
  limit: number;
  remaining?: number;
}

export interface MonitorSlots {
  full: SlotUsage;
  price: SlotUsage;
}

export interface MonitorCreditEstimate {
  dailyPerMonth: number;
  weeklyPerMonth: number;
}

export interface MonitorListPayload {
  monitors: Array<MonitorDto & { watchlistEntry?: { ticker: string } }>;
  slots: MonitorSlots;
  creditEstimate: MonitorCreditEstimate;
  notice: string;
}

export type HistoryOrder =
  | "MOST_RECENT"
  | "HIGHEST_RISK"
  | "DATE_ADDED";

export interface RecentScanDto {
  id: string;
  ticker: string;
  source: "MANUAL" | "AUTOMATIC_FULL" | "AUTOMATIC_PRICE";
  riskLabel: CustomerRiskLabel;
  score: number;
  signalCount: number;
  scannedAt: string;
  watchlistAddedAt: string | null;
  socialEvidenceAvailable: boolean;
}

export interface HistoryPayload {
  order: HistoryOrder;
  items: RecentScanDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface DashboardPayload {
  plan: { id: "FREE" | "PAID" | "PRO_MAX"; displayName: string };
  usage: {
    monthKey: string;
    creditsUsed: number;
    creditsLimit: number;
    creditsRemaining: number;
  };
  monitorSlots: {
    full: Required<SlotUsage>;
    price: Required<SlotUsage>;
  };
  watchlist: WatchlistEntryDto[];
  recentScans: RecentScanDto[];
  pumpRadar: PumpRadarPayload;
  freshness: {
    asOf: string | null;
    publishedAt: string | null;
    state: "FRESH" | "STALE" | "UNAVAILABLE";
    notice: string;
  };
}

export interface SocialEvidenceItem {
  id: string;
  platform: string;
  title: string | null;
  url: string | null;
  postDate: string | null;
  sentiment: string | null;
  isPromotional: boolean;
  promotionScore: number;
  redFlags: unknown[];
}

export type ScanSocialDto =
  | { status: "NOT_ANALYZED"; asOf: null; evidence: [] }
  | {
      status: "ANALYZED";
      asOf: string;
      evidence: SocialEvidenceItem[];
    };

export interface ScanDetailDto {
  id: string;
  ticker: string;
  source: "MANUAL" | "AUTOMATIC_FULL" | "AUTOMATIC_PRICE";
  riskLabel: CustomerRiskLabel;
  score: number;
  signalCount: number;
  scannedAt: string;
  isLegitimate: boolean | null;
  evidenceProvided: { pitch: boolean; context: boolean; social: boolean };
  market: {
    companyName: string | null;
    exchange: string | null;
    asOf: string | null;
    evaluatedAt: string | null;
    lastPrice: number | null;
    previousClose: number | null;
    priceChangePct: number | null;
    volume: number | null;
    avgVolume: number | null;
    volumeRatio: number | null;
    marketCap: number | null;
    signalSummary: string | null;
    signals: unknown[];
  } | null;
  social: ScanSocialDto;
}

export function readApiError(
  value: unknown,
  fallback: string,
): ApiErrorShape {
  if (typeof value !== "object" || value === null) {
    return { code: "UNKNOWN", message: fallback };
  }
  const error = "error" in value ? value.error : value;
  if (typeof error !== "object" || error === null) {
    return { code: "UNKNOWN", message: fallback };
  }
  const code = "code" in error && typeof error.code === "string"
    ? error.code
    : "UNKNOWN";
  const message = "message" in error && typeof error.message === "string"
    ? error.message
    : fallback;
  return { code, message };
}
