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
