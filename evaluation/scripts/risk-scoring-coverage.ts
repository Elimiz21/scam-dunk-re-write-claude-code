/** Required listed-data coverage is independent of the supplemental OTC scan. */
export function assessRiskScoringCoverage(input: {
  listedExpected: number;
  listedEvaluated: number;
  otcStatus: string;
}): {
  status: "completed" | "degraded" | "failed";
  listedExpected: number;
  listedEvaluated: number;
  listedMissing: number;
} {
  const { listedExpected, listedEvaluated, otcStatus } = input;
  const valid =
    Number.isInteger(listedExpected) &&
    listedExpected > 0 &&
    Number.isInteger(listedEvaluated) &&
    listedEvaluated > 0 &&
    listedEvaluated <= listedExpected;
  const listedMissing = listedExpected - listedEvaluated;
  return {
    status: !valid
      ? "failed"
      : listedMissing > 0 || otcStatus !== "completed"
        ? "degraded"
        : "completed",
    listedExpected,
    listedEvaluated,
    listedMissing,
  };
}
