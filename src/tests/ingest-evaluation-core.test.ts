const list = jest.fn();
const getPublicUrl = jest.fn((filename: string) => ({
  data: { publicUrl: `https://storage.test/${filename}` },
}));
const download = jest.fn().mockResolvedValue({
  data: null,
  error: { message: "not found" },
});
const from = jest.fn(() => ({ list, getPublicUrl, download }));

jest.mock("@/lib/supabase", () => ({
  EVALUATION_BUCKET: "evaluation-data",
  supabase: { storage: { from } },
}));

jest.mock("@/lib/server/evaluation-storage", () => ({
  getEvaluationStorageServerClient: () => ({ storage: { from } }),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    evaluationArtifactPublicationHead: { findUnique: jest.fn().mockResolvedValue(null) },
    dailyScanSummary: { findMany: jest.fn(), upsert: jest.fn() },
    trackedStock: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    stockRiskAlert: { findMany: jest.fn(), createMany: jest.fn() },
    promotedStock: { upsert: jest.fn() },
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
import { createRevisionUploadPlan } from "../../evaluation/scripts/storage-publisher";
import { PrismaIngestionStore } from "@/lib/admin/prisma-ingestion-store";

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
  it("keeps dates with identity quarantines pending for retry", async () => {
    list.mockResolvedValue({
      data: [{ name: "enhanced-evaluation-2026-09-16.json" }],
      error: null,
    });
    (prisma.dailyScanSummary.findMany as jest.Mock).mockResolvedValue([
      {
        scanDate: new Date("2026-09-16"),
        byExchange: JSON.stringify({
          OTC: {
            total: 0,
            LOW: 0,
            MEDIUM: 0,
            HIGH: 0,
            identityQuarantines: [{ symbol: "EXAMPLE" }],
          },
        }),
      },
    ]);
    await expect(getPendingDates()).resolves.toEqual(["2026-09-16"]);
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
  let promoted: unknown[];
  beforeEach(() => {
    jest.clearAllMocks();
    rows = [{ ...row }];
    promoted = [];
    global.fetch = jest.fn(async (url) => ({
      ok:
        String(url).includes("enhanced-evaluation") ||
        (String(url).includes("promoted-stocks") && promoted.length > 0),
      status: 404,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify(
          String(url).includes("promoted-stocks")
            ? { promotedStocks: promoted }
            : rows,
        ),
    })) as unknown as typeof fetch;
    download.mockImplementation(async (filename: string) => {
      const response = await global.fetch(`https://storage.test/${filename}`);
      if (!response.ok) {
        return { data: null, error: { message: "not found" } };
      }
      return {
        data: new Blob([await response.text()], { type: "application/json" }),
        error: null,
      };
    });
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
      {
        id: "stock-1",
        name: "Example Corp",
        symbol: "EXAMPLE",
        exchange: "NASDAQ",
        isOTC: false,
      },
    ]);
    (prisma.trackedStock.update as jest.Mock).mockResolvedValue({});
    (prisma.stockRiskAlert.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.stockRiskAlert.createMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
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
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("fails a pointer revision with an identity conflict before any canonical or metadata write", async () => {
    const date = "2026-09-16";
    rows[0] = { ...row, name: "Different Issuer Ltd", riskLevel: "HIGH" };
    const evaluationName = `enhanced-evaluation-${date}.json`;
    const summaryName = `fmp-summary-${date}.json`;
    const plan = createRevisionUploadPlan({
      scanDate: date,
      producerRunId: "identity-conflict",
      files: {
        [evaluationName]: Buffer.from(JSON.stringify(rows)),
        [summaryName]: Buffer.from(JSON.stringify({
          totalStocks: 1, evaluated: 1, skippedNoData: 0,
          byRiskLevel: { HIGH: 1 }, byExchange: { OTC: { total: 1, HIGH: 1 } },
        })),
      },
      required: [evaluationName, summaryName],
    });
    const objects = new Map(plan.operations.map((op) => [op.path, op.content]));
    download.mockImplementation(async (objectPath: string) => {
      const bytes = objects.get(objectPath);
      return bytes
        ? { data: new Blob([new Uint8Array(bytes)]), error: null }
        : { data: null, error: { message: "not found" } };
    });
    jest.spyOn(PrismaIngestionStore.prototype, "ensureRevision").mockResolvedValue();
    jest.spyOn(PrismaIngestionStore.prototype, "claimPhase").mockResolvedValue({
      state: "CLAIMED", leaseToken: "identity-lease",
    });
    const fail = jest.spyOn(PrismaIngestionStore.prototype, "failPhase").mockResolvedValue();
    const publish = jest.spyOn(PrismaIngestionStore.prototype, "publishEvaluationRevision").mockResolvedValue({
      snapshotsCreated: 0, alertsCreated: 0, promotedStocksCreated: 0, stocksCreated: 0,
    });
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([{
      id: "stock-1", symbol: "EXAMPLE", name: "Example Corp", exchange: "OTC", isOTC: true,
    }]);

    await expect(ingestDate(date)).resolves.toMatchObject({
      success: false, partial: true, snapshotsCreated: 0,
    });
    expect(fail).toHaveBeenCalledWith(
      plan.manifest.revisionHash, "CANONICAL_PUBLISH", "identity-lease",
      expect.stringContaining("identity conflicts"),
    );
    expect(publish).not.toHaveBeenCalled();
    expect(prisma.trackedStock.update).not.toHaveBeenCalled();
    expect(prisma.trackedStock.createMany).not.toHaveBeenCalled();
    expect(prisma.stockDailySnapshot.createMany).not.toHaveBeenCalled();
    expect(prisma.dailyScanSummary.upsert).not.toHaveBeenCalled();
  });

  it("rejects hash-bound failed mandatory scoring before claiming publication", async () => {
    const date = "2026-09-16";
    const evaluationName = `enhanced-evaluation-${date}.json`;
    const summaryName = `fmp-summary-${date}.json`;
    const statusName = `scan-status-${date}.json`;
    const validationName = `pipeline-validation-${date}.json`;
    const plan = createRevisionUploadPlan({
      scanDate: date, producerRunId: "failed-quality", producerKind: "DAILY_PIPELINE",
      qualityStatus: "DEGRADED",
      files: {
        [evaluationName]: Buffer.from(JSON.stringify(rows)),
        [summaryName]: Buffer.from("{}"),
        [statusName]: Buffer.from(JSON.stringify({
          date, pipelineStatus: "failed", phases: { phase1_riskScoring: { status: "failed" } },
        })),
        [validationName]: Buffer.from(JSON.stringify({ date, status: "failing", scanPipelineStatus: "failed" })),
      },
      required: [evaluationName, summaryName, statusName, validationName],
    });
    const objects = new Map(plan.operations.map((op) => [op.path, op.content]));
    download.mockImplementation(async (objectPath: string) => {
      const bytes = objects.get(objectPath);
      return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { message: "not found" } };
    });
    const ensure = jest.spyOn(PrismaIngestionStore.prototype, "ensureRevision");
    await expect(ingestDate(date)).resolves.toMatchObject({ success: false, error: expect.stringContaining("risk scoring") });
    expect(ensure).not.toHaveBeenCalled();
    expect(prisma.stockDailySnapshot.createMany).not.toHaveBeenCalled();
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
    "OTHER OTC",
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
      .mockResolvedValue([
        { id: "stock-1", name: "Example Corp", symbol: "EXAMPLE" },
      ]);
    await ingestDate("2026-09-16");
    expect(
      (prisma.trackedStock.createMany as jest.Mock).mock.calls[0][0].data[0],
    ).toMatchObject({ exchange: "PNK", isOTC: true });
  });
  it("clears stale OTC classification when a security is now listed", async () => {
    rows[0].exchange = "NASDAQ";
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
      {
        id: "stock-1",
        name: "Example Corp",
        symbol: "EXAMPLE",
        exchange: "OTC",
        isOTC: true,
      },
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
          name: "Example Corp",
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
        name: "Example Corp",
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
  it("does not update metadata on same-day reruns whose snapshots are immutable", async () => {
    const storedScanDate = new Date("2026-09-16");
    storedScanDate.setHours(0, 0, 0, 0);
    (prisma.stockDailySnapshot.groupBy as jest.Mock).mockResolvedValue([
      {
        stockId: "stock-1",
        _max: {
          scanDate: storedScanDate,
          evaluatedAt: new Date("2026-09-16T20:00:00Z"),
        },
      },
    ]);
    (prisma.stockDailySnapshot.findMany as jest.Mock).mockResolvedValue([
      { stockId: "stock-1" },
    ]);
    rows[0].evaluatedAt = "2026-09-16T23:00:00Z";
    expect((await ingestDate("2026-09-16")).success).toBe(true);
    rows[0].evaluatedAt = "2026-09-16T22:00:00Z";
    expect((await ingestDate("2026-09-16")).success).toBe(true);
    expect(prisma.trackedStock.update).not.toHaveBeenCalled();
    expect(prisma.stockDailySnapshot.createMany).not.toHaveBeenCalled();
  });
  it("does not weaken metadata provenance after a newer scan with an older evaluation", async () => {
    const current = {
      id: "stock-1",
      name: "Example Corp",
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
  it("quarantines a reused OTC issuer name while preserving unrelated listed ingestion", async () => {
    rows[0] = {
      ...row,
      name: "Different Issuer Ltd",
      securityIdentifier: "US9999999999",
      riskLevel: "HIGH",
    };
    rows.push({
      ...row,
      symbol: "LISTED",
      name: "Listed Inc",
      exchange: "NYSE",
      riskLevel: "LOW",
    });
    (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([
      {
        id: "stock-1",
        symbol: "EXAMPLE",
        name: "Example Corp",
        exchange: "OTC",
        isOTC: true,
      },
      {
        id: "stock-2",
        symbol: "LISTED",
        name: "Listed Inc",
        exchange: "NYSE",
        isOTC: false,
      },
    ]);
    promoted = [
      {
        symbol: "EXAMPLE",
        name: "Different Issuer Ltd",
        platforms: [],
        sources: [],
      },
    ];
    const result = await ingestDate("2026-09-16");
    expect(result).toMatchObject({
      success: false,
      partial: true,
      totalProcessed: 1,
      skipped: 1,
      identityQuarantines: [
        {
          symbol: "EXAMPLE",
          existingName: "Example Corp",
          incomingName: "Different Issuer Ltd",
          securityIdentifier: "US9999999999",
          reason: "OTC_ISSUER_NAME_CONFLICT",
        },
      ],
    });
    expect(prisma.trackedStock.update).not.toHaveBeenCalled();
    expect(prisma.trackedStock.createMany).not.toHaveBeenCalled();
    expect(prisma.stockRiskAlert.createMany).not.toHaveBeenCalled();
    expect(prisma.promotedStock.upsert).not.toHaveBeenCalled();
    expect(
      (
        prisma.stockDailySnapshot.createMany as jest.Mock
      ).mock.calls[0][0].data.map((x: { stockId: string }) => x.stockId),
    ).toEqual(["stock-2"]);
    const summary = (prisma.dailyScanSummary.upsert as jest.Mock).mock
      .calls[0][0].create;
    expect(summary).toMatchObject({
      totalStocks: 2,
      evaluated: 1,
      highRiskCount: 0,
      lowRiskCount: 1,
    });
    expect(JSON.parse(summary.byExchange).OTC.identityQuarantines).toHaveLength(
      1,
    );
  });
  it("clears stored quarantine metadata when a corrected retry matches the issuer", async () => {
    const result = await ingestDate("2026-09-16");
    expect(result.success).toBe(true);
    const summary = (prisma.dailyScanSummary.upsert as jest.Mock).mock
      .calls[0][0].update;
    expect(summary.evaluated).toBe(1);
    expect(
      JSON.parse(summary.byExchange).OTC.identityQuarantines,
    ).toBeUndefined();
  });
  it("quarantines every duplicate-symbol row if an earlier issuer conflicts", async () => {
    rows = [
      { ...row, name: "Different Issuer", riskLevel: "HIGH" },
      { ...row },
    ];
    const result = await ingestDate("2026-09-16");
    expect(result).toMatchObject({
      success: false,
      partial: true,
      totalProcessed: 0,
      skipped: 2,
    });
    expect(result.identityQuarantines).toHaveLength(1);
    expect(prisma.stockDailySnapshot.createMany).not.toHaveBeenCalled();
    expect(prisma.stockRiskAlert.createMany).not.toHaveBeenCalled();
  });
  it("accepts cosmetic issuer-name differences", async () => {
    rows[0].name = "  EXAMPLE, Corp. ";
    const result = await ingestDate("2026-09-16");
    expect(result).toMatchObject({
      success: true,
      partial: false,
      identityQuarantines: [],
    });
    expect(prisma.stockDailySnapshot.createMany).toHaveBeenCalled();
  });
  it("persists real evaluation time and insufficient status without asserting legitimacy", async () => {
    await ingestDate("2026-09-16");
    const snapshot = (prisma.stockDailySnapshot.createMany as jest.Mock).mock
      .calls[0][0].data[0];
    expect(snapshot).toMatchObject({
      evaluatedAt: new Date("2026-09-16T23:12:34.567Z"),
      isInsufficient: true,
      isLegitimate: null,
    });
  });
  it("preserves zero summary measurements instead of replacing them with unknown", async () => {
    download.mockImplementation(async (filename: string) => {
      if (filename === "fmp-summary-2026-09-16.json") {
        return {
          data: new Blob([
            JSON.stringify({
              totalStocks: 1,
              evaluated: 1,
              skippedNoData: 0,
              byRiskLevel: { INSUFFICIENT: 1 },
              byExchange: {},
              durationMinutes: 0,
              apiCallsMade: 0,
            }),
          ]),
          error: null,
        };
      }
      const response = await global.fetch(`https://storage.test/${filename}`);
      return response.ok
        ? {
            data: new Blob([await response.text()], {
              type: "application/json",
            }),
            error: null,
          }
        : { data: null, error: { message: "not found" } };
    });
    await ingestDate("2026-09-16");
    expect((prisma.dailyScanSummary.upsert as jest.Mock).mock.calls[0][0].update)
      .toMatchObject({ scanDurationMins: 0, apiCallsMade: 0 });
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
