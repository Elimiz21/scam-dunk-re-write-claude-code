import {
  CliIngestConflictError,
  ingestCliSocialScan,
  parseCliSocialIngestPayload,
} from "@/lib/social-scan/cli-ingest";
import { getTickerCoverage, parseRunMetadata } from "@/lib/social-scan/coverage";

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

async function ingestWithMetadata(platformsUsed: unknown) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { totalMentions: 1, tickers: ["AAPL"], platforms: ["Fixture"] },
      ]),
    socialScanRun: {
      create: jest.fn().mockResolvedValue({ id: "cli-unit-run" }),
      updateMany,
    },
    socialMention: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const client = { $transaction: jest.fn(async (callback) => callback(tx)) };
  const parsed = parseCliSocialIngestPayload(payload({ platformsUsed }));
  if (!parsed.success) throw parsed.error;
  const result = await ingestCliSocialScan(client as never, parsed.data, {
    owner: "cli:test",
  });
  return { result, stored: updateMany.mock.calls[0][0].data };
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

  test("preserves source persistence losses and cannot publish them completed", async () => {
    const source = {
      ...completeCoverage,
      persistence: {
        ...completeCoverage.persistence,
        rejected: 7,
        unprocessed: 12,
        timedOut: true,
        lossTickers: ["AAPL"],
      },
    };
    const { result, stored } = await ingestWithMetadata(source);
    expect(result).toMatchObject({ status: "PARTIAL", tickersScanned: 1 });
    const raw = JSON.parse(stored.platformsUsed);
    expect(raw.sourcePersistence).toMatchObject({
      rejected: 7,
      unprocessed: 12,
      timedOut: true,
      lossTickers: ["AAPL"],
    });
    expect(raw.ingestionPersistence).toMatchObject({
      rejected: 0,
      unprocessed: 0,
      timedOut: false,
    });
    expect(raw.persistence).toMatchObject({
      rejected: 7,
      unprocessed: 12,
      timedOut: true,
    });
    expect(
      getTickerCoverage(parseRunMetadata(stored.platformsUsed), "AAPL").status,
    ).toBe("PARTIAL");
  });

  test("incomplete source readback cannot publish completed", async () => {
    const { result, stored } = await ingestWithMetadata({
      ...completeCoverage,
      readbackComplete: false,
    });
    expect(result.status).toBe("PARTIAL");
    expect(JSON.parse(stored.platformsUsed).readbackComplete).toBe(false);
  });

  test("filters searched coverage to submitted ticker subsets", async () => {
    const source = {
      ...completeCoverage,
      coverage: [
        {
          ...completeCoverage.coverage[0],
          searchedTickers: ["AAPL", "FABRICATED"],
        },
      ],
    };
    const { result, stored } = await ingestWithMetadata(source);
    expect(result).toMatchObject({ status: "PARTIAL", tickersScanned: 1 });
    expect(JSON.parse(stored.platformsUsed).coverage[0].searchedTickers).toEqual([
      "AAPL",
    ]);
    expect(
      getTickerCoverage(parseRunMetadata(stored.platformsUsed), "AAPL"),
    ).toMatchObject({ status: "PARTIAL", evidenceIncomplete: true });
  });

  test("does not count searched tickers that were never attempted", async () => {
    const source = {
      ...completeCoverage,
      coverage: [
        {
          ...completeCoverage.coverage[0],
          attemptedTickers: [],
        },
      ],
    };
    const { result, stored } = await ingestWithMetadata(source);
    expect(result).toMatchObject({ status: "PARTIAL", tickersScanned: 0 });
    const parsed = parseRunMetadata(stored.platformsUsed);
    expect(parsed.coverage[0]).toMatchObject({
      status: "PARTIAL",
      searchedTickers: [],
      validationFailedTickers: ["AAPL"],
    });
    expect(getTickerCoverage(parsed, "AAPL")).toMatchObject({
      status: "PARTIAL",
      evidenceIncomplete: true,
      incompletePlatforms: ["Fixture"],
    });
  });

  test("keeps valid ticker coverage complete when another ticker is malformed", async () => {
    const source = {
      ...completeCoverage,
      submittedTickers: ["AAPL", "MSFT"],
      coverage: [
        {
          ...completeCoverage.coverage[0],
          submittedTickers: ["AAPL", "MSFT"],
          attemptedTickers: ["AAPL"],
          searchedTickers: ["AAPL", "MSFT"],
        },
      ],
    };
    const { result, stored } = await ingestWithMetadata(source);
    expect(result).toMatchObject({ status: "PARTIAL", tickersScanned: 1 });
    const parsed = parseRunMetadata(stored.platformsUsed);
    expect(getTickerCoverage(parsed, "AAPL").status).toBe("COMPLETE");
    expect(getTickerCoverage(parsed, "MSFT")).toMatchObject({
      status: "PARTIAL",
      evidenceIncomplete: true,
    });
  });
});
