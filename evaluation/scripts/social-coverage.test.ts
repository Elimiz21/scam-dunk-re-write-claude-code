import {
  fetchAllMentionPages,
  getTickerCoverage,
  type SocialRunMetadata,
} from "./social-coverage";

describe("daily pipeline social coverage readback", () => {
  test("keeps partial coverage distinct from a completed negative", () => {
    const metadata: SocialRunMetadata = {
      submittedTickers: ["AAPL", "MSFT"],
      coverage: [
        {
          platform: "StockTwits",
          submittedTickers: ["AAPL", "MSFT"],
          searchedTickers: ["AAPL"],
          failedTickers: ["MSFT"],
          rateLimitedTickers: ["MSFT"],
          skippedTickers: [],
        },
      ],
    };

    expect(getTickerCoverage(metadata, "AAPL").status).toBe("COMPLETE");
    expect(getTickerCoverage(metadata, "MSFT")).toEqual({
      status: "NOT_SEARCHED",
      searchedPlatforms: [],
      incompletePlatforms: ["StockTwits"],
      rateLimitedPlatforms: ["StockTwits"],
    });
    expect(getTickerCoverage(metadata, "NVDA").status).toBe("NOT_TARGETED");
  });

  test("reads all pages when a run has more than 500 mentions", async () => {
    const rows = Array.from({ length: 613 }, (_, index) => ({ id: index }));
    const fetchPage = jest.fn(async (page: number, limit: number) => ({
      mentions: rows.slice((page - 1) * limit, page * limit),
      pagination: { totalPages: Math.ceil(rows.length / limit) },
    }));

    const mentions = await fetchAllMentionPages(fetchPage, { pageSize: 500 });

    expect(mentions).toHaveLength(613);
    expect(fetchPage.mock.calls).toEqual([[1, 500], [2, 500]]);
  });
});
