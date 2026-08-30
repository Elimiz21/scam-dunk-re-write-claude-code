import { usagePercent } from "@/lib/account-usage";

describe("usagePercent", () => {
  test("treats a missing usage payload as zero usage", () => {
    expect(usagePercent(null, 200)).toBe(0);
  });

  test("caps usage at the configured monthly limit", () => {
    expect(usagePercent({ scansUsedThisMonth: 250 }, 200)).toBe(100);
  });
});
