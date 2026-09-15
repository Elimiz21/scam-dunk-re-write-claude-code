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
}));

jest.mock("@/lib/narrative", () => ({
  generateNarrative: jest.fn(),
}));

jest.mock("@/lib/admin/metrics", () => ({
  logScanHistory: mockLogScanHistory,
}));

jest.mock("@/lib/email", () => ({
  sendAPIFailureAlert: jest.fn(),
}));

import { POST } from "../app/api/check/route";

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
    market.fetchMarketData.mockResolvedValue({ dataAvailable: true, isOTC: false, quote: { companyName: "Apple", marketCap: 100_000_000 } });
    jest.requireMock("@/lib/scoring").computeRiskScore.mockResolvedValue({ riskLevel: "LOW", totalScore: 0, signals: [], isInsufficient: false, isLegitimate: true });
    jest.requireMock("@/lib/narrative").generateNarrative.mockResolvedValue({ disclaimers: [] });
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
});
