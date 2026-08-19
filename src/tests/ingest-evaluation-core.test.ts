const list = jest.fn();
const getPublicUrl = jest.fn((filename: string) => ({ data: { publicUrl: filename } }));
const from = jest.fn(() => ({ list, getPublicUrl }));

jest.mock("@/lib/supabase", () => ({
  EVALUATION_BUCKET: "evaluation-data",
  supabase: { storage: { from } },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    dailyScanSummary: { findMany: jest.fn(), upsert: jest.fn() },
    trackedStock: { findMany: jest.fn(), createMany: jest.fn() },
    stockDailySnapshot: { findMany: jest.fn(), createMany: jest.fn() },
    stockRiskAlert: { findMany: jest.fn(), createMany: jest.fn() },
    promotedStock: { upsert: jest.fn() },
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

const completeStatus = (overrides: Record<string, unknown> = {}) => {
  const phase = {
    status: "completed",
    completedAt: "2026-08-19T01:00:00.000Z",
    details: {},
  };
  return {
    date: "2026-08-19",
    pipelineStatus: "completed",
    completedAt: "2026-08-19T01:00:00.000Z",
    phases: {
      phase0_socialEarlyWarning: phase,
      phase1_riskScoring: phase,
      phase2_sizeFiltering: phase,
      phase3_newsAnalysis: phase,
      phase4_socialMedia: phase,
      phase5_schemeTracking: phase,
    },
    summary: {
      newsAnalysisMetrics: {
        failedModelCalls: 0,
        candidatesDeferred: 0,
        unavailableModelBatches: 0,
        quarantinedRows: 0,
        responseAnomalies: 0,
        unresolvedTasks: 0,
        replayRequested: 0,
        replayMissing: 0,
        evidenceSourceFailures: 0,
      },
    },
    recovery: {
      unresolvedCount: 0,
      unresolvedSymbols: [],
      generationId: "gen-1",
      journalFile: "news-analysis-journal-2026-08-19-gen-1.json",
      degraded: false,
    },
    ...overrides,
  };
};

function jsonResponse(value: unknown, status = 200): Response {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    headers: { get: () => "application/json" },
    text: async () => body,
  } as unknown as Response;
}

function mockStorageFiles(files: Record<string, unknown | Response>) {
  from.mockImplementation(() => ({ list, getPublicUrl }));
  getPublicUrl.mockImplementation((filename: string) => ({ data: { publicUrl: filename } }));
  (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
    const response = files[url];
    if (
      response &&
      typeof response === "object" &&
      "text" in response &&
      typeof response.text === "function"
    ) {
      return response as Response;
    }
    if (response === undefined) return jsonResponse(null, 404);
    return jsonResponse(response);
  });
}

function resetDatabaseMocks() {
  jest.clearAllMocks();
  from.mockImplementation(() => ({ list, getPublicUrl }));
  getPublicUrl.mockImplementation((filename: string) => ({ data: { publicUrl: filename } }));
  (prisma.dailyScanSummary.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.trackedStock.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.trackedStock.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.stockDailySnapshot.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.stockDailySnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.stockRiskAlert.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.stockRiskAlert.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.promotedStock.upsert as jest.Mock).mockResolvedValue({});
  (prisma.dailyScanSummary.upsert as jest.Mock).mockResolvedValue({});
}

function expectNoDatabaseAccess() {
  expect(prisma.dailyScanSummary.findMany).not.toHaveBeenCalled();
  expect(prisma.dailyScanSummary.upsert).not.toHaveBeenCalled();
  expect(prisma.trackedStock.findMany).not.toHaveBeenCalled();
  expect(prisma.trackedStock.createMany).not.toHaveBeenCalled();
  expect(prisma.stockDailySnapshot.findMany).not.toHaveBeenCalled();
  expect(prisma.stockDailySnapshot.createMany).not.toHaveBeenCalled();
  expect(prisma.stockRiskAlert.findMany).not.toHaveBeenCalled();
  expect(prisma.stockRiskAlert.createMany).not.toHaveBeenCalled();
  expect(prisma.promotedStock.upsert).not.toHaveBeenCalled();
}

describe("getPendingDates", () => {
  beforeEach(() => {
    resetDatabaseMocks();
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

describe("ingestDate publication gate", () => {
  const date = "2026-08-19";
  const enhanced = `enhanced-evaluation-${date}.json`;
  const status = `scan-status-${date}.json`;
  const prefix = `quarantine/${date}/gen-1`;
  const manifest = `${prefix}/publication-manifest-${date}.json`;
  const exactEnhanced = `${prefix}/${enhanced}`;
  const exactStatus = `${prefix}/${status}`;
  const validation = `${prefix}/pipeline-validation-${date}.json`;
  const receipt = `${prefix}/quarantine-upload-receipt-${date}.json`;

  function publicationFiles(): Record<string, unknown> {
    return {
      [status]: completeStatus(),
      [`scan-current-generation-${date}.json`]: {
        schemaVersion: 1,
        date,
        generationId: "gen-1",
        manifestPath: manifest,
        manifestFile: `publication-manifest-${date}.json`,
        manifestDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      [manifest]: {
        schemaVersion: 1,
        kind: "scan-publication-manifest",
        date,
        generationId: "gen-1",
        statusFile: status,
        journalFile: "news-analysis-journal-2026-08-19-gen-1.json",
        requiredFiles: [enhanced, status, "news-analysis-journal-2026-08-19-gen-1.json", `pipeline-validation-${date}.json`],
        commitMarker: `publication-manifest-${date}.json`,
      },
      [exactEnhanced]: [],
      [exactStatus]: completeStatus(),
      [`${prefix}/news-analysis-journal-2026-08-19-gen-1.json`]: {},
      [validation]: { date, status: "healthy", missingFiles: [] },
      [receipt]: {
        schemaVersion: 1,
        date,
        generationId: "gen-1",
        quarantinePrefix: prefix,
        success: true,
        uploadedFiles: [enhanced, status, "news-analysis-journal-2026-08-19-gen-1.json", `pipeline-validation-${date}.json`, `publication-manifest-${date}.json`],
      },
    };
  }

  beforeEach(() => {
    resetDatabaseMocks();
    global.fetch = jest.fn();
  });

  it.each([
    ["degraded pipeline", { pipelineStatus: "degraded" }, "pipeline-not-completed"],
    [
      "degraded phase",
      {
        phases: {
          ...completeStatus().phases,
          phase3_newsAnalysis: { status: "degraded" },
        },
      },
      "phase-not-completed",
    ],
    [
      "unresolved recovery",
      { recovery: { ...completeStatus().recovery, unresolvedCount: 1 } },
      "unresolved-recovery",
    ],
    ["wrong date", { date: "2026-08-18" }, "date-mismatch"],
  ])("blocks enhanced ingestion for %s before Prisma access", async (_name, overrides, reason) => {
    const files = publicationFiles();
    files[exactStatus] = completeStatus(overrides);
    mockStorageFiles({
      [enhanced]: [],
      ...files,
    });

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain(reason);
    expectNoDatabaseAccess();
  });

  it("blocks an enhanced evaluation when its scan status is missing", async () => {
    const files = publicationFiles();
    delete files[exactStatus];
    mockStorageFiles({ [enhanced]: [], ...files });

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain("missing");
    expectNoDatabaseAccess();
  });

  it("blocks an enhanced evaluation when its matching root scan status is missing", async () => {
    const files = publicationFiles();
    delete files[status];
    mockStorageFiles({ [enhanced]: [], ...files });

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain("root scan status");
    expectNoDatabaseAccess();
  });

  it("blocks an enhanced evaluation when its scan status is malformed", async () => {
    const files = publicationFiles();
    files[exactStatus] = "not-json";
    mockStorageFiles({
      [enhanced]: [],
      ...files,
    });

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain("unreadable");
    expectNoDatabaseAccess();
  });

  it("blocks enhanced ingestion when the final current-generation pointer is missing", async () => {
    mockStorageFiles({ [enhanced]: [], [status]: completeStatus() });

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain("generation");
    expectNoDatabaseAccess();
  });

  it("uses the pointer generation when the mutable root enhanced alias is missing", async () => {
    const files = publicationFiles();
    mockStorageFiles(files);

    const result = await ingestDate(date);

    expect(result.success).toBe(true);
    expect(prisma.dailyScanSummary.upsert).toHaveBeenCalledTimes(1);
    expect(getPublicUrl).toHaveBeenCalledWith(exactEnhanced);
  });

  it.each([
    ["missing", (files: Record<string, unknown>) => { delete files[receipt]; }],
    ["malformed", (files: Record<string, unknown>) => { files[receipt] = "not-json"; }],
    ["mismatched", (files: Record<string, unknown>) => { files[receipt] = { ...(files[receipt] as Record<string, unknown>), generationId: "gen-2" }; }],
  ])("blocks %s quarantine receipt before Prisma access", async (_name, mutate) => {
    const files = publicationFiles();
    mutate(files);
    mockStorageFiles(files);

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain("receipt");
    expectNoDatabaseAccess();
  });

  it("blocks when the current-generation pointer switches before Prisma", async () => {
    const files = publicationFiles();
    let pointerReads = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url === `scan-current-generation-${date}.json`) {
        pointerReads += 1;
        if (pointerReads > 1) {
          return jsonResponse({
            schemaVersion: 1,
            date,
            generationId: "gen-2",
            manifestPath: `quarantine/${date}/gen-2/publication-manifest-${date}.json`,
            manifestFile: `publication-manifest-${date}.json`,
            manifestDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          });
        }
      }
      const response = files[url];
      if (response === undefined) return jsonResponse(null, 404);
      return jsonResponse(response);
    });

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain("pointer");
    expectNoDatabaseAccess();
  });

  it("blocks enhanced ingestion when the generation journal is missing", async () => {
    const files = publicationFiles();
    delete files[`${prefix}/news-analysis-journal-2026-08-19-gen-1.json`];
    mockStorageFiles({ [enhanced]: [], ...files });

    const result = await ingestDate(date);

    expect(result.success).toBe(false);
    expect(result.error).toContain("publication blocked");
    expect(result.error).toContain("journal");
    expectNoDatabaseAccess();
  });

  it("allows a valid completed enhanced scan through the existing ingestion path", async () => {
    mockStorageFiles({
      [enhanced]: [],
      ...publicationFiles(),
    });

    const result = await ingestDate(date);

    expect(result.success).toBe(true);
    expect(prisma.dailyScanSummary.upsert).toHaveBeenCalledTimes(1);
  });

  it("preserves legacy ingestion when no enhanced evaluation exists", async () => {
    mockStorageFiles({
      [`fmp-evaluation-${date}.json`]: [],
    });

    const result = await ingestDate(date);

    expect(result.success).toBe(true);
    expect(prisma.dailyScanSummary.upsert).toHaveBeenCalledTimes(1);
    expect(getPublicUrl).toHaveBeenCalledWith(`fmp-evaluation-${date}.json`);
    expect(getPublicUrl).not.toHaveBeenCalledWith(status);
  });

  it("uses legacy only when both pointer and root enhanced files are 404", async () => {
    mockStorageFiles({
      [`fmp-evaluation-${date}.json`]: [],
    });

    const result = await ingestDate(date);

    expect(result.success).toBe(true);
    expect(getPublicUrl).toHaveBeenCalledWith(`scan-current-generation-${date}.json`);
    expect(getPublicUrl).toHaveBeenCalledWith(enhanced);
    expect(prisma.dailyScanSummary.upsert).toHaveBeenCalledTimes(1);
  });
});
