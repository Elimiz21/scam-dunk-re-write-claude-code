const mockCreate = jest.fn();

jest.mock("@/lib/config", () => ({
  config: { openaiApiKey: "offline-test-key" },
}));
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { screenMentionsWithAI } from "@/lib/social-scan/ai-screener";
import type { SocialMention } from "@/lib/social-scan/types";

function aiMention(index: number): SocialMention {
  return {
    platform: "StockTwits",
    source: "fixture",
    discoveredVia: "fixture",
    title: `AAPL ${index}`,
    content: "promotional fixture",
    url: `https://example.test/${index}`,
    author: "fixture",
    postDate: "2026-09-16T00:00:00.000Z",
    engagement: {},
    sentiment: "neutral",
    isPromotional: true,
    promotionScore: 80,
    redFlags: ["fixture"],
  };
}

describe("AI social screening cancellation", () => {
  test("does not retry or schedule later batches after abort", async () => {
    const controller = new AbortController();
    mockCreate.mockImplementation(
      async (_body: unknown, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(options.signal?.reason || new Error("aborted")),
          );
        }),
    );

    const screening = screenMentionsWithAI(
      Array.from({ length: 60 }, (_, index) => aiMention(index)),
      { signal: controller.signal, deadlineAt: Date.now() + 5_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(new Error("fixture deadline"));
    await screening;

    expect(mockCreate).toHaveBeenCalledTimes(5);
  });
});
