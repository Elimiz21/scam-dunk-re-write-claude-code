import { estimateScheduledCredits } from "@/components/dashboard/monitor-form";
import type {
  ApiErrorShape,
  DashboardPayload,
  HistoryOrder,
  MonitorSlots,
  PumpRadarCoverage,
  PumpRadarRow,
  RecentScanDto,
  ScanSocialDto,
  SocialSummary,
  MonitorCreditEstimate,
  WatchlistEntryDto,
} from "@/components/dashboard/types";

export const HISTORY_ORDER_OPTIONS: Array<{
  value: HistoryOrder;
  label: string;
}> = [
  { value: "MOST_RECENT", label: "Most recent" },
  { value: "HIGHEST_RISK", label: "Highest risk" },
  { value: "DATE_ADDED", label: "Date added to watchlist" },
];

export type PumpRadarFilter = "ALL" | "HIGH" | "CAUTION";

export function filterPumpRadarRows(
  rows: PumpRadarRow[],
  filter: PumpRadarFilter,
): PumpRadarRow[] {
  if (filter === "ALL") return rows;
  const riskLabel = filter === "HIGH" ? "High risk" : "Caution";
  return rows.filter((row) => row.riskLabel === riskLabel);
}

export function aggregateSocialSummary(
  rows: PumpRadarRow[],
): Omit<SocialSummary, "maxPromotionScore"> | null {
  const summaries = rows
    .map((row) => row.socialSummary)
    .filter((summary): summary is SocialSummary => summary !== null);
  if (summaries.length === 0) return null;

  const platforms = new Set<string>();
  let mentionCount = 0;
  let promotionalMentions = 0;
  for (const summary of summaries) {
    mentionCount += summary.mentionCount;
    promotionalMentions += summary.promotionalMentions;
    summary.platforms.forEach((platform) => platforms.add(platform));
  }
  return {
    mentionCount,
    promotionalMentions,
    platforms: Array.from(platforms).sort(),
  };
}

export function buildFreshnessView(input: {
  state: "LOADING" | "UNAVAILABLE" | "STALE" | "FRESH";
  asOf: string | null;
  publishedAt: string | null;
  notice?: string;
}) {
  if (input.state === "LOADING") {
    return {
      title: "Loading market publication",
      tone: "loading" as const,
      notice: input.notice || "Retrieving the latest completed end-of-day scan.",
    };
  }
  if (input.state === "UNAVAILABLE") {
    return {
      title: "Market scan unavailable",
      tone: "unavailable" as const,
      notice: input.notice || "No published end-of-day market scan is available.",
    };
  }
  if (input.state === "STALE") {
    return {
      title: "Published scan is stale",
      tone: "stale" as const,
      notice: input.notice || "Checked after the trading day closes — not live.",
    };
  }
  return {
    title: "End-of-day scan published",
    tone: "published" as const,
    notice: input.notice || "Checked after the trading day closes — not live.",
  };
}

export function buildPumpRadarView(input: {
  status: "LOADING" | "AVAILABLE" | "UNAVAILABLE";
  rows: PumpRadarRow[];
  coverage: PumpRadarCoverage | null;
  socialSummary: Omit<SocialSummary, "maxPromotionScore"> | null;
}) {
  const coverageLabel =
    input.coverage?.evaluatedPercent === null || !input.coverage
      ? "Coverage unavailable"
      : `${input.coverage.evaluatedPercent}% coverage`;
  const socialLabel = input.socialSummary
    ? `${input.socialSummary.promotionalMentions} promotional mentions across ${input.socialSummary.platforms.length} platforms`
    : "Social media not analyzed for this publication";

  if (input.status === "LOADING") {
    return { state: "loading" as const, coverageLabel, socialLabel };
  }
  if (input.status === "UNAVAILABLE") {
    return {
      state: "unavailable" as const,
      title: "Pump Radar is temporarily unavailable",
      coverageLabel,
      socialLabel,
    };
  }
  if (input.rows.length === 0) {
    return {
      state: "empty" as const,
      title: "No flagged stocks in this publication",
      coverageLabel,
      socialLabel,
    };
  }
  return {
    state: "ready" as const,
    coverageLabel,
    socialLabel,
    riskLabels: input.rows.map((row) => row.riskLabel),
  };
}

export function buildWatchlistView(
  entries: WatchlistEntryDto[],
  feedback: ApiErrorShape | null,
) {
  if (feedback?.code === "UNSUPPORTED_TICKER") {
    return {
      state: "unsupported" as const,
      feedback: feedback.message,
      feedbackDetail: "No scan credit was used.",
      creditNotice: "Adding or removing a stock never uses a scan credit.",
    };
  }
  if (entries.length === 0) {
    return {
      state: "empty" as const,
      title: "Your watchlist is empty",
      creditNotice: "Adding or removing a stock never uses a scan credit.",
      feedback: feedback?.message ?? null,
    };
  }
  return {
    state: "ready" as const,
    title: `${entries.length} saved ${entries.length === 1 ? "stock" : "stocks"}`,
    creditNotice: "Adding or removing a stock never uses a scan credit.",
    feedback: feedback?.message ?? null,
  };
}

export function buildMonitorView(input: {
  kind: "FULL" | "PRICE";
  frequency: "DAILY" | "WEEKLY";
  durationMonths: number;
  slots: MonitorSlots;
  creditEstimate: MonitorCreditEstimate;
  error?: ApiErrorShape | null;
}) {
  const selected = input.kind === "FULL" ? input.slots.full : input.slots.price;
  const label = input.kind === "FULL" ? "full" : "price";
  return {
    slotLabel: `${selected.used} of ${selected.limit} ${label} slots used`,
    hasAvailableSlot: selected.used < selected.limit,
    estimatedCredits: estimateScheduledCredits(
      input.frequency,
      input.durationMonths,
      input.creditEstimate,
    ),
    error: input.error?.message ?? null,
    notice: "Checked after the trading day closes — not live.",
  };
}

export function buildUsageView(input: Pick<
  DashboardPayload,
  "usage" | "monitorSlots"
>) {
  return {
    quotaLabel:
      input.usage.creditsRemaining === 0
        ? "No scan credits remaining"
        : `${input.usage.creditsRemaining} scan credits remaining`,
    creditsLabel: `${input.usage.creditsUsed} of ${input.usage.creditsLimit} used`,
    fullMonitorLabel: `${input.monitorSlots.full.used} of ${input.monitorSlots.full.limit} full monitors active`,
    priceMonitorLabel: `${input.monitorSlots.price.used} of ${input.monitorSlots.price.limit} price monitors active`,
  };
}

export function buildHistoryView(items: RecentScanDto[]) {
  if (items.length === 0) {
    return {
      state: "empty" as const,
      title: "No scans yet",
      orderOptions: HISTORY_ORDER_OPTIONS,
    };
  }
  return {
    state: "ready" as const,
    title: `${items.length} ${items.length === 1 ? "scan" : "scans"}`,
    orderOptions: HISTORY_ORDER_OPTIONS,
  };
}

export function filterRecentScans(
  items: RecentScanDto[],
  query: string,
): RecentScanDto[] {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return items;
  return items.filter((item) => item.ticker.toUpperCase().includes(normalized));
}

export function buildSocialEvidenceView(social: ScanSocialDto) {
  if (social.status === "NOT_ANALYZED") {
    return {
      state: "not-analyzed" as const,
      title: "Social media not analyzed",
      detail:
        "The source was not provided for this scan, so no social media conclusion is shown.",
      evidenceCount: 0,
    };
  }
  if (social.evidence.length === 0) {
    return {
      state: "empty" as const,
      title: "Social media evidence",
      detail: "Analyzed — no matching promotional evidence found",
      evidenceCount: 0,
    };
  }
  return {
    state: "ready" as const,
    title: "Social media evidence",
    detail: null,
    evidenceCount: social.evidence.length,
  };
}
