import { NextRequest } from "next/server";

const mockReserveScanSlot = jest.fn();
const mockLogScanHistory = jest.fn();

jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

jest.mock("@/lib/mobile-auth", () => ({
  authenticateMobileRequest: jest.fn(),
}));

jest.mock("@/lib/usage", () => ({
  reserveScanSlot: mockReserveScanSlot,
  refundScanSlot: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  rateLimit: jest.fn().mockResolvedValue({ success: true, headers: {} }),
  rateLimitExceededResponse: jest.fn(),
}));

jest.mock("@/lib/marketData", () => ({
  checkAlertList: jest.fn(),
  fetchMarketData: jest.fn(),
  runAnomalyDetection: jest.fn(),
}));

jest.mock("@/lib/scoring", () => ({
  computeRiskScore: jest.fn(),
  computeIsLegitimate: jest.fn().mockReturnValue(false),
}));

jest.mock("@/lib/narrative", () => ({
  generateNarrative: jest.fn(),
  generateFallbackNarrative: jest.fn(),
}));

jest.mock("@/lib/admin/metrics", () => ({
  logScanHistory: mockLogScanHistory,
}));

jest.mock("@/lib/email", () => ({
  sendAPIFailureAlert: jest.fn(),
}));

import { POST } from "../app/api/check/route";
import { runAuthorizedStockScan } from "@/lib/check-scan";

describe("POST /api/check request eligibility", () => {
  beforeEach(() => {
    mockReserveScanSlot.mockClear();
    mockLogScanHistory.mockClear();
  });

  test.each([
    [{ ticker: "BTC", assetType: "crypto" }],
    [{ ticker: "SPY", assetType: "stock" }],
    [{ ticker: "AAPL 20270115C00150000", assetType: "stock" }],
    [{ ticker: "VOD.L", assetType: "stock" }],
    [{ ticker: "ABC.V", assetType: "stock" }],
    [{ ticker: "AAPL!", assetType: "stock" }],
    [{ ticker: "", assetType: "stock" }],
  ])("rejects unsupported input before reserving a scan credit: %o", async (body) => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockReserveScanSlot).not.toHaveBeenCalled();
    expect(mockLogScanHistory).not.toHaveBeenCalled();
  });
});

describe("completed scan persistence", () => {
  const originalFetch = global.fetch;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    mockReserveScanSlot.mockResolvedValue({ reserved: true, usage: { scansUsedThisMonth: 1, scansLimitThisMonth: 10 } });
    const market = jest.requireMock("@/lib/marketData");
    market.checkAlertList.mockResolvedValue(false);
    market.fetchMarketData.mockResolvedValue({ dataAvailable: true, isOTC: false, priceHistory: [], quote: { companyName: "Apple", marketCap: 100_000_000 } });
    jest.requireMock("@/lib/scoring").computeRiskScore.mockResolvedValue({ riskLevel: "LOW", totalScore: 0, signals: [], isInsufficient: false, isLegitimate: true });
    jest.requireMock("@/lib/narrative").generateNarrative.mockResolvedValue({ disclaimers: [] });
    jest.requireMock("@/lib/narrative").generateFallbackNarrative.mockReturnValue({ header: "Immediate verdict", disclaimers: [] });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function scanRequest() {
    return new NextRequest("http://localhost/api/check", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: "AAPL" }),
    });
  }

  test("does not finish the response while customer history is still being saved", async () => {
    let finishSave: () => void;
    let enteredSave: () => void;
    const savingStarted = new Promise<void>((resolve) => { enteredSave = resolve; });
    const saving = new Promise<void>((resolve) => { finishSave = resolve; });
    mockLogScanHistory.mockImplementationOnce(() => { enteredSave(); return saving; });
    let returned = false;
    const responsePromise = POST(scanRequest()).then((response) => { returned = true; return response; });
    await savingStarted;
    await new Promise((resolve) => setImmediate(resolve));
    const returnedBeforeSave = returned;
    finishSave();
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(returnedBeforeSave).toBe(false);
  });

  test("keeps a completed analysis available if the history logger rejects", async () => {
    mockLogScanHistory.mockRejectedValueOnce(new Error("History unavailable"));
    const response = await POST(scanRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ riskLevel: "LOW", stockSummary: { ticker: "AAPL" } });
  });

  test("uses immediate narrative for a messaging scan without calling the LLM", async () => {
    mockLogScanHistory.mockResolvedValueOnce(undefined);
    const result = await runAuthorizedStockScan({ userId: "user-1", ticker: "AAPL", assetType: "stock" });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.body.narrative.header).toBe("Immediate verdict");
    expect(jest.requireMock("@/lib/narrative").generateFallbackNarrative).toHaveBeenCalled();
    expect(jest.requireMock("@/lib/narrative").generateNarrative).not.toHaveBeenCalled();
  });

  test("recalculates a large-cap ticker-only customer result and preserves excluded evidence", async () => {
    const market = jest.requireMock("@/lib/marketData");
    market.fetchMarketData.mockResolvedValueOnce({ dataAvailable: true, isOTC: false, priceHistory: [], quote: { ticker: "AAPL", companyName: "Apple", exchange: "NASDAQ", marketCap: 20_000_000_000, avgDollarVolume30d: 30_000_000 } });
    jest.requireMock("@/lib/scoring").computeRiskScore.mockResolvedValueOnce({ riskLevel: "MEDIUM", totalScore: 2, signals: [{ code: "PRICE_ANOMALY", category: "PATTERN", weight: 2, description: "Moderate price anomaly" }], isInsufficient: false, isLegitimate: false, dataCompleteness: "full" });
    mockLogScanHistory.mockResolvedValueOnce(undefined);
    const response = await POST(scanRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ riskLevel: "LOW", totalScore: 0, signals: [], excludedMarketSignals: [{ code: "PRICE_ANOMALY" }], narrative: { header: expect.stringContaining("above the nightly") } });
    expect(mockLogScanHistory).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: "LOW", totalScore: 0 }));
  });

  test("rejects a synthetic AI result and falls back to deterministic scoring", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        risk_level: "HIGH",
        risk_score: 90,
        risk_probability: 0.9,
        signals: [],
        data_available: true,
        anomaly_score: 0.9,
        input_source: "synthetic",
        layers_applied: ["rule_signals"],
      }),
    });
    mockLogScanHistory.mockResolvedValueOnce(undefined);

    const response = await POST(scanRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      riskLevel: "LOW",
      stockSummary: { ticker: "AAPL" },
    });
    expect(jest.requireMock("@/lib/scoring").computeRiskScore).toHaveBeenCalled();
  });
});
