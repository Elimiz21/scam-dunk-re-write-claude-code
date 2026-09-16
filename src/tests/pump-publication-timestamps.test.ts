import { createPumpRadarService } from "@/lib/pump-radar";
jest.mock("@/lib/db", () => ({ prisma: {} }));

function client(summary: object) {
  return {
    dailyScanSummary: { findFirst: jest.fn().mockResolvedValue(summary) },
    stockDailySnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    socialScanRun: { findFirst: jest.fn().mockResolvedValue(null) },
    socialMention: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
const base = { scanDate: new Date("2026-09-04"), createdAt: new Date("2026-09-05T07:00:00Z"), totalStocks: 10, evaluated: 8, skippedNoData: 2 };

describe("Pump Radar publication provenance", () => {
  it("exposes degraded publication quality separately from freshness", async () => {
    const result = await createPumpRadarService(client({ ...base, artifactRevision: { status: "PUBLISHED", qualityStatus: "DEGRADED" } })).getPumpRadar({ limit: 10, viewer: "PUBLIC", now: new Date("2026-09-08T12:00:00Z") });
    expect(result).toMatchObject({ freshness: "FRESH", publicationQuality: "DEGRADED" });
  });
  it("uses completed revision timestamps after same-date republication", async () => {
    const db = client({ ...base, publishedAt: new Date("2026-09-08T08:00:00Z"), artifactRevision: { status: "PUBLISHED", producerExecutedAt: new Date("2026-09-04T23:45:00Z") } });
    const result = await createPumpRadarService(db).getPumpRadar({ limit: 10, viewer: "AUTHENTICATED", now: new Date("2026-09-08T12:00:00Z") });
    expect(result).toMatchObject({ publishedAt: "2026-09-08T08:00:00.000Z", executedAt: "2026-09-04T23:45:00.000Z", asOf: "2026-09-04T00:00:00.000Z", freshness: "FRESH" });
  });
  it("retains legacy data with unknown execution/publication timestamps", async () => {
    const result = await createPumpRadarService(client(base)).getPumpRadar({ limit: 10, viewer: "PUBLIC", now: new Date("2026-09-09T07:00:00Z") });
    expect(result).toMatchObject({ status: "AVAILABLE", publishedAt: null, executedAt: null, publicationQuality: "UNKNOWN", freshness: "STALE" });
  });
  it("never labels an incomplete revision as published", async () => {
    const result = await createPumpRadarService(client({ ...base, publishedAt: new Date(), artifactRevision: { status: "FAILED", producerExecutedAt: new Date() } })).getPumpRadar({ limit: 10, viewer: "PUBLIC" });
    expect(result.status).toBe("UNAVAILABLE");
  });
});
