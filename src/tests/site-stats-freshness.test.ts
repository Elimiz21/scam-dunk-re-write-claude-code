import { GET } from "@/app/api/stats/site/route";
import { prisma } from "@/lib/db";

jest.mock("@/lib/db", () => ({
  prisma: {
    dailyScanSummary: { findFirst: jest.fn(), aggregate: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

describe("published site statistics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.dailyScanSummary.aggregate as jest.Mock).mockResolvedValue({
      _sum: { evaluated: 20 },
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  });

  it("does not allow a CDN to serve yesterday's statistics after publication", async () => {
    (prisma.dailyScanSummary.findFirst as jest.Mock)
      .mockResolvedValueOnce({ scanDate: new Date("2026-09-14"), createdAt: new Date("2026-09-15T07:00:00Z"), evaluated: 10, highRiskCount: 3 })
      .mockResolvedValueOnce({ scanDate: new Date("2026-09-15"), createdAt: new Date("2026-09-16T07:00:00Z"), evaluated: 10, highRiskCount: 2 });
    const oldResponse = await GET();
    const newResponse = await GET();
    expect(oldResponse.headers.get("Cache-Control")).toContain("no-store");
    expect(newResponse.headers.get("Cache-Control")).toContain("no-store");
    const body = await newResponse.json();
    expect(body.lastScanDate).toBe("2026-09-15T00:00:00.000Z");
    expect(body.highRiskLastScan).toBe(2);
    expect(body.summaryCreatedAt).toBe("2026-09-16T07:00:00.000Z");
  });

  it("does not mislabel initial creation as publication on same-date corrections", async () => {
    const summary = { scanDate: new Date("2026-09-15"), createdAt: new Date("2026-09-16T07:00:00Z"), evaluated: 10, highRiskCount: 2 };
    (prisma.dailyScanSummary.findFirst as jest.Mock)
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ ...summary, highRiskCount: 5 });
    const original = await (await GET()).json();
    const corrected = await (await GET()).json();
    expect(corrected.highRiskLastScan).toBe(5);
    expect(corrected.summaryCreatedAt).toBe(original.summaryCreatedAt);
    expect(corrected).not.toHaveProperty("publishedAt");
  });

  it("keeps missing summary creation unknown instead of inventing a current date", async () => {
    (prisma.dailyScanSummary.findFirst as jest.Mock).mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.lastScanDate).toBeNull();
    expect(body.summaryCreatedAt).toBeNull();
    expect(body.highRiskLastScan).toBeNull();
  });
});
