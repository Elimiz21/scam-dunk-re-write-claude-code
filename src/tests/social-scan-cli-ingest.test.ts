import {
  CliIngestConflictError,
  ingestCliSocialScan,
  parseCliSocialIngestPayload,
} from "@/lib/social-scan/cli-ingest";

const completeCoverage = {
  version: 2,
  scanners: ["fixture"],
  stats: {},
  submittedTickers: ["AAPL"],
  persistence: {
    submitted: 1,
    inserted: 1,
    duplicates: 0,
    rejected: 0,
    unprocessed: 0,
    timedOut: false,
    transientRetries: 0,
  },
  coverage: [
    {
      scanner: "fixture",
      platform: "Fixture",
      status: "COMPLETED",
      submittedTickers: ["AAPL"],
      attemptedTickers: ["AAPL"],
      searchedTickers: ["AAPL"],
      failedTickers: [],
      rateLimitedTickers: [],
      skippedTickers: [],
    },
  ],
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    scanId: "cli-unit-run",
    scanDate: "2096-10-01",
    status: "COMPLETED",
    tickersScanned: 999,
    tickersWithMentions: 999,
    totalMentions: 999,
    platformsUsed: completeCoverage,
    results: [
      {
        ticker: "aapl",
        name: "Apple\u0000",
        platforms: [
          {
            mentions: [
              {
                platform: "Fixture",
                title: "broken-\ud800 emoji-😀",
                content: "valid",
                url: "https://example.test/aapl",
                postDate: "2096-10-01T01:00:00.000Z",
                engagement: { views: 5 },
                promotionScore: 20,
                redFlags: ["flag-\udfff"],
              },
            ],
          },
        ],
      },
    ],
    errors: ["original"],
    duration: 12,
    ...overrides,
  };
}

describe("CLI social ingestion", () => {
  test("rejects invalid dates, statuses, counters, and mixed invalid rows before writes", () => {
    for (const invalid of [
      payload({ scanDate: "2096-02-31" }),
      payload({ status: "RUNNING" }),
      payload({ totalMentions: -1 }),
      payload({
        results: [
          ...payload().results,
          {
            ticker: "MSFT",
            platforms: [
              {
                mentions: [
                  {
                    platform: "Fixture",
                    postDate: "not-a-date",
                    promotionScore: 101,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ]) {
      expect(parseCliSocialIngestPayload(invalid).success).toBe(false);
    }
  });

  test("sanitizes malformed Unicode and stores canonical counters atomically", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            totalMentions: 1,
            tickers: ["AAPL"],
            platforms: ["Fixture"],
          },
        ]),
      socialScanRun: {
        create: jest.fn().mockResolvedValue({ id: "cli-unit-run" }),
        updateMany,
      },
      socialMention: { createMany },
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const parsed = parseCliSocialIngestPayload(payload());
    if (!parsed.success) throw parsed.error;

    await expect(
      ingestCliSocialScan(client as never, parsed.data, { owner: "cli:test" }),
    ).resolves.toMatchObject({
      scanRunId: "cli-unit-run",
      status: "COMPLETED",
      totalMentions: 1,
      tickersWithMentions: 1,
      tickersScanned: 1,
    });
    const row = createMany.mock.calls[0][0].data[0];
    expect(row.ticker).toBe("AAPL");
    expect(row.stockName).toBe("Apple");
    expect(row.title).toBe("broken-� emoji-😀");
    expect(JSON.parse(row.redFlags)).toEqual(["flag-�"]);
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      status: "COMPLETED",
      totalMentions: 1,
      tickersWithMentions: 1,
      tickersScanned: 1,
    });
  });

  test("does not publish a terminal run after persistence failure", async () => {
    const updateMany = jest.fn();
    const createMany = jest.fn().mockRejectedValue(new Error("fixture write failed"));
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([]),
      socialScanRun: {
        create: jest.fn().mockResolvedValue({ id: "cli-unit-run" }),
        updateMany,
      },
      socialMention: {
        createMany,
      },
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const base = payload();
    const parsed = parseCliSocialIngestPayload(
      payload({
        results: [
          {
            ...base.results[0],
            platforms: [
              {
                mentions: [
                  ...base.results[0].platforms[0].mentions,
                  {
                    platform: "Fixture",
                    title: "second valid mention",
                    url: "https://example.test/aapl-2",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    if (!parsed.success) throw parsed.error;

    await expect(
      ingestCliSocialScan(client as never, parsed.data, { owner: "cli:test" }),
    ).rejects.toThrow("fixture write failed");
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  test("rejects active and terminal orchestrator-owned runs", async () => {
    const parsed = parseCliSocialIngestPayload(payload());
    if (!parsed.success) throw parsed.error;
    for (const status of ["RUNNING", "PARTIAL"]) {
      const tx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
        $queryRawUnsafe: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "cli-unit-run",
              status,
              triggeredBy: "scheduled",
              platformsUsed: null,
            },
          ]),
      };
      const client = {
        $transaction: jest.fn(async (callback) => callback(tx)),
      };
      await expect(
        ingestCliSocialScan(client as never, parsed.data, { owner: "cli:test" }),
      ).rejects.toBeInstanceOf(CliIngestConflictError);
    }
  });
});
