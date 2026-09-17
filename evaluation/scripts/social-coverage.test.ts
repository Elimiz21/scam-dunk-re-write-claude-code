import {
  assessSocialPhase,
  fetchAllMentionPages,
  fetchMentionPagesWithStatus,
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

  test("retains completed pages and marks readback incomplete when a later page fails", async () => {
    const result = await fetchMentionPagesWithStatus(
      async (page) => {
        if (page === 2) throw new Error("page 2 unavailable");
        return {
          mentions: [{ id: 1 }],
          pagination: { totalPages: 2 },
          readback: { complete: true },
        };
      },
      { pageSize: 500 },
    );

    expect(result).toMatchObject({
      mentions: [{ id: 1 }],
      complete: false,
      failedPage: 2,
    });
  });

  test("degrades phase 4 when the run is partial despite full ticker search union", () => {
    expect(
      assessSocialPhase({
        runStatus: "PARTIAL",
        submitted: 50,
        searched: 50,
        persistence: {
          rejected: 0,
          unprocessed: 0,
          timedOut: false,
        },
        readbackComplete: true,
        coverage: [
          {
            platform: "YouTube",
            submittedTickers: ["AAPL"],
            searchedTickers: [],
            failedTickers: ["AAPL"],
            rateLimitedTickers: ["AAPL"],
            skippedTickers: [],
          },
        ],
      }),
    ).toBe("degraded");
  });
});
