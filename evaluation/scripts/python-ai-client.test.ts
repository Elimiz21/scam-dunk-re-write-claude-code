/// <reference types="jest" />

import {
  acceptedLayerLabels,
  buildProductionEvaluationRequest,
  preflightPythonAIBackend,
  requestPythonAnalysis,
} from "./python-ai-client";

const bars = Array.from({ length: 40 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10),
  open: 10 + index,
  high: 11 + index,
  low: 9 + index,
  close: 10.5 + index,
  volume: index === 0 ? 0 : 1_000 + index,
}));

const marketData = {
  quote: {
    ticker: "TEST",
    companyName: "Test Corp",
    exchange: "NASDAQ",
    lastPrice: 0,
    marketCap: 0,
    avgVolume30d: 0,
    avgDollarVolume30d: 0,
  },
  priceHistory: bars,
  isOTC: false,
  dataAvailable: true,
};

const validAnalysis = {
  ticker: "TEST",
  asset_type: "stock",
  risk_level: "LOW",
  risk_score: 0,
  risk_probability: 0,
  rf_probability: null,
  lstm_probability: null,
  anomaly_score: 0,
  signals: [],
  features: {},
  explanations: [],
  sec_flagged: false,
  is_otc: false,
  is_micro_cap: false,
  data_available: true,
  analysis_timestamp: "2026-09-16T00:00:00Z",
  stock_info: null,
  news_verification: null,
  input_source: "provided_real_bars",
  layers_applied: ["rule_signals", "anomaly_detection"] as Array<
    "rule_signals" | "anomaly_detection" | "random_forest" | "lstm"
  >,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("daily Python evaluation client", () => {
  it("sends the exact real bars used by daily scoring and preserves numeric zero", () => {
    const first = buildProductionEvaluationRequest("TEST", marketData, false);
    const second = buildProductionEvaluationRequest("TEST", marketData, false);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ticker: "TEST",
      analysis_mode: "production_evaluation",
      use_live_data: false,
      news_flag: false,
      historical_bars: bars,
      fundamentals: {
        company_name: "Test Corp",
        exchange: "NASDAQ",
        current_price: 0,
        market_cap: 0,
        avg_daily_volume: 0,
        is_otc: false,
        on_watchlist: false,
      },
    });
  });

  it("stops at authenticated preflight after a bad credential", async () => {
    const fetchImpl = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: "healthy",
          ready: true,
          scoring_mode: "rules_only",
          rf_ready: false,
          lstm_ready: false,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(401, { detail: "bad key" }));

    const preflight = await preflightPythonAIBackend({
      baseUrl: "https://engine.example",
      apiSecret: "wrong",
      fetchImpl,
    });

    expect(preflight).toEqual(
      expect.objectContaining({ available: false, failure: "authentication" }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://engine.example/auth-check",
    );
  });

  it("does not make any request when the shared secret is missing", async () => {
    const fetchImpl = jest.fn();
    const preflight = await preflightPythonAIBackend({
      baseUrl: "https://engine.example",
      apiSecret: "",
      fetchImpl,
    });
    expect(preflight).toEqual(
      expect.objectContaining({ available: false, failure: "configuration" }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects malformed and synthetic responses from production evaluation", async () => {
    const malformedFetch = jest.fn().mockResolvedValue(
      jsonResponse(200, { ...validAnalysis, risk_level: "SAFE" }),
    );
    const syntheticFetch = jest.fn().mockResolvedValue(
      jsonResponse(200, { ...validAnalysis, input_source: "synthetic" }),
    );

    await expect(
      requestPythonAnalysis({
        baseUrl: "https://engine.example",
        apiSecret: "secret",
        request: buildProductionEvaluationRequest("TEST", marketData, false),
        fetchImpl: malformedFetch,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ accepted: false, failure: "malformed_response" }),
    );
    await expect(
      requestPythonAnalysis({
        baseUrl: "https://engine.example",
        apiSecret: "secret",
        request: buildProductionEvaluationRequest("TEST", marketData, false),
        fetchImpl: syntheticFetch,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ accepted: false, failure: "wrong_input_source" }),
    );
  });

  it("labels only layers present in an accepted result", () => {
    expect(acceptedLayerLabels(validAnalysis)).toEqual([
      "Python rule signals",
      "Statistical anomaly detection",
    ]);
    expect(
      acceptedLayerLabels({
        ...validAnalysis,
        rf_probability: 0.42,
        layers_applied: [
          "rule_signals",
          "anomaly_detection",
          "random_forest",
        ],
      }),
    ).toEqual([
      "Python rule signals",
      "Statistical anomaly detection",
      "Random Forest",
    ]);
  });
});
