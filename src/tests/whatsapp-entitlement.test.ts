import { decideWhatsAppScanEntitlement } from "@/lib/whatsapp/entitlement";

const now = new Date("2026-08-09T12:00:00.000Z");

describe("decideWhatsAppScanEntitlement", () => {
  const legacyPaidUser = {
    plan: "PRO",
    billingProvider: "NONE",
    deletedAt: null,
    subscriptionExpiresAt: null,
  };
  const activeBinding = { active: true, revokedAt: null };

  it.each(["PAID", "PRO", "PRO_MAX"])(
    "allows an admin-granted legacy %s account without an expiry",
    (plan) => {
      expect(decideWhatsAppScanEntitlement(
        { ...legacyPaidUser, plan }, activeBinding, now,
      )).toEqual({ allowed: true });
    },
  );

  it.each([
    ["free", { ...legacyPaidUser, plan: "FREE" }, activeBinding],
    ["deleted", { ...legacyPaidUser, deletedAt: new Date("2026-08-01") }, activeBinding],
    ["expired", { ...legacyPaidUser, subscriptionExpiresAt: new Date("2026-08-01") }, activeBinding],
    ["expires now", { ...legacyPaidUser, subscriptionExpiresAt: now }, activeBinding],
    ["inactive binding", legacyPaidUser, { ...activeBinding, active: false }],
    ["revoked binding", legacyPaidUser, { ...activeBinding, revokedAt: now }],
    ["missing user", null, activeBinding],
    ["missing binding", legacyPaidUser, null],
    ["unknown provider", { ...legacyPaidUser, billingProvider: null }, activeBinding],
  ])("denies a legacy account with %s", (_label, user, binding) => {
    expect(decideWhatsAppScanEntitlement(user, binding, now)).toEqual({
      allowed: false,
      reason: "NO_ACTIVE_ENTITLEMENT",
    });
  });

  it("allows only an active binding for a paid, non-deleted user with future expiry", () => {
    expect(
      decideWhatsAppScanEntitlement(
        {
          plan: "PAID",
          billingProvider: "PAYPAL",
          deletedAt: null,
          subscriptionExpiresAt: new Date("2026-08-10T00:00:00.000Z"),
        },
        { active: true, revokedAt: null },
        now,
      ),
    ).toEqual({ allowed: true });
  });

  it.each([
    [{ plan: "FREE", billingProvider: "NONE", deletedAt: null, subscriptionExpiresAt: new Date("2026-08-10") }, { active: true, revokedAt: null }],
    [{ plan: "PAID", billingProvider: "PAYPAL", deletedAt: new Date("2026-08-01"), subscriptionExpiresAt: new Date("2026-08-10") }, { active: true, revokedAt: null }],
    [{ plan: "PAID", billingProvider: "APPLE", deletedAt: null, subscriptionExpiresAt: null }, { active: true, revokedAt: null }],
    [{ plan: "PAID", billingProvider: "PAYPAL", deletedAt: null, subscriptionExpiresAt: new Date("2026-08-09T12:00:00.000Z") }, { active: true, revokedAt: null }],
    [{ plan: "PAID", billingProvider: "PAYPAL", deletedAt: null, subscriptionExpiresAt: new Date("2026-08-10") }, { active: false, revokedAt: new Date("2026-08-01") }],
  ])("denies every ambiguous or inactive state", (user, binding) => {
    expect(decideWhatsAppScanEntitlement(user, binding, now)).toEqual({
      allowed: false,
      reason: "NO_ACTIVE_ENTITLEMENT",
    });
  });

  it("allows an active Pro Max subscription without requiring an expiry timestamp", () => {
    expect(
      decideWhatsAppScanEntitlement(
        { plan: "PRO_MAX", billingProvider: "PAYPAL", deletedAt: null, subscriptionExpiresAt: null },
        { active: true, revokedAt: null },
        now,
      ),
    ).toEqual({ allowed: true });
  });
});
