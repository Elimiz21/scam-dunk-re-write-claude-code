jest.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: jest.fn() },
  whatsAppIdentityBinding: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
} }));
jest.mock("@/lib/whatsapp/crypto", () => ({ decryptWhatsAppData: jest.fn(() => "+972504975755"), encryptWhatsAppData: jest.fn(() => "encrypted") }));
jest.mock("@/lib/whatsapp/security", () => ({
  hashWhatsAppIdentity: jest.fn(() => "identity-hash"),
  hashWhatsAppVerificationCode: jest.fn(() => "code-hash"),
  normalizeWhatsAppPhoneNumber: jest.fn((value) => value),
}));
jest.mock("@/lib/whatsapp/entitlement", () => ({ decideWhatsAppScanEntitlement: jest.fn(() => ({ allowed: true })) }));
jest.mock("@/lib/whatsapp/provider", () => ({ sendWhatsAppVerificationCode: jest.fn() }));
import { prisma } from "@/lib/db";
import { beginWhatsAppBinding, getWhatsAppBindingStatus, getPendingWhatsAppVerification } from "@/lib/whatsapp/binding";
import { sendWhatsAppVerificationCode } from "@/lib/whatsapp/provider";
const db = prisma.whatsAppIdentityBinding as unknown as Record<string, jest.Mock>;

describe("WhatsApp pending verification recovery", () => {
  beforeEach(() => jest.resetAllMocks());
  it("restores another browser's pending step using only masked metadata", async () => {
    const expiry = new Date(Date.now() + 600000);
    db.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      identityEncrypted: "encrypted", verificationCodeHash: "secret-hash", verificationExpiresAt: expiry,
      lastVerificationSentAt: new Date(),
    });
    // resetAllMocks clears the decrypt implementation too.
    const crypto = jest.requireMock("@/lib/whatsapp/crypto");
    crypto.decryptWhatsAppData.mockReturnValue("+972504975755");
    const result = await getWhatsAppBindingStatus("user-a");
    expect(result).toEqual({ active: false, pending: true, maskedPhone: "+97••••55", expiresAt: expiry.toISOString(), retryAt: expect.any(String) });
    expect(JSON.stringify(result)).not.toMatch(/secret-hash|encrypted|504975755/);
    expect(db.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      userId: "user-a", active: false, verificationCodeHash: { not: null },
    }) }));
  });
  it("does not show a pending challenge when no live challenge is available", async () => {
    db.findFirst.mockResolvedValue(null);
    await expect(getPendingWhatsAppVerification("user-a")).resolves.toBeNull();
  });
  it.each([
    { verificationExpiresAt: new Date(Date.now() - 1000) },
    { verificationAttempts: 5 },
    { revokedAt: new Date() },
  ])("does not restore expired, exhausted or revoked challenges: %j", async (overrides) => {
    db.findFirst.mockResolvedValue({ verificationExpiresAt: new Date(Date.now() + 600000), lastVerificationSentAt: new Date(), verificationAttempts: 0, ...overrides });
    await expect(getPendingWhatsAppVerification("user-a")).resolves.toBeNull();
  });
  it("clears only its own failed send so a rejected delivery cannot appear resumable", async () => {
    jest.requireMock("@/lib/whatsapp/entitlement").decideWhatsAppScanEntitlement.mockReturnValue({ allowed: true });
    const security = jest.requireMock("@/lib/whatsapp/security");
    security.normalizeWhatsAppPhoneNumber.mockReturnValue("+972504975755");
    security.hashWhatsAppIdentity.mockReturnValue("identity-hash");
    security.hashWhatsAppVerificationCode.mockReturnValue("code-hash");
    (sendWhatsAppVerificationCode as jest.Mock).mockRejectedValue(new Error("provider rejected"));
    await expect(beginWhatsAppBinding("user-a", "+972504975755")).resolves.toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-a", identityHash: "identity-hash", active: false, verificationCodeHash: "code-hash" },
      data: { verificationCodeHash: null, verificationExpiresAt: null, lastVerificationSentAt: null },
    });
  });
});
