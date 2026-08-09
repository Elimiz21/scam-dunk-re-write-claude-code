import { decideWhatsAppScanEntitlement } from "@/lib/whatsapp/entitlement";

const now = new Date("2026-08-09T12:00:00.000Z");

describe("decideWhatsAppScanEntitlement", () => {
  it("allows only an active binding for a paid, non-deleted user with future expiry", () => {
    expect(
      decideWhatsAppScanEntitlement(
        {
          plan: "PAID",
          deletedAt: null,
          subscriptionExpiresAt: new Date("2026-08-10T00:00:00.000Z"),
        },
        { active: true, revokedAt: null },
        now,
      ),
    ).toEqual({ allowed: true });
  });

  it.each([
    [{ plan: "FREE", deletedAt: null, subscriptionExpiresAt: new Date("2026-08-10") }, { active: true, revokedAt: null }],
    [{ plan: "PAID", deletedAt: new Date("2026-08-01"), subscriptionExpiresAt: new Date("2026-08-10") }, { active: true, revokedAt: null }],
    [{ plan: "PAID", deletedAt: null, subscriptionExpiresAt: null }, { active: true, revokedAt: null }],
    [{ plan: "PAID", deletedAt: null, subscriptionExpiresAt: new Date("2026-08-09T12:00:00.000Z") }, { active: true, revokedAt: null }],
    [{ plan: "PAID", deletedAt: null, subscriptionExpiresAt: new Date("2026-08-10") }, { active: false, revokedAt: new Date("2026-08-01") }],
  ])("denies every ambiguous or inactive state", (user, binding) => {
    expect(decideWhatsAppScanEntitlement(user, binding, now)).toEqual({
      allowed: false,
      reason: "NO_ACTIVE_ENTITLEMENT",
    });
  });
});
