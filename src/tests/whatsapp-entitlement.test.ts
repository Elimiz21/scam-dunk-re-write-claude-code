import { decideWhatsAppScanEntitlement } from "@/lib/whatsapp/entitlement";

const now = new Date("2026-08-09T12:00:00.000Z");

describe("decideWhatsAppScanEntitlement", () => {
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
