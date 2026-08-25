import {
  dashboardResourceReducer,
  initialDashboardResourceState,
} from "@/components/dashboard/dashboard-state";
import {
  aggregateSocialSummary,
  buildFreshnessView,
  buildHistoryView,
  buildMonitorView,
  buildPumpRadarView,
  buildSocialEvidenceView,
  buildUsageView,
  buildWatchlistView,
} from "@/components/dashboard/view-model";
import {
  estimateScheduledCredits,
  validateMonitorDraft,
} from "@/components/dashboard/monitor-form";

const marketNotice = "Checked after the trading day closes — not live.";

describe("dashboard resource state", () => {
  test("moves loading, failure, and successful server payloads through explicit states", () => {
    const loading = dashboardResourceReducer(initialDashboardResourceState, {
      type: "loading",
    });
    expect(loading).toEqual({ status: "loading", data: null, error: null });

    const failed = dashboardResourceReducer(loading, {
      type: "failed",
      error: "Dashboard data is temporarily unavailable.",
    });
    expect(failed).toEqual({
      status: "error",
      data: null,
      error: "Dashboard data is temporarily unavailable.",
    });

    const payload = { plan: { id: "PAID", displayName: "Pro" } };
    const ready = dashboardResourceReducer(failed, {
      type: "loaded",
      data: payload,
    });
    expect(ready).toEqual({ status: "ready", data: payload, error: null });
  });
});

describe("freshness render state", () => {
  test.each([
    ["LOADING", "Loading market publication"],
    ["UNAVAILABLE", "Market scan unavailable"],
    ["STALE", "Published scan is stale"],
    ["FRESH", "End-of-day scan published"],
  ] as const)("maps %s to its visible label", (state, title) => {
    expect(
      buildFreshnessView({
        state,
        asOf: null,
        publishedAt: null,
        notice: marketNotice,
      }).title,
    ).toBe(title);
  });

  test("always preserves the explicit non-live notice", () => {
    expect(
      buildFreshnessView({
        state: "FRESH",
        asOf: "2026-08-25T00:00:00.000Z",
        publishedAt: "2026-08-25T23:00:00.000Z",
        notice: marketNotice,
      }),
    ).toMatchObject({ notice: marketNotice, tone: "published" });
  });
});

describe("Pump Radar render state", () => {
  test("returns loading, unavailable, and empty states without canned tickers", () => {
    const loading = buildPumpRadarView({
      status: "LOADING",
      rows: [],
      coverage: null,
      socialSummary: null,
    });
    const unavailable = buildPumpRadarView({
      status: "UNAVAILABLE",
      rows: [],
      coverage: null,
      socialSummary: null,
    });
    const empty = buildPumpRadarView({
      status: "AVAILABLE",
      rows: [],
      coverage: { total: 0, evaluated: 0, skipped: 0, evaluatedPercent: null },
      socialSummary: null,
    });

    expect(loading.state).toBe("loading");
    expect(unavailable).toMatchObject({
      state: "unavailable",
      title: "Pump Radar is temporarily unavailable",
    });
    expect(empty).toMatchObject({
      state: "empty",
      title: "No flagged stocks in this publication",
    });
    expect(JSON.stringify([loading, unavailable, empty])).not.toMatch(
      /MULN|GME|AMC/,
    );
  });

  test("keeps exact risk labels, coverage, and production social summary", () => {
    const view = buildPumpRadarView({
      status: "AVAILABLE",
      rows: [
        {
          displayTicker: "R•••",
          riskLabel: "High risk",
          score: 84,
          signalCount: 5,
          signalSummary: "Price and volume anomalies",
          lastPrice: 3.17,
          priceChangePct: 18.4,
          volumeRatio: 7.2,
          socialSummary: {
            mentionCount: 6,
            promotionalMentions: 4,
            maxPromotionScore: 92,
            platforms: ["Reddit", "X"],
          },
        },
        {
          displayTicker: "C•••",
          riskLabel: "Caution",
          score: 44,
          signalCount: 2,
          signalSummary: null,
          lastPrice: null,
          priceChangePct: null,
          volumeRatio: null,
          socialSummary: null,
        },
        {
          displayTicker: "L•••",
          riskLabel: "Low risk",
          score: 9,
          signalCount: 0,
          signalSummary: null,
          lastPrice: null,
          priceChangePct: null,
          volumeRatio: null,
          socialSummary: null,
        },
      ],
      coverage: {
        total: 8000,
        evaluated: 7600,
        skipped: 400,
        evaluatedPercent: 95,
      },
      socialSummary: {
        mentionCount: 6,
        promotionalMentions: 4,
        platforms: ["Reddit", "X"],
      },
    });

    expect(view).toMatchObject({
      state: "ready",
      coverageLabel: "95% coverage",
      socialLabel: "4 promotional mentions across 2 platforms",
      riskLabels: ["High risk", "Caution", "Low risk"],
    });
  });

  test("aggregates only social summaries supplied by the server", () => {
    expect(
      aggregateSocialSummary([
        {
          displayTicker: "A•••",
          riskLabel: "High risk",
          score: 80,
          signalCount: 4,
          signalSummary: null,
          lastPrice: null,
          priceChangePct: null,
          volumeRatio: null,
          socialSummary: {
            mentionCount: 3,
            promotionalMentions: 2,
            maxPromotionScore: 80,
            platforms: ["Reddit"],
          },
        },
        {
          displayTicker: "B•••",
          riskLabel: "Caution",
          score: 45,
          signalCount: 2,
          signalSummary: null,
          lastPrice: null,
          priceChangePct: null,
          volumeRatio: null,
          socialSummary: {
            mentionCount: 2,
            promotionalMentions: 1,
            maxPromotionScore: 60,
            platforms: ["Reddit", "X"],
          },
        },
      ]),
    ).toEqual({
      mentionCount: 5,
      promotionalMentions: 3,
      platforms: ["Reddit", "X"],
    });
    expect(aggregateSocialSummary([])).toBeNull();
  });
});

describe("watchlist and monitoring render state", () => {
  test("gives an actionable empty state and never charges watchlist changes", () => {
    expect(buildWatchlistView([], null)).toEqual({
      state: "empty",
      title: "Your watchlist is empty",
      creditNotice:
        "Adding or removing a stock never uses a scan credit.",
      feedback: null,
    });
  });

  test("turns unsupported ticker feedback into an explicit no-charge message", () => {
    expect(
      buildWatchlistView([], {
        code: "UNSUPPORTED_TICKER",
        message: "Only supported US-listed common stocks can be saved.",
      }),
    ).toMatchObject({
      state: "unsupported",
      feedback: "Only supported US-listed common stocks can be saved.",
      feedbackDetail: "No scan credit was used.",
    });
  });

  test("uses server slot values for a visible plan-limit state", () => {
    expect(
      buildMonitorView({
        kind: "FULL",
        frequency: "DAILY",
        durationMonths: 1,
        slots: {
          full: { used: 2, limit: 2 },
          price: { used: 1, limit: 5 },
        },
        error: {
          code: "PLAN_LIMIT",
          message: "Your Pro plan includes 2 active full monitors.",
        },
      }),
    ).toEqual({
      slotLabel: "2 of 2 full slots used",
      hasAvailableSlot: false,
      estimatedCredits: 22,
      error: "Your Pro plan includes 2 active full monitors.",
      notice: marketNotice,
    });
  });

  test("validates 1–24 months and estimates scheduled credits", () => {
    expect(
      validateMonitorDraft({
        kind: "FULL",
        frequency: "DAILY",
        durationMonths: 0,
      }),
    ).toEqual({ ok: false, message: "Choose a duration from 1 to 24 months." });
    expect(
      validateMonitorDraft({
        kind: "PRICE",
        frequency: "WEEKLY",
        durationMonths: 24,
      }),
    ).toEqual({
      ok: true,
      value: { kind: "PRICE", frequency: "WEEKLY", durationMonths: 24 },
    });
    expect(estimateScheduledCredits("DAILY", 1)).toBe(22);
    expect(estimateScheduledCredits("WEEKLY", 1)).toBe(4);
  });
});

describe("quota, history, and social evidence render state", () => {
  test("derives quota copy only from the server-provided usage payload", () => {
    expect(
      buildUsageView({
        usage: {
          monthKey: "2026-08",
          creditsUsed: 5,
          creditsLimit: 5,
          creditsRemaining: 0,
        },
        monitorSlots: {
          full: { used: 0, limit: 0, remaining: 0 },
          price: { used: 1, limit: 1, remaining: 0 },
        },
      }),
    ).toEqual({
      quotaLabel: "No scan credits remaining",
      creditsLabel: "5 of 5 used",
      fullMonitorLabel: "0 of 0 full monitors active",
      priceMonitorLabel: "1 of 1 price monitors active",
    });
  });

  test("exposes the exact order labels and an actionable empty history state", () => {
    expect(buildHistoryView([])).toEqual({
      state: "empty",
      title: "No scans yet",
      orderOptions: [
        { value: "MOST_RECENT", label: "Most recent" },
        { value: "HIGHEST_RISK", label: "Highest risk" },
        { value: "DATE_ADDED", label: "Date added to watchlist" },
      ],
    });
  });

  test("shows not analyzed only when the server says the social source was absent", () => {
    expect(
      buildSocialEvidenceView({
        status: "NOT_ANALYZED",
        asOf: null,
        evidence: [],
      }),
    ).toEqual({
      state: "not-analyzed",
      title: "Social media not analyzed",
      detail:
        "The source was not provided for this scan, so no social media conclusion is shown.",
      evidenceCount: 0,
    });
  });

  test("renders only the supplied production social evidence count", () => {
    expect(
      buildSocialEvidenceView({
        status: "ANALYZED",
        asOf: "2026-08-25T00:00:00.000Z",
        evidence: [
          {
            id: "evidence-1",
            platform: "Reddit",
            title: "Coordinated promotion language detected",
            url: "https://example.com/evidence",
            postDate: "2026-08-24T12:00:00.000Z",
            sentiment: "promotional",
            isPromotional: true,
            promotionScore: 88,
            redFlags: ["Urgency", "Guaranteed returns"],
          },
        ],
      }),
    ).toMatchObject({
      state: "ready",
      title: "Social media evidence",
      evidenceCount: 1,
    });
  });
});
