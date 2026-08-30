import { createActivityTickerService } from "@/lib/activity-ticker";

describe("activity ticker service", () => {
  test("returns verified all-time, weekly, monthly, and anonymous high-risk activity", async () => {
    const count = jest.fn().mockResolvedValue(12);
    const groupBy = jest
      .fn()
      .mockImplementation(async ({ where }: { where: { createdAt: { gte: Date } } }) => {
        const start = where.createdAt.gte.toISOString();
        if (start === "2026-08-24T00:00:00.000Z") {
          return [
            { riskLevel: "HIGH", _count: { _all: 2 } },
            { riskLevel: "MEDIUM", _count: { _all: 3 } },
            { riskLevel: "LOW", _count: { _all: 4 } },
          ];
        }
        return [
          { riskLevel: "HIGH", _count: { _all: 5 } },
          { riskLevel: "INSUFFICIENT", _count: { _all: 1 } },
        ];
      });
    const findMany = jest.fn().mockResolvedValue([
      {
        ticker: "GME",
        riskLevel: "HIGH",
        totalScore: 86,
        createdAt: new Date("2026-08-29T14:00:00.000Z"),
      },
    ]);

    const service = createActivityTickerService({
      scanHistory: { count, groupBy, findMany },
    } as never);

    await expect(
      service.getActivityTicker({
        excludeUserId: "current-user",
        now: new Date("2026-08-30T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "AVAILABLE",
      updatedAt: "2026-08-30T12:00:00.000Z",
      allTimeScans: 12,
      week: { total: 9, highRisk: 2, caution: 3, lowRisk: 4 },
      month: { total: 6, highRisk: 5, caution: 1, lowRisk: 0 },
      community: [
        {
          displayTicker: "G•••",
          riskLabel: "High risk",
          score: 86,
          scannedAt: "2026-08-29T14:00:00.000Z",
        },
      ],
      notice:
        "Counts reflect completed scan records. Community high-risk tickers are masked and limited to the last 7 days.",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          riskLevel: "HIGH",
          userId: { not: "current-user" },
        }),
        take: 5,
      }),
    );
  });
});
