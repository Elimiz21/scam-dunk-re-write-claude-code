import {
  getMonitorSlotKey,
  getPlanEntitlements,
  getRiskLabel,
} from "../lib/entitlements";
import { getScanLimit } from "../lib/config";

describe("plan entitlements", () => {
  test.each([
    ["FREE", 5, 0, 1, "Free"],
    ["PAID", 50, 2, 5, "Pro"],
    ["PRO_MAX", 200, 10, 20, "Pro Max"],
  ])(
    "%s returns the approved credits and monitor slots",
    (plan, manualScanCredits, fullMonitorSlots, priceMonitorSlots, displayName) => {
      expect(getPlanEntitlements(plan)).toMatchObject({
        plan,
        manualScanCredits,
        fullMonitorSlots,
        priceMonitorSlots,
        displayName,
        savedWatchlistLimit: null,
      });
    },
  );

  test("unknown plans fail closed to Free", () => {
    expect(getPlanEntitlements("legacy-plan")).toEqual(
      getPlanEntitlements("FREE"),
    );
  });

  test("maps monitor kinds to their entitlement fields", () => {
    expect(getMonitorSlotKey("FULL")).toBe("fullMonitorSlots");
    expect(getMonitorSlotKey("PRICE")).toBe("priceMonitorSlots");
  });

  test("uses the approved 50-credit Pro entitlement even when a legacy environment override remains set", () => {
    const originalValue = process.env.PAID_CHECKS_PER_MONTH;
    process.env.PAID_CHECKS_PER_MONTH = "200";

    try {
      expect(getScanLimit("PAID")).toBe(50);
    } finally {
      if (originalValue === undefined) {
        delete process.env.PAID_CHECKS_PER_MONTH;
      } else {
        process.env.PAID_CHECKS_PER_MONTH = originalValue;
      }
    }
  });
});

describe("customer risk labels", () => {
  test.each([
    ["HIGH", "High risk"],
    ["MEDIUM", "Caution"],
    ["LOW", "Low risk"],
    ["INSUFFICIENT", "Caution"],
  ])("maps %s to %s", (riskLevel, expected) => {
    expect(getRiskLabel(riskLevel as never)).toBe(expected);
  });
});
