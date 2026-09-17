import {
  acceptAIBackendResponse,
  buildAIBackendRequest,
  parseAIBackendResponse,
} from "./ai-backend-schema";

const validResponse = {
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
  stock_info: {
    company_name: null,
    exchange: null,
    last_price: null,
    market_cap: null,
    avg_volume: null,
  },
  news_verification: null,
  input_source: "live",
  layers_applied: ["rule_signals", "anomaly_detection"],
};

describe("Python AI boundary contract", () => {
  it("serializes a missing news flag as false while preserving nullable SEC state", () => {
    expect(
      buildAIBackendRequest({
        ticker: "test",
        assetType: "stock",
        useLiveData: true,
        secFlagged: undefined,
        newsFlag: undefined,
      }),
    ).toEqual({
      ticker: "TEST",
      asset_type: "stock",
      use_live_data: true,
      days: 90,
      sec_flagged: null,
      news_flag: false,
    });
  });

  it("preserves explicit false request values", () => {
    expect(
      buildAIBackendRequest({
        ticker: "TEST",
        assetType: "stock",
        useLiveData: false,
        secFlagged: false,
        newsFlag: false,
      }),
    ).toMatchObject({
      use_live_data: false,
      sec_flagged: false,
      news_flag: false,
    });
  });

  it("accepts Python nulls that are explicitly nullable", () => {
    expect(parseAIBackendResponse(validResponse)).toEqual(validResponse);
  });

  it("accepts omitted optional result objects", () => {
    const { stock_info, news_verification, ...withoutOptionalObjects } =
      validResponse;
    expect(parseAIBackendResponse(withoutOptionalObjects)).toEqual(
      withoutOptionalObjects,
    );
  });

  it.each([
    ["synthetic provenance", { input_source: "synthetic" }],
    ["provided-bar provenance", { input_source: "provided_real_bars" }],
    ["unavailable data", { data_available: false }],
  ])("rejects %s at an interactive boundary", (_name, override) => {
    expect(
      acceptAIBackendResponse(
        { ...validResponse, ...override },
        { expectedSource: "live", requireDataAvailable: true },
      ),
    ).toBeNull();
  });

  it("accepts live available data at an interactive boundary", () => {
    expect(
      acceptAIBackendResponse(validResponse, {
        expectedSource: "live",
        requireDataAvailable: true,
      }),
    ).toEqual(validResponse);
  });

  it.each([
    ["missing data availability", { data_available: undefined }],
    ["missing input provenance", { input_source: undefined }],
    ["unknown input provenance", { input_source: "mystery" }],
    ["missing applied layers", { layers_applied: undefined }],
    ["unknown risk level", { risk_level: "SAFE" }],
    ["out-of-range probability", { risk_probability: 1.01 }],
    [
      "claimed Random Forest without an output",
      {
        rf_probability: null,
        layers_applied: [
          "rule_signals",
          "anomaly_detection",
          "random_forest",
        ],
      },
    ],
    ["malformed signals", { signals: [{ code: "X", weight: null }] }],
  ])("rejects %s", (_name, override) => {
    expect(
      parseAIBackendResponse({ ...validResponse, ...override }),
    ).toBeNull();
  });
});
