import { createActivityTickerService } from "@/lib/activity-ticker";

describe("activity ticker service", () => {
  test("uses the latest completed market-wide publication instead of sparse customer scans", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      scanDate: new Date("2026-08-29T00:00:00.000Z"),
      totalStocks: 6900,
      evaluated: 6420,
      skippedNoData: 480,
      lowRiskCount: 5000,
      mediumRiskCount: 860,
      highRiskCount: 520,
      insufficientCount: 40,
    });
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { evaluated: 176808 },
    });

    const service = createActivityTickerService({
      dailyScanSummary: { findFirst, aggregate },
    } as never);

    await expect(
      service.getActivityTicker({
        now: new Date("2026-09-14T19:51:15.204Z"),
      }),
    ).resolves.toEqual({
      status: "AVAILABLE",
      updatedAt: "2026-09-14T19:51:15.204Z",
      latestScan: {
        scanDate: "2026-08-29T00:00:00.000Z",
        totalStocks: 6900,
        evaluated: 6420,
        skipped: 480,
        highRisk: 520,
        caution: 900,
        lowRisk: 5000,
        coveragePercent: 93,
      },
      allTimeEvaluations: 176808,
      notice:
        "Verified market-wide end-of-day scan totals. Monitoring is not live.",
    });

    expect(findFirst).toHaveBeenCalledWith({
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: {
        scanDate: true,
        totalStocks: true,
        evaluated: true,
        skippedNoData: true,
        lowRiskCount: true,
        mediumRiskCount: true,
        highRiskCount: true,
        insufficientCount: true,
      },
    });
  });

  test("skips a malformed newest summary and uses the newest complete one", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        scanDate: new Date("2026-09-18T00:00:00.000Z"),
        totalStocks: 16928,
        evaluated: 9230,
        skippedNoData: 7690,
        lowRiskCount: 2635,
        mediumRiskCount: 1213,
        highRiskCount: 5382,
        insufficientCount: 0,
      },
      {
        scanDate: new Date("2026-09-17T00:00:00.000Z"),
        totalStocks: 16920,
        evaluated: 9211,
        skippedNoData: 7709,
        lowRiskCount: 2423,
        mediumRiskCount: 1281,
        highRiskCount: 5507,
        insufficientCount: 0,
      },
    ]);
    const service = createActivityTickerService({
      dailyScanSummary: {
        findFirst: jest.fn(),
        findMany,
        aggregate: jest.fn().mockResolvedValue({ _sum: { evaluated: 1000000 } }),
      },
    } as never);

    const result = await service.getActivityTicker();

    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.latestScan.scanDate).toBe("2026-09-17T00:00:00.000Z");
      expect(result.latestScan.evaluated).toBe(9211);
    }
  });

  test("reports unavailable instead of presenting zeros when no market publication exists", async () => {
    const service = createActivityTickerService({
      dailyScanSummary: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { evaluated: null } }),
      },
    } as never);

    await expect(
      service.getActivityTicker({
        now: new Date("2026-09-14T19:51:15.204Z"),
      }),
    ).resolves.toEqual({
      status: "UNAVAILABLE",
      updatedAt: "2026-09-14T19:51:15.204Z",
      latestScan: null,
      allTimeEvaluations: null,
      notice: "No completed market-wide scan is available yet.",
    });
  });

  test("reports unavailable instead of presenting a zero or inconsistent publication", async () => {
    const service = createActivityTickerService({
      dailyScanSummary: {
        findFirst: jest.fn().mockResolvedValue({
          scanDate: new Date("2026-09-14T00:00:00.000Z"),
          totalStocks: 6900,
          evaluated: 0,
          skippedNoData: 6900,
          lowRiskCount: 0,
          mediumRiskCount: 0,
          highRiskCount: 0,
          insufficientCount: 0,
        }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { evaluated: 176808 } }),
      },
    } as never);

    await expect(
      service.getActivityTicker({
        now: new Date("2026-09-14T19:51:15.204Z"),
      }),
    ).resolves.toEqual({
      status: "UNAVAILABLE",
      updatedAt: "2026-09-14T19:51:15.204Z",
      latestScan: null,
      allTimeEvaluations: null,
      notice: "The latest market-wide scan publication is incomplete.",
    });
  });
});
