const mockPrisma = {
  socialMention: {
    createMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  socialScanRun: { update: jest.fn() },
};
const mockGetConfiguredFreeScanners = jest.fn();
const mockGetPerplexityScanner = jest.fn();
const mockScreenMentionsWithAI = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/social-scan/scanners", () => ({
  getConfiguredFreeScanners: mockGetConfiguredFreeScanners,
  getPerplexityScanner: mockGetPerplexityScanner,
}));
jest.mock("@/lib/social-scan/ai-screener", () => ({
  screenMentionsWithAI: mockScreenMentionsWithAI,
}));
jest.mock("@/lib/social-scan/get-scan-targets", () => ({
  getScanTargetsFromLatestDailyScan: jest.fn(),
}));

import { parseRunMetadata } from "@/lib/social-scan/coverage";
import { runSocialScanAndStore } from "@/lib/social-scan/orchestrate";
import type { SocialMention } from "@/lib/social-scan/types";

function mention(overrides: Partial<SocialMention> = {}): SocialMention {
  return {
    platform: "StockTwits",
    source: "fixture",
    discoveredVia: "fixture_scanner",
    title: `${"a".repeat(499)}😀tail`,
    content: "AAPL bad\ud800text\u0000 preserved",
    url: "https://example.test/AAPL",
    author: "fixture",
    postDate: "2026-09-16T00:00:00.000Z",
    engagement: {},
    sentiment: "neutral",
    isPromotional: false,
    promotionScore: 0,
    redFlags: [],
    ...overrides,
  };
}

describe("social scan orchestration durability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPerplexityScanner.mockReturnValue(null);
    mockScreenMentionsWithAI.mockImplementation(async (mentions) => mentions);
    mockPrisma.socialScanRun.update.mockResolvedValue({});
    mockPrisma.socialMention.count.mockResolvedValue(1);
    mockPrisma.socialMention.updateMany.mockResolvedValue({ count: 1 });
  });

  test("sanitizes persisted evidence and finalizes PARTIAL with rejected-row and platform coverage accounting", async () => {
    mockGetConfiguredFreeScanners.mockReturnValue([
      {
        name: "fixture_scanner",
        scan: jest.fn().mockResolvedValue([
          {
            platform: "StockTwits",
            scanner: "fixture_scanner",
            success: false,
            error: "MSFT rate limited",
            mentionsFound: 2,
            mentions: [mention(), mention({ title: "reject me", url: "https://example.test/AAPL/2" })],
            activityLevel: "low",
            promotionRisk: "low",
            scanDuration: 1,
            coverage: {
              scanner: "fixture_scanner",
              platform: "StockTwits",
              status: "PARTIAL",
              submittedTickers: ["AAPL", "MSFT"],
              attemptedTickers: ["AAPL", "MSFT"],
              searchedTickers: ["AAPL"],
              failedTickers: ["MSFT"],
              rateLimitedTickers: ["MSFT"],
              skippedTickers: [],
            },
          },
        ]),
      },
    ]);
    mockPrisma.socialMention.createMany.mockImplementation(async ({ data }) => {
      const rows = data as Array<{ title: string | null }>;
      if (rows.some((row) => row.title === "reject me")) {
        const error = new Error("invalid row fixture");
        (error as Error & { code?: string }).code = "P2000";
        throw error;
      }
      return { count: rows.length };
    });

    const result = await runSocialScanAndStore({
      scanRunId: "run-1",
      triggeredBy: "test",
      manualTickers: [
        { ticker: "AAPL", name: "Apple", riskScore: 90, riskLevel: "HIGH", signals: [] },
        { ticker: "MSFT", name: "Microsoft", riskScore: 80, riskLevel: "HIGH", signals: [] },
      ],
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.results.find((entry) => entry.ticker === "MSFT")?.summary).toBe(
      "No mentions were retained for MSFT. Coverage is incomplete, so this does not establish that promotion was absent.",
    );
    const persistedRows = mockPrisma.socialMention.createMany.mock.calls
      .flatMap(([input]) => input.data) as Array<{ title: string | null; content: string | null }>;
    const validRow = persistedRows.find((row) => row.title?.endsWith("😀"));
    expect(validRow?.content).toBe("AAPL bad�text preserved");

    const finalUpdate = mockPrisma.socialScanRun.update.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.status).toBe("PARTIAL");
    const metadata = parseRunMetadata(finalUpdate.data.platformsUsed);
    expect(metadata.submittedTickers).toEqual(["AAPL", "MSFT"]);
    expect(metadata.coverage[0]).toMatchObject({
      searchedTickers: ["AAPL"],
      rateLimitedTickers: ["MSFT"],
    });
    expect(metadata.persistence).toMatchObject({
      inserted: 1,
      rejected: 1,
      unprocessed: 0,
    });
    expect(JSON.parse(finalUpdate.data.errors)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("MSFT rate limited"),
        expect.stringContaining("1 mention row rejected"),
      ]),
    );
  });

  test("finalizes FAILED when every scanner times out instead of leaving RUNNING", async () => {
    mockGetConfiguredFreeScanners.mockReturnValue([
      {
        name: "timeout_scanner",
        scan: jest.fn().mockRejectedValue(new Error("fixture timeout")),
      },
    ]);

    const result = await runSocialScanAndStore({
      scanRunId: "run-timeout",
      triggeredBy: "test",
      manualTickers: [
        { ticker: "AAPL", name: "Apple", riskScore: 90, riskLevel: "HIGH", signals: [] },
      ],
    });

    expect(result.status).toBe("FAILED");
    expect(mockPrisma.socialScanRun.update.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        where: { id: "run-timeout" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  test("finalizes COMPLETED when configured searches finish successfully with zero mentions", async () => {
    mockPrisma.socialMention.count.mockResolvedValue(0);
    mockGetConfiguredFreeScanners.mockReturnValue([
      {
        name: "empty_fixture_scanner",
        scan: jest.fn().mockResolvedValue([
          {
            platform: "StockTwits",
            scanner: "empty_fixture_scanner",
            success: true,
            mentionsFound: 0,
            mentions: [],
            activityLevel: "none",
            promotionRisk: "low",
            scanDuration: 1,
            coverage: {
              scanner: "empty_fixture_scanner",
              platform: "StockTwits",
              status: "COMPLETED",
              submittedTickers: ["AAPL"],
              attemptedTickers: ["AAPL"],
              searchedTickers: ["AAPL"],
              failedTickers: [],
              rateLimitedTickers: [],
              skippedTickers: [],
            },
          },
        ]),
      },
    ]);

    const result = await runSocialScanAndStore({
      scanRunId: "run-empty-success",
      triggeredBy: "test",
      manualTickers: [
        { ticker: "AAPL", name: "Apple", riskScore: 90, riskLevel: "HIGH", signals: [] },
      ],
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.results[0].summary).toContain(
      "completed configured platform searches",
    );
  });
});
