import { reconcileStaleSocialRuns } from "@/lib/social-scan/stale-run-cleanup";

describe("stale social scan evidence recovery", () => {
  test("reconciles retained evidence without fabricating searched ticker counts", async () => {
    const staleThreshold = new Date("2096-09-16T11:50:00.000Z");
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: "run-with-evidence",
          errors: JSON.stringify(["Original provider warning"]),
          platformsUsed: JSON.stringify({
            version: 2,
            scanners: ["youtube_api"],
            customAuditMarker: "preserve-me",
          }),
        },
        {
          id: "run-without-evidence",
          errors: "legacy unparseable error",
          platformsUsed: JSON.stringify(["reddit_public"]),
        },
      ])
      .mockResolvedValueOnce([
        {
          scanRunId: "run-with-evidence",
          totalMentions: 3,
          tickers: ["AAPL", "MSFT"],
          platforms: ["Reddit", "YouTube"],
        },
      ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transactionClient = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: query,
      socialScanRun: { updateMany },
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transactionClient)),
    };

    const result = await reconcileStaleSocialRuns(client as never, {
      now: new Date("2096-09-16T12:00:00.000Z"),
    });

    expect(result).toEqual({ expired: 2, partial: 1, timedOut: 1 });
    expect(query.mock.calls[0][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(query.mock.calls[0][1]).toEqual(staleThreshold);

    const evidenceUpdate = updateMany.mock.calls[0][0];
    expect(evidenceUpdate.where).toEqual({
      id: "run-with-evidence",
      status: "RUNNING",
      updatedAt: { lt: staleThreshold },
    });
    expect(evidenceUpdate.data).toMatchObject({
      status: "PARTIAL",
      totalMentions: 3,
      tickersWithMentions: 2,
    });
    expect(evidenceUpdate.data).not.toHaveProperty("tickersScanned");
    expect(JSON.parse(evidenceUpdate.data.errors)).toEqual([
      "Original provider warning",
      expect.stringContaining("retained evidence"),
    ]);
    expect(JSON.parse(evidenceUpdate.data.platformsUsed)).toMatchObject({
      version: 2,
      scanners: ["youtube_api"],
      customAuditMarker: "preserve-me",
      staleRunRecovery: {
        coverageStatus: "UNKNOWN",
        retainedMentions: 3,
        retainedTickers: ["AAPL", "MSFT"],
        retainedPlatforms: ["Reddit", "YouTube"],
      },
    });

    const emptyUpdate = updateMany.mock.calls[1][0];
    expect(emptyUpdate.data).toMatchObject({
      status: "TIMED_OUT",
      totalMentions: 0,
      tickersWithMentions: 0,
    });
    expect(JSON.parse(emptyUpdate.data.errors)).toEqual([
      "legacy unparseable error",
      expect.stringContaining("no retained evidence"),
    ]);
    expect(JSON.parse(emptyUpdate.data.platformsUsed)).toMatchObject({
      legacyPlatformsUsed: ["reddit_public"],
      scanners: ["reddit_public"],
      staleRunRecovery: {
        coverageStatus: "UNKNOWN",
        retainedMentions: 0,
        retainedTickers: [],
        retainedPlatforms: [],
      },
    });
  });

  test("does not report rows that lost the RUNNING fence", async () => {
    const transactionClient = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          { id: "already-finalized", errors: null, platformsUsed: null },
        ])
        .mockResolvedValueOnce([]),
      socialScanRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transactionClient)),
    };

    await expect(
      reconcileStaleSocialRuns(client as never, {
        now: new Date("2096-09-16T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ expired: 0, partial: 0, timedOut: 0 });
  });
});
