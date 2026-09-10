import { NextRequest } from "next/server";

const mockAuth = jest.fn();
const mockGetLatestPublishedPublicationKey = jest.fn();
const mockRunEligibleMonitorPublication = jest.fn();
const mockPrisma = {
  user: { findUnique: jest.fn() },
  scanUsage: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  trackedStock: { findUnique: jest.fn() },
  dailyScanSummary: { findFirst: jest.fn() },
  stockDailySnapshot: { findMany: jest.fn(), findFirst: jest.fn() },
  socialScanRun: { findFirst: jest.fn() },
  socialMention: { findMany: jest.fn() },
  watchlistEntry: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  activeMonitor: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  scanHistory: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ auth: mockAuth }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/monitoring/runner", () => ({
  getLatestPublishedPublicationKey: mockGetLatestPublishedPublicationKey,
  runEligibleMonitorPublication: mockRunEligibleMonitorPublication,
}));

import { GET as getDashboard } from "@/app/api/dashboard/route";
import {
  DELETE as deleteWatchlist,
  GET as getWatchlist,
  POST as postWatchlist,
} from "@/app/api/watchlist/route";
import {
  GET as getMonitors,
  POST as postMonitor,
} from "@/app/api/monitors/route";
import { GET as runMonitoringCron } from "@/app/api/cron/monitoring/route";
import { createPumpRadarService } from "@/lib/pump-radar";

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("dashboard API authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(null);
  });

  test.each([
    ["dashboard", () => getDashboard()],
    [
      "watchlist",
      () => getWatchlist(new NextRequest("http://localhost/api/watchlist")),
    ],
    [
      "monitors",
      () => getMonitors(new NextRequest("http://localhost/api/monitors")),
    ],
  ])("rejects unauthenticated %s access with a structured error", async (_name, call) => {
    const response = await call();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      },
    });
  });
});

describe("public Pump Radar privacy", () => {
  test("returns only US common stocks and never exposes identifying narrative or private social content publicly", async () => {
    const client = {
      dailyScanSummary: {
        findFirst: jest.fn().mockResolvedValue({
          scanDate: new Date("2026-08-25T00:00:00.000Z"),
          createdAt: new Date("2026-08-25T22:15:00.000Z"),
          totalStocks: 5000,
          evaluated: 4920,
          skippedNoData: 80,
        }),
      },
      stockDailySnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            riskLevel: "HIGH",
            totalScore: 99,
            signalCount: 4,
            signalSummary: "Acme Mining Ltd. (ACME.AX) had unusual activity",
            lastPrice: 12.5,
            priceChangePct: 18.2,
            volumeRatio: 6.1,
            stock: {
              symbol: "ACME.AX",
              name: "Acme Mining Ltd.",
              exchange: "ASX",
              isOTC: false,
            },
          },
          {
            riskLevel: "MEDIUM",
            totalScore: 51,
            signalCount: 2,
            signalSummary: "Apple Inc. (AAPL) price and volume activity",
            lastPrice: 40,
            priceChangePct: -1,
            volumeRatio: 1.2,
            stock: {
              symbol: "AAPL",
              name: "Apple Inc.",
              exchange: "NASDAQ",
              isOTC: false,
            },
          },
          {
            riskLevel: "HIGH",
            totalScore: 90,
            signalCount: 3,
            signalSummary: "Spdr ETF (SPY) activity",
            lastPrice: 600,
            priceChangePct: 1,
            volumeRatio: 1.2,
            stock: {
              symbol: "SPY",
              name: "SPDR S&P 500 ETF Trust",
              exchange: "NYSE",
              isOTC: false,
            },
          },
        ]),
      },
      socialScanRun: {
        findFirst: jest.fn().mockResolvedValue({ id: "social-run-1" }),
      },
      socialMention: {
        findMany: jest.fn().mockResolvedValue([
          {
            ticker: "AAPL",
            platform: "Discord",
            isPromotional: true,
            promotionScore: 88,
            content: "private copied message",
            author: "private-user",
            source: "private-room",
            url: "https://private.example/message",
          },
          {
            ticker: "AAPL",
            platform: "Apple Inc. AAPL private room",
            isPromotional: false,
            promotionScore: 0,
          },
        ]),
      },
    };
    const service = createPumpRadarService(client as never);

    const payload = await service.getPumpRadar({
      limit: 10,
      viewer: "PUBLIC",
      now: new Date("2026-08-26T01:00:00.000Z"),
    });
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      status: "AVAILABLE",
      asOf: "2026-08-25T00:00:00.000Z",
      publishedAt: "2026-08-25T22:15:00.000Z",
      freshness: "FRESH",
      coverage: { total: 5000, evaluated: 4920, skipped: 80 },
    });
    expect(payload.rows).toEqual([
      expect.objectContaining({
        displayTicker: "A•••",
        riskLabel: "Caution",
        socialSummary: {
          mentionCount: 2,
          promotionalMentions: 1,
          maxPromotionScore: 88,
          platforms: ["Discord"],
        },
      }),
    ]);
    expect(serialized).not.toContain("AAPL");
    expect(serialized).not.toContain("ACME.AX");
    expect(serialized).not.toContain("Apple Inc.");
    expect(serialized).not.toContain("Acme Mining Ltd.");
    expect(serialized).not.toContain("SPDR S&P 500 ETF Trust");
    expect(serialized).not.toContain("price and volume activity");
    expect(serialized).not.toContain("Apple Inc. AAPL private room");
    expect(serialized).not.toContain("private copied message");
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("private-room");
    expect(serialized).not.toContain("private.example");
  });
});

describe("watchlist mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.$transaction.mockImplementation(
      async (callback: (client: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
  });

  test("supports a lightweight sidebar count without loading scan history", async () => {
    mockPrisma.watchlistEntry.count.mockResolvedValue(4);

    const response = await getWatchlist(
      new NextRequest("http://localhost/api/watchlist?countOnly=1"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ watchlistCount: 4 });
    expect(mockPrisma.watchlistEntry.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.scanHistory.findMany).not.toHaveBeenCalled();
  });

  test("rejects an unsupported ticker before any write or credit charge", async () => {
    const response = await postWatchlist(
      jsonRequest("http://localhost/api/watchlist", "POST", {
        ticker: "BTC-USD",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "UNSUPPORTED_TICKER",
        message: "Only supported US-listed common stocks can be saved.",
      },
    });
    expect(mockPrisma.trackedStock.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.watchlistEntry.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.scanUsage.upsert).not.toHaveBeenCalled();
  });

  test("adds and removes an authoritative US common stock without charging credits", async () => {
    mockPrisma.trackedStock.findUnique.mockResolvedValue({
      symbol: "AAPL",
      name: "Apple Inc. Common Stock",
      exchange: "NASDAQ",
      isOTC: false,
    });
    mockPrisma.watchlistEntry.upsert.mockResolvedValue({
      id: "watch-1",
      userId: "user-1",
      ticker: "AAPL",
      createdAt: new Date("2026-08-25T00:00:00.000Z"),
      updatedAt: new Date("2026-08-25T00:00:00.000Z"),
      lastDataAt: null,
    });
    mockPrisma.watchlistEntry.deleteMany.mockResolvedValue({ count: 1 });

    const addResponse = await postWatchlist(
      jsonRequest("http://localhost/api/watchlist", "POST", {
        ticker: "aapl",
      }),
    );
    const deleteResponse = await deleteWatchlist(
      jsonRequest("http://localhost/api/watchlist", "DELETE", {
        ticker: "AAPL",
      }),
    );

    expect(addResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ removed: true });
    expect(mockPrisma.scanUsage.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.scanUsage.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.scanUsage.update).not.toHaveBeenCalled();
    expect(mockPrisma.scanUsage.create).not.toHaveBeenCalled();
  });
});

describe("monitor mutations", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.$transaction.mockImplementation(
      async (callback: (client: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    mockPrisma.user.findUnique.mockResolvedValue({ plan: "FREE" });
    mockPrisma.watchlistEntry.findFirst.mockResolvedValue({
      id: "watch-1",
      userId: "user-1",
      ticker: "AAPL",
    });
  });

  afterEach(() => jest.useRealTimers());

  test("enforces the plan's active monitor slot limit inside the transaction", async () => {
    mockPrisma.activeMonitor.count.mockResolvedValue(1);

    const response = await postMonitor(
      jsonRequest("http://localhost/api/monitors", "POST", {
        watchlistEntryId: "watch-1",
        kind: "FULL",
        frequency: "DAILY",
        durationMonths: 1,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "PLAN_LIMIT",
        message: "Your Free plan includes 1 active monitor.",
      },
    });
    expect(mockPrisma.activeMonitor.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  test("accepts exactly 24 months and rejects 25 months", async () => {
    mockPrisma.activeMonitor.count.mockResolvedValue(0);
    mockPrisma.activeMonitor.findFirst.mockResolvedValue(null);
    mockPrisma.activeMonitor.create.mockResolvedValue({
      id: "monitor-1",
      watchlistEntryId: "watch-1",
      kind: "FULL",
      frequency: "WEEKLY",
      startsAt: new Date("2026-08-25T12:00:00.000Z"),
      expiresAt: new Date("2028-08-25T12:00:00.000Z"),
      status: "ACTIVE",
      lastEvaluatedAt: null,
      nextEvaluationAt: new Date("2026-08-25T12:00:00.000Z"),
      createdAt: new Date("2026-08-25T12:00:00.000Z"),
      updatedAt: new Date("2026-08-25T12:00:00.000Z"),
    });

    const accepted = await postMonitor(
      jsonRequest("http://localhost/api/monitors", "POST", {
        watchlistEntryId: "watch-1",
        kind: "FULL",
        frequency: "WEEKLY",
        durationMonths: 24,
      }),
    );
    const rejected = await postMonitor(
      jsonRequest("http://localhost/api/monitors", "POST", {
        watchlistEntryId: "watch-1",
        kind: "FULL",
        frequency: "WEEKLY",
        durationMonths: 25,
      }),
    );

    expect(accepted.status).toBe(201);
    expect(mockPrisma.activeMonitor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startsAt: new Date("2026-08-25T12:00:00.000Z"),
        expiresAt: new Date("2028-08-25T12:00:00.000Z"),
      }),
    });
    expect(rejected.status).toBe(400);
  });

  test.each(["EXPIRED", "CANCELLED"])("reuses a %s monitor row instead of colliding with the unique slot key", async (terminalStatus) => {
    mockPrisma.activeMonitor.count.mockResolvedValue(0);
    mockPrisma.activeMonitor.findFirst.mockResolvedValue({
      id: "monitor-expired",
      status: terminalStatus,
      kind: "FULL",
    });
    mockPrisma.activeMonitor.update.mockResolvedValue({
      id: "monitor-expired",
      watchlistEntryId: "watch-1",
      kind: "PRICE",
      frequency: "DAILY",
      startsAt: new Date("2026-08-25T12:00:00.000Z"),
      expiresAt: new Date("2026-09-25T12:00:00.000Z"),
      status: "ACTIVE",
      lastEvaluatedAt: null,
      nextEvaluationAt: new Date("2026-08-25T12:00:00.000Z"),
    });

    const response = await postMonitor(
      jsonRequest("http://localhost/api/monitors", "POST", {
        watchlistEntryId: "watch-1",
        kind: "FULL",
        frequency: "DAILY",
        durationMonths: 1,
      }),
    );

    expect(response.status).toBe(201);
    expect(mockPrisma.activeMonitor.update).toHaveBeenCalledWith({
      where: { id: "monitor-expired" },
      data: expect.objectContaining({
        status: "ACTIVE",
        nextEvaluationAt: new Date("2026-08-25T12:00:00.000Z"),
      }),
    });
    expect(mockPrisma.activeMonitor.create).not.toHaveBeenCalled();
  });
});

describe("monitoring cron guard", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = "cron-test-secret";
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  test("rejects a request without the configured bearer secret before running monitors", async () => {
    const response = await runMonitoringCron(
      new NextRequest("http://localhost/api/cron/monitoring"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid cron credentials." },
    });
    expect(mockRunEligibleMonitorPublication).not.toHaveBeenCalled();
  });
});
