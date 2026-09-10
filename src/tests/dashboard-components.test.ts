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
  filterPumpRadarRows,
  filterRecentScans,
  buildUnifiedMarketRows,
  filterUnifiedMarketRows,
  sortUnifiedMarketRows,
} from "@/components/dashboard/view-model";
import {
  estimateScheduledCredits,
  getInitialMonitorDraft,
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

  test("filters the full Pump Radar view by the approved risk labels", () => {
    const rows = [
      { displayTicker: "AAPL", riskLabel: "High risk" as const },
      { displayTicker: "NVAX", riskLabel: "Caution" as const },
      { displayTicker: "MSFT", riskLabel: "Low risk" as const },
    ] as Parameters<typeof filterPumpRadarRows>[0];

    expect(filterPumpRadarRows(rows, "HIGH")).toEqual([rows[0]]);
    expect(filterPumpRadarRows(rows, "CAUTION")).toEqual([rows[1]]);
    expect(filterPumpRadarRows(rows, "ALL")).toEqual(rows);
  });
});

describe("Alon's unified market table", () => {
  const watching = {
    id: "watch-nvax",
    ticker: "NVAX",
    addedAt: "2026-09-01T12:00:00.000Z",
    lastDataAt: "2026-09-08T12:00:00.000Z",
    lastScanAt: "2026-09-08T12:00:00.000Z",
    monitors: [],
  };
  const radarRows = [
    {
      displayTicker: "NVAX",
      ticker: "NVAX",
      companyName: "Novavax Inc.",
      riskLabel: "Caution" as const,
      score: 46,
      signalCount: 2,
      signalSummary: "Price and volume anomalies",
      lastPrice: 8.15,
      priceChangePct: -2.4,
      volumeRatio: 1.8,
      socialSummary: null,
    },
    {
      displayTicker: "M••T",
      ticker: "MULN",
      companyName: "Hidden company",
      riskLabel: "High risk" as const,
      score: 84,
      signalCount: 5,
      signalSummary: "Sudden options activity spike",
      lastPrice: 4.61,
      priceChangePct: 11.1,
      volumeRatio: 7.2,
      socialSummary: null,
    },
  ];

  test("merges watching and radar data without duplicating a tracked ticker", () => {
    const rows = buildUnifiedMarketRows({
      watchlist: [watching],
      recentScans: [],
      pumpRadarRows: radarRows,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "watch-nvax",
      ticker: "NVAX",
      displayTicker: "NVAX",
      companyName: "Novavax Inc.",
      source: "WATCHING",
      tracked: true,
      priceChangePct: -2.4,
      lastPrice: 8.15,
      pumpScore: 46,
    });
    expect(rows[1]).toMatchObject({
      ticker: "MULN",
      displayTicker: "M••T",
      source: "RADAR",
      tracked: false,
      pumpScore: 84,
    });
  });

  test("filters the unified table by watching, radar, and high risk", () => {
    const rows = buildUnifiedMarketRows({
      watchlist: [watching],
      recentScans: [],
      pumpRadarRows: radarRows,
    });

    expect(filterUnifiedMarketRows(rows, "WATCHING").map((row) => row.ticker)).toEqual(["NVAX"]);
    expect(filterUnifiedMarketRows(rows, "RADAR").map((row) => row.ticker)).toEqual(["MULN"]);
    expect(filterUnifiedMarketRows(rows, "HIGH").map((row) => row.ticker)).toEqual(["MULN"]);
  });

  test("sorts numeric columns while leaving unavailable values last", () => {
    const rows = buildUnifiedMarketRows({
      watchlist: [watching],
      recentScans: [],
      pumpRadarRows: [
        ...radarRows,
        {
          ...radarRows[1],
          displayTicker: "N••X",
          ticker: "NNOX",
          lastPrice: null,
          priceChangePct: null,
          score: 42,
        },
      ],
    });

    expect(sortUnifiedMarketRows(rows, "PRICE", "ASC").map((row) => row.ticker)).toEqual([
      "MULN",
      "NVAX",
      "NNOX",
    ]);
    expect(sortUnifiedMarketRows(rows, "PUMP_SCORE", "DESC").map((row) => row.ticker)).toEqual([
      "MULN",
      "NVAX",
      "NNOX",
    ]);
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
        creditEstimate: { dailyPerMonth: 22, weeklyPerMonth: 4 },
        error: {
          code: "PLAN_LIMIT",
          message: "Your Pro plan includes 2 active full monitors.",
        },
      }),
    ).toEqual({
      slotLabel: "2 of 2 monitoring slots used",
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
        kind: "FULL",
        frequency: "WEEKLY",
        durationMonths: 24,
      }),
    ).toEqual({
      ok: true,
      value: { kind: "FULL", frequency: "WEEKLY", durationMonths: 24 },
    });
    const creditEstimate = { dailyPerMonth: 22, weeklyPerMonth: 4 };
    expect(estimateScheduledCredits("DAILY", 1, creditEstimate)).toBe(22);
    expect(estimateScheduledCredits("WEEKLY", 1, creditEstimate)).toBe(4);
  });

  test("normalizes a legacy price monitor into the single monitoring editor", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    const monitors = [
      {
        kind: "FULL" as const,
        frequency: "DAILY" as const,
        status: "ACTIVE",
        expiresAt: "2026-10-08T12:00:00.000Z",
      },
      {
        kind: "PRICE" as const,
        frequency: "WEEKLY" as const,
        status: "ACTIVE",
        expiresAt: "2027-03-08T12:00:00.000Z",
      },
    ];

    expect(getInitialMonitorDraft(monitors.slice(1), "PRICE", now)).toEqual({
      kind: "FULL",
      frequency: "WEEKLY",
      durationMonths: 6,
    });
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
      fullMonitorLabel: "0 of 0 monitors active",
      priceMonitorLabel: null,
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

  test("filters recent scans by ticker like Alon's prototype", () => {
    const scans = [
      { id: "one", ticker: "AAPL" },
      { id: "two", ticker: "NVAX" },
    ] as Parameters<typeof filterRecentScans>[0];

    expect(filterRecentScans(scans, " nv ")).toEqual([scans[1]]);
    expect(filterRecentScans(scans, "   ")).toEqual(scans);
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
