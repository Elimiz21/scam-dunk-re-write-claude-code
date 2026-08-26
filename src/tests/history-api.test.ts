import { NextRequest } from "next/server";

const mockAuth = jest.fn();
const mockPrisma = {
  scanHistory: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  watchlistEntry: { findMany: jest.fn() },
  trackedStock: { findUnique: jest.fn() },
  stockDailySnapshot: { findFirst: jest.fn() },
  socialScanRun: { findFirst: jest.fn() },
  socialMention: { findMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ auth: mockAuth }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { GET as getHistory } from "@/app/api/scans/history/route";
import { GET as getScanDetail } from "@/app/api/scans/[id]/route";
import { createDashboardDataService } from "@/lib/dashboard-data";

describe("scan history API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(null);
  });

  test("rejects unauthenticated history access", async () => {
    const response = await getHistory(
      new NextRequest("http://localhost/api/scans/history"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      },
    });
  });

  test("rejects an order value outside the exact whitelist before querying", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const response = await getHistory(
      new NextRequest(
        "http://localhost/api/scans/history?order=createdAt%20desc%3BDELETE",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_ORDER",
        message:
          "Order must be MOST_RECENT, HIGHEST_RISK, or DATE_ADDED.",
      },
    });
    expect(mockPrisma.scanHistory.findMany).not.toHaveBeenCalled();
  });

  test("uses explicit risk and watchlist-date ordering rather than a dynamic database sort", async () => {
    const scans = [
      {
        id: "scan-low-new",
        ticker: "LOW",
        assetType: "stock",
        riskLevel: "LOW",
        totalScore: 10,
        signalsCount: 0,
        createdAt: new Date("2026-08-25T18:00:00.000Z"),
      },
      {
        id: "scan-high-old",
        ticker: "HIGH",
        assetType: "stock",
        riskLevel: "HIGH",
        totalScore: 90,
        signalsCount: 4,
        createdAt: new Date("2026-08-24T18:00:00.000Z"),
      },
      {
        id: "scan-caution",
        ticker: "MID",
        assetType: "stock",
        riskLevel: "INSUFFICIENT",
        totalScore: 40,
        signalsCount: 1,
        createdAt: new Date("2026-08-23T18:00:00.000Z"),
      },
    ];
    const client = {
      scanHistory: {
        findMany: jest.fn().mockResolvedValue(scans),
        count: jest.fn().mockResolvedValue(3),
      },
      watchlistEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            ticker: "LOW",
            createdAt: new Date("2026-08-20T00:00:00.000Z"),
          },
          {
            ticker: "HIGH",
            createdAt: new Date("2026-08-22T00:00:00.000Z"),
          },
        ]),
      },
      socialMention: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createDashboardDataService(client as never);

    const byRisk = await service.getScanHistory("user-1", {
      order: "HIGHEST_RISK",
      page: 1,
      limit: 20,
    });
    const byDateAdded = await service.getScanHistory("user-1", {
      order: "DATE_ADDED",
      page: 1,
      limit: 20,
    });

    expect(byRisk.items.map((scan) => scan.id)).toEqual([
      "scan-high-old",
      "scan-caution",
      "scan-low-new",
    ]);
    expect(byRisk.items.map((scan) => scan.riskLabel)).toEqual([
      "High risk",
      "Caution",
      "Low risk",
    ]);
    expect(byDateAdded.items.map((scan) => scan.id)).toEqual([
      "scan-high-old",
      "scan-low-new",
      "scan-caution",
    ]);
    for (const call of client.scanHistory.findMany.mock.calls) {
      expect(call[0]).not.toHaveProperty("orderBy.riskLevel");
      expect(call[0]).not.toHaveProperty("orderBy.createdAt", "desc;DELETE");
    }
  });

  test("marks social evidence only when a completed social run covers the scan publication", async () => {
    const client = {
      scanHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "scan-covered",
            ticker: "AAPL",
            assetType: "monitor-full",
            riskLevel: "HIGH",
            totalScore: 90,
            signalsCount: 4,
            createdAt: new Date("2026-08-25T00:00:00.000Z"),
          },
          {
            id: "scan-wrong-day",
            ticker: "MSFT",
            assetType: "monitor-price",
            riskLevel: "LOW",
            totalScore: 8,
            signalsCount: 0,
            createdAt: new Date("2026-08-25T00:00:00.000Z"),
          },
        ]),
      },
      socialMention: {
        findMany: jest.fn().mockResolvedValue([
          {
            ticker: "AAPL",
            scanRun: { scanDate: new Date("2026-08-25T04:00:00.000Z") },
          },
          {
            ticker: "MSFT",
            scanRun: { scanDate: new Date("2026-08-26T04:00:00.000Z") },
          },
        ]),
      },
    };
    const service = createDashboardDataService(client as never);

    const payload = await service.getScanHistory("user-1", {
      order: "MOST_RECENT",
      page: 1,
      limit: 20,
    });

    expect(payload.items.map((scan) => [scan.id, scan.socialEvidenceAvailable])).toEqual([
      ["scan-covered", true],
      ["scan-wrong-day", false],
    ]);
    expect(client.socialMention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scanRun: expect.objectContaining({ status: "COMPLETED" }),
        }),
      }),
    );
  });

  test("pins automatic scan detail to its charged publication rather than a later snapshot", async () => {
    const client = {
      scanHistory: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: "scan-auto-1",
          ticker: "AAPL",
          assetType: "monitor-full",
          riskLevel: "HIGH",
          totalScore: 90,
          signalsCount: 4,
          isLegitimate: false,
          pitchProvided: false,
          contextProvided: false,
          createdAt: new Date("2026-08-25T00:00:00.000Z"),
        }),
      },
      trackedStock: {
        findUnique: jest.fn().mockResolvedValue({
          id: "stock-aapl",
          symbol: "AAPL",
          name: "Apple Inc.",
          exchange: "NASDAQ",
        }),
      },
      stockDailySnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      socialScanRun: { findFirst: jest.fn().mockResolvedValue(null) },
      socialMention: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createDashboardDataService(client as never);

    await service.getScanDetail("user-1", "scan-auto-1");

    expect(client.stockDailySnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stockId: "stock-aapl",
          scanDate: new Date("2026-08-25T00:00:00.000Z"),
        }),
      }),
    );
  });

  test("does not expose another user's scan detail", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.scanHistory.findFirst.mockResolvedValue(null);

    const response = await getScanDetail(
      new NextRequest("http://localhost/api/scans/scan-other"),
      { params: { id: "scan-other" } },
    );

    expect(response.status).toBe(404);
    expect(mockPrisma.scanHistory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "scan-other", userId: "user-1" },
      }),
    );
  });
});
