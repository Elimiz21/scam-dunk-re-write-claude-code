import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
const mockEvents = { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() };
jest.mock("@/lib/db", () => ({ prisma: { whatsAppInboundEvent: mockEvents, whatsAppIdentityBinding: { findUnique: jest.fn(async () => ({ id: "binding" })) } } }));
jest.mock("@/lib/whatsapp/provider", () => ({ sendWhatsAppTextReply: jest.fn() }));
jest.mock("@/lib/whatsapp/entitlement", () => ({ resolveWhatsAppScanEntitlement: jest.fn(async () => ({ allowed: true })) }));
jest.mock("@/lib/rate-limit", () => ({ rateLimit: jest.fn(async () => ({ success: true })) }));
jest.mock("@/lib/whatsapp/scan", () => ({ runAuthorizedStockScan: jest.fn() }));
import { encryptWhatsAppData } from "@/lib/whatsapp/crypto";
import { processWhatsAppInboundEvent } from "@/lib/whatsapp/processor";
import { sendWhatsAppTextReply } from "@/lib/whatsapp/provider";
import { runAuthorizedStockScan } from "@/lib/whatsapp/scan";
import { POST } from "@/app/api/webhooks/whatsapp/route";
const originalEnv = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, { WHATSAPP_ENCRYPTION_KEY: "local-test", WHATSAPP_IDENTITY_HASH_KEY: "local-test-hmac", WHATSAPP_APP_SECRET: "local-secret", WHATSAPP_PHONE_NUMBER_ID: "phone" });
  mockEvents.findUnique.mockResolvedValue({ id: "event", status: "RETRY", updatedAt: new Date(), encryptedReply: encryptWhatsAppData("saved verdict"), senderIdentityEncrypted: encryptWhatsAppData("+12125550199") });
  mockEvents.updateMany.mockResolvedValue({ count: 1 });
  mockEvents.update.mockResolvedValue({});
  jest.mocked(sendWhatsAppTextReply).mockResolvedValue("reply");
});
afterAll(() => { process.env = originalEnv; });
it("resumes saved WhatsApp replies without rescanning", async () => {
  await processWhatsAppInboundEvent("event");
  expect(sendWhatsAppTextReply).toHaveBeenCalledWith("12125550199", "saved verdict");
  expect(runAuthorizedStockScan).not.toHaveBeenCalled();
});
it("does not send after losing an atomic delivery claim", async () => {
  mockEvents.updateMany.mockResolvedValue({ count: 0 });
  await processWhatsAppInboundEvent("event");
  expect(sendWhatsAppTextReply).not.toHaveBeenCalled();
});
it("preserves a saved reply when the provider fails", async () => {
  jest.mocked(sendWhatsAppTextReply).mockRejectedValue(new Error("provider unavailable"));
  await processWhatsAppInboundEvent("event");
  expect(mockEvents.update).toHaveBeenLastCalledWith({ where: { id: "event" }, data: { status: "RETRY", reasonCode: "PROVIDER_UNAVAILABLE", attemptCount: { increment: 1 } } });
});
it("a duplicate signed Meta delivery resumes a previously failed response", async () => {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone" }, messages: [{ id: "message", from: "12125550199", type: "text", text: { body: "AAPL" } }] } }] }] });
  mockEvents.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5.22.0" }));
  const signature = crypto.createHmac("sha256", "local-secret").update(raw).digest("hex");
  const result = await POST(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", headers: { "x-hub-signature-256": `sha256=${signature}` }, body: raw }));
  expect(result.status).toBe(200);
  expect(sendWhatsAppTextReply).toHaveBeenCalledWith("12125550199", "saved verdict");
  expect(runAuthorizedStockScan).not.toHaveBeenCalled();
});
