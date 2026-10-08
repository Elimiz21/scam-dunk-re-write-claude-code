import {
  getMonthlyScanCreditLimit,
  getMonitorSlotKey,
  getPlanEntitlements,
  getRiskLabel,
} from "../lib/entitlements";
import { getScanLimit } from "../lib/config";

describe("plan entitlements", () => {
  test.each([
    ["FREE", 1, 1, 0, "Free"],
    ["PAID", 50, 2, 0, "Pro"],
    ["PRO_MAX", 200, 10, 0, "Pro Max"],
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

  test("maps every legacy monitor kind to the single monitoring entitlement", () => {
    expect(getMonitorSlotKey("FULL")).toBe("fullMonitorSlots");
    expect(getMonitorSlotKey("PRICE")).toBe("fullMonitorSlots");
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

  test("keeps the five-scan promise for existing free users while new free users receive one", () => {
    expect(getMonthlyScanCreditLimit("FREE", 5)).toBe(5);
    expect(getMonthlyScanCreditLimit("FREE", 1)).toBe(1);
    expect(getMonthlyScanCreditLimit("FREE")).toBe(1);
  });

  test("does not let a stored free allowance override a paid plan", () => {
    expect(getMonthlyScanCreditLimit("PAID", 5)).toBe(50);
    expect(getMonthlyScanCreditLimit("PRO_MAX", 1)).toBe(200);
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
