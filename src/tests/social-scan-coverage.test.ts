import {
  CoverageTracker,
  fetchAllMentionPages,
  getTickerCoverage,
  parseRunMetadata,
  type SocialRunMetadata,
} from "@/lib/social-scan/coverage";

const metadata: SocialRunMetadata = {
  version: 2,
  scanners: ["serper_dev", "stocktwits"],
  stats: {},
  submittedTickers: ["AAPL", "MSFT", "TSLA"],
  persistence: {
    submitted: 0,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    unprocessed: 0,
    timedOut: false,
    transientRetries: 0,
  },
  coverage: [
    {
      scanner: "serper_dev",
      platform: "Multi-Platform (Serper)",
      status: "PARTIAL",
      submittedTickers: ["AAPL", "MSFT", "TSLA"],
      attemptedTickers: ["AAPL", "MSFT"],
      searchedTickers: ["AAPL"],
      failedTickers: ["MSFT"],
      rateLimitedTickers: ["MSFT"],
      skippedTickers: ["TSLA"],
    },
    {
      scanner: "stocktwits",
      platform: "StockTwits",
      status: "COMPLETED",
      submittedTickers: ["AAPL", "MSFT", "TSLA"],
      attemptedTickers: ["AAPL", "MSFT", "TSLA"],
      searchedTickers: ["AAPL", "MSFT", "TSLA"],
      failedTickers: [],
      rateLimitedTickers: [],
      skippedTickers: [],
    },
  ],
};

describe("social ticker/platform coverage", () => {
  test("records attempted, searched, rate-limited, and deadline-skipped targets", () => {
    const tracker = new CoverageTracker(
      "serper_dev",
      "Multi-Platform (Serper)",
      ["AAPL", "MSFT", "TSLA"],
    );
    tracker.attempt("AAPL");
    tracker.searched("AAPL");
    tracker.attempt("MSFT");
    tracker.failed("MSFT", { rateLimited: true, error: "HTTP 429" });

    expect(tracker.finish()).toEqual({
      scanner: "serper_dev",
      platform: "Multi-Platform (Serper)",
      status: "PARTIAL",
      submittedTickers: ["AAPL", "MSFT", "TSLA"],
      attemptedTickers: ["AAPL", "MSFT"],
      searchedTickers: ["AAPL"],
      failedTickers: ["MSFT"],
      rateLimitedTickers: ["MSFT"],
      skippedTickers: ["TSLA"],
      error: "HTTP 429",
    });
  });

  test("distinguishes complete, partial, unsearched, and untargeted tickers", () => {
    expect(getTickerCoverage(metadata, "AAPL")).toMatchObject({
      status: "COMPLETE",
      searchedPlatforms: ["Multi-Platform (Serper)", "StockTwits"],
      incompletePlatforms: [],
    });
    expect(getTickerCoverage(metadata, "MSFT")).toMatchObject({
      status: "PARTIAL",
      searchedPlatforms: ["StockTwits"],
      incompletePlatforms: ["Multi-Platform (Serper)"],
      rateLimitedPlatforms: ["Multi-Platform (Serper)"],
    });
    expect(getTickerCoverage(metadata, "TSLA")).toMatchObject({
      status: "PARTIAL",
      searchedPlatforms: ["StockTwits"],
      incompletePlatforms: ["Multi-Platform (Serper)"],
    });
    expect(getTickerCoverage(metadata, "NVDA")).toMatchObject({
      status: "NOT_TARGETED",
      searchedPlatforms: [],
    });
  });

  test("treats legacy scanner arrays as unknown coverage instead of a negative result", () => {
    const parsed = parseRunMetadata('["stocktwits"]');

    expect(parsed.scanners).toEqual(["stocktwits"]);
    expect(getTickerCoverage(parsed, "AAPL").status).toBe("UNKNOWN");
  });

  test("reads every mention page beyond the old 500-row ceiling", async () => {
    const records = Array.from({ length: 613 }, (_, index) => ({
      id: `mention-${index}`,
      ticker: index % 2 === 0 ? "AAPL" : "MSFT",
    }));
    const fetchPage = jest.fn(async (page: number, limit: number) => ({
      mentions: records.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total: records.length,
        totalPages: Math.ceil(records.length / limit),
      },
    }));

    const result = await fetchAllMentionPages(fetchPage, { pageSize: 200 });

    expect(result).toHaveLength(613);
    expect(result[612].id).toBe("mention-612");
    expect(fetchPage.mock.calls).toEqual([
      [1, 200],
      [2, 200],
      [3, 200],
      [4, 200],
    ]);
  });
});
