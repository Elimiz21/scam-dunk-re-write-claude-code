describe("social scan planning", () => {
  it("splits deployed API work into bounded batches", () => {
    let chunkSocialTargets:
      undefined | ((items: number[], size: number) => number[][]);
    try {
      ({ chunkSocialTargets } = require("./social-scan-plan"));
    } catch {
      chunkSocialTargets = undefined;
    }
    expect(typeof chunkSocialTargets).toBe("function");

    const batches = chunkSocialTargets!(
      Array.from({ length: 25 }, (_, index) => index),
      10,
    );

    expect(batches.map((batch) => batch.length)).toEqual([10, 10, 5]);
  });

  it("marks partial deployed batches degraded and reports actual coverage", () => {
    let summarizeSocialBatches:
      undefined | ((eligible: number, selected: number, batches: any[]) => any);
    try {
      ({ summarizeSocialBatches } = require("./social-scan-plan"));
    } catch {
      summarizeSocialBatches = undefined;
    }
    expect(typeof summarizeSocialBatches).toBe("function");

    const summary = summarizeSocialBatches!(100, 20, [
      {
        status: "COMPLETED",
        requestedTickers: 10,
        tickersScanned: 10,
        tickersWithMentions: 3,
        totalMentions: 8,
        errors: [],
      },
      {
        status: "PARTIAL",
        requestedTickers: 10,
        tickersScanned: 8,
        tickersWithMentions: 1,
        totalMentions: 2,
        errors: ["scanner timed out"],
      },
    ]);

    expect(summary.status).toBe("degraded");
    expect(summary.eligibleTickers).toBe(100);
    expect(summary.selectedTickers).toBe(20);
    expect(summary.tickersSubmitted).toBe(18);
    expect(summary.tickersCompleted).toBe(10);
    expect(summary.errors).toEqual(["scanner timed out"]);
  });
});
