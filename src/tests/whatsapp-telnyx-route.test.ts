import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { POST } from "@/app/api/webhooks/whatsapp/telnyx/route";
import { prisma } from "@/lib/db";
import { processWhatsAppInboundEvent } from "@/lib/whatsapp/processor";
import { verifyTelnyxSignature } from "@/lib/whatsapp/telnyx";
import { waitUntil } from "@vercel/functions";

jest.mock("@/lib/db", () => ({prisma: {whatsAppIdentityBinding: {findUnique: jest.fn()}, whatsAppInboundEvent: {create: jest.fn()}}}));
jest.mock("@/lib/whatsapp/processor", () => ({processWhatsAppInboundEvent: jest.fn()}));
jest.mock("@/lib/whatsapp/provider", () => ({isWhatsAppConfigured: () => true}));
jest.mock("@/lib/whatsapp/crypto", () => ({encryptWhatsAppData: (s: string) => `encrypted:${s}`}));
jest.mock("@/lib/whatsapp/security", () => ({hashWhatsAppIdentity: () => "hashed-sender"}));
jest.mock("@/lib/whatsapp/telnyx", () => ({...jest.requireActual("@/lib/whatsapp/telnyx"), verifyTelnyxSignature: jest.fn()}));
jest.mock("@vercel/functions", () => ({waitUntil: jest.fn()}));
const originalEnv = process.env;
const request = () => new NextRequest("https://scamdunk.com/api/webhooks/whatsapp/telnyx", {method: "POST", body: JSON.stringify({data: {
  event_type: "message.received", payload: {id: "msg-1", type: "WHATSAPP", direction: "inbound", messaging_profile_id: "profile-1",
    from: {phone_number: "+972504975755"}, to: [{phone_number: "+17693909406"}], text: "AAPL"},
}})});
beforeEach(() => {
  jest.clearAllMocks();
  process.env = {...originalEnv, WHATSAPP_PROVIDER: "telnyx", TELNYX_MESSAGING_PROFILE_ID: "profile-1", WHATSAPP_PHONE_NUMBER: "+17693909406"};
  (verifyTelnyxSignature as jest.Mock).mockReturnValue(true);
  (prisma.whatsAppIdentityBinding.findUnique as jest.Mock).mockResolvedValue({id: "binding-1"});
  (prisma.whatsAppInboundEvent.create as jest.Mock).mockResolvedValue({id: "event-1"});
  (processWhatsAppInboundEvent as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => {process.env = originalEnv; jest.restoreAllMocks();});
it("persists encrypted input then responds while the scan remains in background", async () => {
  (processWhatsAppInboundEvent as jest.Mock).mockReturnValue(new Promise(() => {}));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(prisma.whatsAppInboundEvent.create).toHaveBeenCalledWith({data: expect.objectContaining({providerMessageId: "telnyx:msg-1", encryptedText: "encrypted:AAPL", senderIdentityHash: "hashed-sender"})});
  expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
});
it("rejects unauthenticated requests without touching the database", async () => {
  (verifyTelnyxSignature as jest.Mock).mockReturnValue(false);
  expect((await POST(request())).status).toBe(401);
  expect(prisma.whatsAppInboundEvent.create).not.toHaveBeenCalled();
});
it("acknowledges duplicate deliveries without a second scan", async () => {
  (prisma.whatsAppInboundEvent.create as jest.Mock).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", {code: "P2002", clientVersion: "5.22"}));
  expect((await POST(request())).status).toBe(200);
  expect(processWhatsAppInboundEvent).not.toHaveBeenCalled();
});
it("returns retryable failure when durable storage is unavailable", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  (prisma.whatsAppInboundEvent.create as jest.Mock).mockRejectedValue(new Error("db unavailable"));
  expect((await POST(request())).status).toBe(503);
  expect(processWhatsAppInboundEvent).not.toHaveBeenCalled();
});
