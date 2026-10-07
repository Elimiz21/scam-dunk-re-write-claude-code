import { decideTelegramScanEntitlement } from "@/lib/telegram/entitlement";

const activeBinding = { active: true, revokedAt: null };
const manualGrant = {
  plan: "PAID",
  billingProvider: "NONE",
  deletedAt: null,
  subscriptionExpiresAt: null,
};

describe("Telegram paid entitlement", () => {
  it("accepts an admin-granted legacy paid account", () => {
    expect(decideTelegramScanEntitlement(manualGrant, activeBinding)).toEqual({ allowed: true });
  });

  it("continues to reject free, expired, and deleted accounts", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    expect(decideTelegramScanEntitlement({ ...manualGrant, plan: "FREE" }, activeBinding, now).allowed).toBe(false);
    expect(decideTelegramScanEntitlement({ ...manualGrant, subscriptionExpiresAt: new Date("2026-10-06T10:00:00Z") }, activeBinding, now).allowed).toBe(false);
    expect(decideTelegramScanEntitlement({ ...manualGrant, deletedAt: now }, activeBinding, now).allowed).toBe(false);
  });
});
