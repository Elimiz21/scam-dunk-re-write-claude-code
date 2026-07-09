import {
  classifyAlertTransition,
  RISK_INCREASE_THRESHOLD,
} from "@/lib/admin/ingest-evaluation-core";

describe("classifyAlertTransition (P0-5: stateful alert generation)", () => {
  it("never alerts on a non-HIGH stock", () => {
    expect(classifyAlertTransition(undefined, "LOW", 0)).toBeNull();
    expect(classifyAlertTransition(undefined, "MEDIUM", 3)).toBeNull();
    expect(
      classifyAlertTransition({ riskLevel: "HIGH", totalScore: 9 }, "MEDIUM", 3),
    ).toBeNull();
  });

  it("emits NEW_HIGH_RISK the first time a stock is seen as HIGH", () => {
    expect(classifyAlertTransition(undefined, "HIGH", 6)).toBe("NEW_HIGH_RISK");
  });

  it("emits NEW_HIGH_RISK when a stock crosses into HIGH from a lower level", () => {
    expect(
      classifyAlertTransition({ riskLevel: "LOW", totalScore: 1 }, "HIGH", 6),
    ).toBe("NEW_HIGH_RISK");
    expect(
      classifyAlertTransition({ riskLevel: "MEDIUM", totalScore: 3 }, "HIGH", 7),
    ).toBe("NEW_HIGH_RISK");
  });

  it("does NOT re-alert a stock that stays HIGH without a material change (the spam bug)", () => {
    // Same score, next day → no alert (previously produced a fresh
    // NEW_HIGH_RISK every single day).
    expect(
      classifyAlertTransition({ riskLevel: "HIGH", totalScore: 7 }, "HIGH", 7),
    ).toBeNull();
    // A small climb below the threshold → still no alert.
    expect(
      classifyAlertTransition(
        { riskLevel: "HIGH", totalScore: 7 },
        "HIGH",
        7 + RISK_INCREASE_THRESHOLD - 1,
      ),
    ).toBeNull();
    // A drop while still HIGH → no alert.
    expect(
      classifyAlertTransition({ riskLevel: "HIGH", totalScore: 12 }, "HIGH", 8),
    ).toBeNull();
  });

  it("emits RISK_INCREASED when an already-HIGH stock's score climbs materially", () => {
    expect(
      classifyAlertTransition(
        { riskLevel: "HIGH", totalScore: 5 },
        "HIGH",
        5 + RISK_INCREASE_THRESHOLD,
      ),
    ).toBe("RISK_INCREASED");
    expect(
      classifyAlertTransition({ riskLevel: "HIGH", totalScore: 6 }, "HIGH", 15),
    ).toBe("RISK_INCREASED");
  });
});
