import { createNewsAnalysisPlan } from "./news-analysis-plan";

describe("createNewsAnalysisPlan", () => {
  it("deduplicates identical normalized tickers before applying the model cap", () => {
    const a = { symbol: "ab c", totalScore: 8 };
    const b = { symbol: "ABC", totalScore: 4 };
    const c = { symbol: "XYZ", totalScore: 7 };

    const plan = createNewsAnalysisPlan([a, b, c], 2, 2);

    expect(plan.selected).toHaveLength(2);
    expect(plan.selected[0].key).toBe("ABC");
    expect(plan.selected[0].equivalents).toEqual([a, b]);
    expect(plan.batches).toHaveLength(1);
    expect(plan.modelCallUpperBound).toBe(1);
  });

  it("prioritizes highest deterministic risk and leaves capped candidates unclassified", () => {
    const plan = createNewsAnalysisPlan(
      [
        { symbol: "LOW", totalScore: 5 },
        { symbol: "HIGH", totalScore: 9 },
        { symbol: "MID", totalScore: 7 },
      ],
      2,
      1,
    );

    expect(plan.selected.map((group) => group.key)).toEqual(["HIGH", "MID"]);
    expect(plan.deferred.map((group) => group.key)).toEqual(["LOW"]);
    expect(plan.batches.map((batch) => batch.map((group) => group.key))).toEqual([
      ["HIGH"],
      ["MID"],
    ]);
    expect(plan.modelCallUpperBound).toBe(2);
  });

  it("selects explicit replay symbols first while preserving punctuation and the cap", () => {
    const plan = createNewsAnalysisPlan(
      [
        { symbol: "LOW", totalScore: 2 },
        { symbol: "BRK.A", totalScore: 1 },
        { symbol: "BRK.B", totalScore: 99 },
        { symbol: "REPLAY", totalScore: 0 },
      ],
      2,
      10,
      [" replay ", "MISSING", "brk.a"],
    );

    expect(plan.selected.map((group) => group.key)).toEqual(["REPLAY", "BRK.A"]);
    expect(plan.replayMatched).toEqual(["REPLAY", "BRK.A"]);
    expect(plan.replayMissing).toEqual(["MISSING"]);
    expect(plan.deferred.map((group) => group.key)).toEqual(["BRK.B", "LOW"]);
  });
});
