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
    expect(
      plan.batches.map((batch) => batch.map((group) => group.key)),
    ).toEqual([["HIGH"], ["MID"]]);
    expect(plan.modelCallUpperBound).toBe(2);
  });
});

describe("parseNewsAnalysisResponse", () => {
  it("preserves returned classifications and identifies only omitted symbols", () => {
    let parseNewsAnalysisResponse:
      undefined | ((symbols: string[], payload: unknown) => any);
    try {
      ({ parseNewsAnalysisResponse } = require("./news-analysis-response"));
    } catch {
      parseNewsAnalysisResponse = undefined;
    }
    expect(typeof parseNewsAnalysisResponse).toBe("function");

    const parsed = parseNewsAnalysisResponse!(["AAA", "BBB"], {
      results: [
        {
          symbol: "AAA",
          hasLegitimateNews: true,
          explanation: "Filed earnings results",
          specificEvent: "Q2 earnings",
        },
      ],
    });

    expect(parsed.results.get("AAA")).toEqual({
      hasLegitimateNews: true,
      analysis: "Filed earnings results Event: Q2 earnings",
    });
    expect(parsed.missingSymbols).toEqual(["BBB"]);
  });

  it("rejects unexpected or duplicate symbols", () => {
    let parseNewsAnalysisResponse:
      undefined | ((symbols: string[], payload: unknown) => any);
    try {
      ({ parseNewsAnalysisResponse } = require("./news-analysis-response"));
    } catch {
      parseNewsAnalysisResponse = undefined;
    }
    expect(typeof parseNewsAnalysisResponse).toBe("function");

    expect(() =>
      parseNewsAnalysisResponse!(["AAA"], {
        results: [{ symbol: "OTHER", hasLegitimateNews: false }],
      }),
    ).toThrow("unexpected or duplicate symbol");
  });
});
