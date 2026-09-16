const list = jest.fn();
const getPublicUrl = jest.fn((filename: string) => ({
  data: { publicUrl: `https://storage.test/${filename}` },
}));
const from = jest.fn(() => ({ list, getPublicUrl }));

jest.mock("@/lib/supabase", () => ({
  EVALUATION_BUCKET: "evaluation-data",
  supabase: { storage: { from } },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    dailyScanSummary: { findMany: jest.fn(), upsert: jest.fn() },
    trackedStock: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    stockDailySnapshot: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

jest.mock("@/lib/promoted-stocks/tracker", () => ({
  fetchDailyCloses: jest.fn(),
}));

import { prisma } from "@/lib/db";
import {
  getPendingDates,
  ingestDate,
} from "@/lib/admin/ingest-evaluation-core";

describe("getPendingDates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.dailyScanSummary.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("discovers a recent evaluation file beyond the first storage page", async () => {
    list
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, i) => ({
          name: `historical-${String(i).padStart(4, "0")}.json`,
        })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { name: "enhanced-evaluation-2026-08-14.json" },
          { name: "enhanced-evaluation-2026-08-12.json" },
        ],
        error: null,
      });

    await expect(getPendingDates()).resolves.toEqual([
      "2026-08-12",
      "2026-08-14",
    ]);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(1, "", {
      limit: 500,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    expect(list).toHaveBeenNthCalledWith(2, "", {
      limit: 500,
      offset: 500,
      sortBy: { column: "name", order: "asc" },
    });
  });
});

describe("ingestDate OTC records", () => {
  const originalFetch = global.fetch;
  const row = {
    symbol: "EXAMPLE",
    name: "Example Corp",
    exchange: "OTCQB",
    riskLevel: "INSUFFICIENT",
    totalScore: 0,
    signals: [],
    evaluatedAt: "2026-09-16T23:12:34.567Z",
  };
  let rows: Array<Record<string, unknown>>;
  beforeEach(() => {
    jest.clearAllMocks();
    rows = [{ ...row }];
    global.fetch = jest.fn(async (url) => ({
      ok: String(url).includes("enhanced-evaluation"),
      status: 404,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(rows),
    })) as unknown as typeof fetch;
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
      { id: "stock-1", symbol: "EXAMPLE", exchange: "NASDAQ", isOTC: false },
    ]);
    (prisma.trackedStock.update as jest.Mock).mockResolvedValue({});
    (prisma.stockDailySnapshot.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.stockDailySnapshot.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.stockDailySnapshot.createMany as jest.Mock).mockImplementation(
      async ({ data }) => ({ count: data.length }),
    );
    (prisma.trackedStock.createMany as jest.Mock).mockImplementation(
      async ({ data }) => ({ count: data.length }),
    );
    (prisma.dailyScanSummary.upsert as jest.Mock).mockResolvedValue({});
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    "OTC",
    "OTCQX",
    "OTCQB",
    "OTCPK",
    "PNK",
    "PINK",
    "GREY",
    "OTC Markets",
  ])("refreshes stale listed metadata for %s", async (exchange) => {
    rows[0].exchange = exchange;
    expect((await ingestDate("2026-09-16")).success).toBe(true);
    expect(prisma.trackedStock.update).toHaveBeenCalledWith({
      where: { id: "stock-1" },
      data: { exchange, isOTC: true },
    });
  });
  it("classifies newly discovered PNK securities as OTC", async () => {
    rows[0].exchange = "PNK";
    (prisma.trackedStock.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: "stock-1", symbol: "EXAMPLE" }]);
    await ingestDate("2026-09-16");
    expect(
      (prisma.trackedStock.createMany as jest.Mock).mock.calls[0][0].data[0],
    ).toMatchObject({ exchange: "PNK", isOTC: true });
  });
  it("clears stale OTC classification when a security is now listed", async () => {
    rows[0].exchange = "NASDAQ";
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
      { id: "stock-1", symbol: "EXAMPLE", exchange: "OTC", isOTC: true },
    ]);
    await ingestDate("2026-09-16");
    expect(prisma.trackedStock.update).toHaveBeenCalledWith({
      where: { id: "stock-1" },
      data: { exchange: "NASDAQ", isOTC: false },
    });
  });
  it.each([
    ["2026-09-15", "2026-09-17T01:00:00Z"],
    ["2026-09-16", "2026-09-16T22:00:00Z"],
    ["2026-09-17", "2026-09-15T23:00:00Z"],
  ])(
    "preserves current metadata when scan %s or evaluation %s is older",
    async (date, evaluatedAt) => {
      rows[0].evaluatedAt = evaluatedAt;
      (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
        {
          id: "stock-1",
          symbol: "EXAMPLE",
          exchange: "NASDAQ",
          isOTC: false,
          dailySnapshots: [
            {
              scanDate: new Date("2026-09-16T00:00:00Z"),
              evaluatedAt: new Date("2026-09-16T23:00:00Z"),
            },
          ],
        },
      ]);
      (prisma.stockDailySnapshot.groupBy as jest.Mock).mockResolvedValue([
        {
          stockId: "stock-1",
          _max: {
            scanDate: new Date("2026-09-16T00:00:00Z"),
            evaluatedAt: new Date("2026-09-16T23:00:00Z"),
          },
        },
      ]);
      const result = await ingestDate(date);
      expect(result.success).toBe(true);
      expect(result.snapshotsCreated).toBe(1);
      expect(prisma.trackedStock.update).not.toHaveBeenCalled();
      expect(result.stocksUpdated).toBe(0);
    },
  );
  it("refreshes metadata only after the latest scan and evaluation", async () => {
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
      {
        id: "stock-1",
        symbol: "EXAMPLE",
        exchange: "NASDAQ",
        isOTC: false,
        dailySnapshots: [
          {
            scanDate: new Date("2026-09-15T00:00:00Z"),
            evaluatedAt: new Date("2026-09-15T23:00:00Z"),
          },
        ],
      },
    ]);
    (prisma.stockDailySnapshot.groupBy as jest.Mock).mockResolvedValue([
      {
        stockId: "stock-1",
        _max: {
          scanDate: new Date("2026-09-15T00:00:00Z"),
          evaluatedAt: new Date("2026-09-15T23:00:00Z"),
        },
      },
    ]);
    const result = await ingestDate("2026-09-16");
    expect(result.success).toBe(true);
    expect(result.stocksUpdated).toBe(1);
    expect(prisma.stockDailySnapshot.groupBy).toHaveBeenCalledWith({
      by: ["stockId"],
      where: { stockId: { in: ["stock-1"] } },
      _max: { scanDate: true, evaluatedAt: true },
    });
  });
  it("does not weaken metadata provenance after a newer scan with an older evaluation", async () => {
    const current = {
      id: "stock-1",
      symbol: "EXAMPLE",
      exchange: "NASDAQ",
      isOTC: false,
    };
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
      {
        ...current,
        dailySnapshots: [
          {
            scanDate: new Date("2026-09-17"),
            evaluatedAt: new Date("2026-09-15T00:00:00Z"),
          },
        ],
      },
    ]);
    (prisma.stockDailySnapshot.groupBy as jest.Mock).mockResolvedValue([
      {
        stockId: "stock-1",
        _max: {
          scanDate: new Date("2026-09-17"),
          evaluatedAt: new Date("2026-09-16T23:00:00Z"),
        },
      },
    ]);
    rows[0].evaluatedAt = "2026-09-15T12:00:00Z";
    expect((await ingestDate("2026-09-18")).success).toBe(true);
    expect(prisma.trackedStock.update).not.toHaveBeenCalled();
  });
  it("persists real evaluation time and insufficient status without asserting legitimacy", async () => {
    await ingestDate("2026-09-16");
    const snapshot = (prisma.stockDailySnapshot.createMany as jest.Mock).mock
      .calls[0][0].data[0];
    expect(snapshot).toMatchObject({
      evaluatedAt: new Date("2026-09-16T23:12:34.567Z"),
      isInsufficient: true,
      isLegitimate: false,
    });
  });
  it.each([
    undefined,
    "invalid",
    "2026-09-16",
    "2026-02-30T23:12:34.567Z",
    "2026-09-16T24:00:00Z",
  ])(
    "rejects OTC records without a real evaluation timestamp (%s)",
    async (evaluatedAt) => {
      rows[0].evaluatedAt = evaluatedAt;
      const result = await ingestDate("2026-09-16");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/evaluatedAt/);
      expect(prisma.stockDailySnapshot.createMany).not.toHaveBeenCalled();
      expect(prisma.dailyScanSummary.upsert).not.toHaveBeenCalled();
    },
  );
  it("preserves legacy listed ingestion without evaluation timestamps", async () => {
    rows[0].exchange = "NASDAQ";
    delete rows[0].evaluatedAt;
    expect((await ingestDate("2026-09-16")).success).toBe(true);
  });
});
