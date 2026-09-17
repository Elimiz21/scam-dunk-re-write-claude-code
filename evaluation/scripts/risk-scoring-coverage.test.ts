import { assessRiskScoringCoverage } from "./risk-scoring-coverage";

describe("mandatory listed risk scoring coverage", () => {
  test("OTC success cannot conceal a total listed-data failure", () => {
    expect(
      assessRiskScoringCoverage({
        listedExpected: 10,
        listedEvaluated: 0,
        otcStatus: "completed",
      }).status,
    ).toBe("failed");
  });
  test("a partial listed acquisition is explicitly degraded", () => {
    expect(
      assessRiskScoringCoverage({
        listedExpected: 10,
        listedEvaluated: 9,
        otcStatus: "completed",
      }),
    ).toEqual({
      status: "degraded",
      listedExpected: 10,
      listedEvaluated: 9,
      listedMissing: 1,
    });
  });
  test("OTC degradation remains visible despite complete listed coverage", () => {
    expect(
      assessRiskScoringCoverage({
        listedExpected: 10,
        listedEvaluated: 10,
        otcStatus: "failed",
      }).status,
    ).toBe("degraded");
  });
  test("only complete listed and OTC coverage reports complete", () => {
    expect(
      assessRiskScoringCoverage({
        listedExpected: 10,
        listedEvaluated: 10,
        otcStatus: "completed",
      }).status,
    ).toBe("completed");
  });
  test.each([
    [0, 0],
    [2, 3],
    [NaN, 2],
    [2, -1],
  ])(
    "invalid or empty counts fail closed (%s,%s)",
    (listedExpected, listedEvaluated) => {
      expect(
        assessRiskScoringCoverage({
          listedExpected,
          listedEvaluated,
          otcStatus: "completed",
        }).status,
      ).toBe("failed");
    },
  );
});
