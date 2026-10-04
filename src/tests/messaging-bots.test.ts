import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { googleCredentials, isVerifiedGoogleProfile } from "@/lib/google-auth";
import { verifyTelegramWebhookSecret, hashTelegramIdentity } from "@/lib/telegram/security";
import { encryptTelegramData, decryptTelegramData } from "@/lib/telegram/crypto";
import { sendWhatsAppVerificationCode } from "@/lib/whatsapp/provider";
import { sendTelegramTextReply } from "@/lib/telegram/provider";

const mockPrisma = {
  telegramInboundEvent: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  telegramIdentityBinding: { findUnique: jest.fn() },
};
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/rate-limit", () => ({ rateLimit: jest.fn(async () => ({ success: true })) }));
jest.mock("@/lib/check-scan", () => ({ runAuthorizedStockScan: jest.fn() }));
jest.mock("@/lib/telegram/binding", () => ({ confirmTelegramBinding: jest.fn() }));
jest.mock("@/lib/telegram/entitlement", () => ({ resolveTelegramScanEntitlement: jest.fn() }));
import { POST } from "@/app/api/webhooks/telegram/route";
import { processTelegramInboundEvent } from "@/lib/telegram/processor";
import { runAuthorizedStockScan } from "@/lib/check-scan";
import { confirmTelegramBinding } from "@/lib/telegram/binding";
import { resolveTelegramScanEntitlement } from "@/lib/telegram/entitlement";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const update = { update_id: 123, message: { message_id: 1, from: { id: 456, is_bot: false }, chat: { id: 456, type: "private" }, text: "AAPL" } };
function request(body: unknown = update, secret = "s".repeat(32)) {
  return new NextRequest("http://localhost/api/webhooks/telegram", { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(body) });
}
function event(overrides: object = {}) {
  return { id: "event", status: "RECEIVED", updatedAt: new Date(), messageType: "text", encryptedText: encryptTelegramData("AAPL"), senderIdentityEncrypted: encryptTelegramData("456"), senderIdentityHash: "hash", binding: { active: true, revokedAt: null, userId: "user" }, ...overrides };
}
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_BOT_USERNAME: "scamdunk_test_bot", TELEGRAM_WEBHOOK_SECRET: "s".repeat(32), TELEGRAM_ENCRYPTION_KEY: "encrypt-test", TELEGRAM_IDENTITY_HASH_KEY: "hash-test", WHATSAPP_ACCESS_TOKEN: "test-token", WHATSAPP_PHONE_NUMBER_ID: "test-number", WHATSAPP_VERIFICATION_TEMPLATE: "verify" });
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 99 }, messages: [{ id: "wa-reply" }] }), { status: 200 }));
  mockPrisma.telegramIdentityBinding.findUnique.mockResolvedValue(null);
  mockPrisma.telegramInboundEvent.create.mockResolvedValue({ id: "event" });
  mockPrisma.telegramInboundEvent.findUnique.mockResolvedValue(event());
  mockPrisma.telegramInboundEvent.update.mockResolvedValue({});
  mockPrisma.telegramInboundEvent.updateMany.mockResolvedValue({ count: 1 });
  jest.mocked(resolveTelegramScanEntitlement).mockResolvedValue({ allowed: true });
  jest.mocked(runAuthorizedStockScan).mockResolvedValue({ ok: true, status: 200, body: { riskLevel: "LOW", narrative: { header: "No elevated signals." } } } as never);
});
afterAll(() => { process.env = originalEnv; global.fetch = originalFetch; });

describe("Google identity policy", () => {
  it("requires both OAuth credentials and supports Auth.js variable names", () => {
    delete process.env.AUTH_GOOGLE_ID; delete process.env.AUTH_GOOGLE_SECRET; delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
    expect(googleCredentials()).toBeNull();
    process.env.AUTH_GOOGLE_ID = "client";
    expect(googleCredentials()).toBeNull();
    process.env.AUTH_GOOGLE_SECRET = "secret";
    expect(googleCredentials()).toEqual({ clientId: "client", clientSecret: "secret" });
  });
  it("rejects unverified, missing, and string-valued email claims", () => {
    expect(isVerifiedGoogleProfile({ email: "person@example.com", email_verified: true })).toBe(true);
    for (const profile of [undefined, { email: "person@example.com" }, { email: "person@example.com", email_verified: "true" }, { email: "", email_verified: true }])
      expect(isVerifiedGoogleProfile(profile)).toBe(false);
  });
});
describe("provider boundaries", () => {
  it("sends the WhatsApp authentication code in both body and URL button", async () => {
    await sendWhatsAppVerificationCode("+12125550199", "123456");
    const body = JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.to).toBe("12125550199");
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "123456" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
    ]);
  });
  it("rejects Telegram API failures even on HTTP 200", async () => {
    global.fetch = jest.fn(async () => new Response('{"ok":false}'));
    await expect(sendTelegramTextReply("456", "hello")).rejects.toThrow("TELEGRAM_SEND_FAILED");
  });
  it("authenticates the webhook with constant-time byte comparisons", () => {
    expect(verifyTelegramWebhookSecret("s".repeat(32))).toBe(true);
    expect(verifyTelegramWebhookSecret("é".repeat(32))).toBe(false);
    expect(verifyTelegramWebhookSecret(null)).toBe(false);
  });
  it("encrypts private identities and detects tampering", () => {
    const encrypted = encryptTelegramData("456");
    expect(encrypted).not.toContain("456");
    expect(decryptTelegramData(encrypted)).toBe("456");
    const bytes = Buffer.from(encrypted, "base64"); bytes[15] ^= 1;
    expect(() => decryptTelegramData(bytes.toString("base64"))).toThrow();
    expect(hashTelegramIdentity("456")).toMatch(/^[a-f0-9]{64}$/);
  });
});
describe("Telegram webhook and scan flow", () => {
  it("rejects unsigned requests without touching storage", async () => {
    expect((await POST(request(update, "wrong"))).status).toBe(401);
    expect(mockPrisma.telegramInboundEvent.create).not.toHaveBeenCalled();
  });
  it("fails closed when not configured", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect((await POST(request())).status).toBe(503);
  });
  it("ignores groups, bot messages, and forged sender IDs", async () => {
    for (const message of [
      { ...update.message, chat: { id: -1, type: "group" } },
      { ...update.message, from: { id: 456, is_bot: true } },
      { ...update.message, chat: { id: 789, type: "private" } },
    ]) expect((await POST(request({ ...update, message }))).status).toBe(200);
    expect(mockPrisma.telegramInboundEvent.create).not.toHaveBeenCalled();
  });
  it("scans only for a linked subscriber and replies with a concise verdict", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(runAuthorizedStockScan).toHaveBeenCalledWith({ userId: "user", ticker: "AAPL", assetType: "stock" });
    const body = JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.chat_id).toBe("456"); expect(body.text).toContain("AAPL — LOW");
  });
  it("declines unlinked and expired accounts without consuming quota", async () => {
    mockPrisma.telegramInboundEvent.findUnique.mockResolvedValueOnce(event({ binding: null }));
    await processTelegramInboundEvent("event");
    jest.mocked(resolveTelegramScanEntitlement).mockResolvedValue({ allowed: false, reason: "NO_ACTIVE_ENTITLEMENT" });
    await processTelegramInboundEvent("event");
    expect(runAuthorizedStockScan).not.toHaveBeenCalled();
  });
  it("links /start tokens without scanning and erases the token payload", async () => {
    jest.mocked(confirmTelegramBinding).mockResolvedValue(true);
    const token = crypto.randomBytes(32).toString("base64url");
    mockPrisma.telegramInboundEvent.findUnique.mockResolvedValue(event({ binding: null, encryptedText: encryptTelegramData(`/start ${token}`) }));
    await processTelegramInboundEvent("event");
    expect(confirmTelegramBinding).toHaveBeenCalledWith(token, "456");
    expect(mockPrisma.telegramInboundEvent.update).toHaveBeenCalledWith({ where: { id: "event" }, data: { encryptedText: null } });
    expect(runAuthorizedStockScan).not.toHaveBeenCalled();
  });
  it("deduplicates provider updates before scanning or replying", async () => {
    mockPrisma.telegramInboundEvent.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5.22.0" }));
    mockPrisma.telegramInboundEvent.findUnique.mockResolvedValue(event({ status: "REPLIED" }));
    expect((await POST(request())).status).toBe(200);
    expect(runAuthorizedStockScan).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not rescan completed duplicate events", async () => {
    mockPrisma.telegramInboundEvent.findUnique.mockResolvedValue(event({ status: "REPLIED" }));
    await processTelegramInboundEvent("event");
    expect(runAuthorizedStockScan).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("retries persisted replies without rescanning or charging quota", async () => {
    mockPrisma.telegramInboundEvent.findUnique.mockResolvedValue(event({ status: "RETRY", encryptedReply: encryptTelegramData("stored verdict") }));
    await processTelegramInboundEvent("event");
    expect(runAuthorizedStockScan).not.toHaveBeenCalled();
    expect(JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string).text).toBe("stored verdict");
  });
  it("does not send when another worker owns the delivery claim", async () => {
    mockPrisma.telegramInboundEvent.findUnique.mockResolvedValue(event({ status: "RETRY", encryptedReply: encryptTelegramData("stored") }));
    mockPrisma.telegramInboundEvent.updateMany.mockResolvedValue({ count: 0 });
    await processTelegramInboundEvent("event"); expect(fetch).not.toHaveBeenCalled();
  });
  it("persists provider failure for a reply-only retry", async () => {
    global.fetch = jest.fn(async () => { throw new Error("network down"); });
    await processTelegramInboundEvent("event");
    expect(mockPrisma.telegramInboundEvent.update).toHaveBeenLastCalledWith({ where: { id: "event" }, data: { status: "RETRY", reasonCode: "PROVIDER_UNAVAILABLE", attemptCount: { increment: 1 } } });
  });
});
