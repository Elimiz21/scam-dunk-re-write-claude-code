import { generateKeyPairSync, sign } from "crypto";
import { parseTelnyxWhatsAppInbound, verifyTelnyxSignature } from "@/lib/whatsapp/telnyx";
import { isWhatsAppConfigured, sendWhatsAppTextReply, sendWhatsAppVerificationCode } from "@/lib/whatsapp/provider";

const originalEnv = process.env;
const originalFetch = global.fetch;
const keys = generateKeyPairSync("ed25519");
const publicKey = (keys.publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(-32).toString("base64");
const inbound = () => ({ data: { event_type: "message.received", payload: {
  id: "message-1", direction: "inbound", type: "WHATSAPP", messaging_profile_id: "profile-1",
  from: { phone_number: "+972504975755" }, to: [{ phone_number: "+17693909406" }], text: "AAPL",
} } });

beforeEach(() => {
  process.env = { ...originalEnv, WHATSAPP_PROVIDER: "telnyx", TELNYX_PUBLIC_KEY: publicKey,
    TELNYX_API_KEY: "test-api-key", TELNYX_MESSAGING_PROFILE_ID: "profile-1",
    WHATSAPP_PHONE_NUMBER: "+17693909406", WHATSAPP_VERIFICATION_TEMPLATE: "scamdunk_verify",
    WHATSAPP_ENCRYPTION_KEY: "test", WHATSAPP_IDENTITY_HASH_KEY: "test" };
});
afterEach(() => { process.env = originalEnv; global.fetch = originalFetch; jest.restoreAllMocks(); });

describe("Telnyx authentication and inbound isolation", () => {
  it("verifies a real Ed25519 signature over the timestamp and unmodified body", () => {
    const raw = Buffer.from(JSON.stringify(inbound()));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.concat([Buffer.from(`${timestamp}|`), raw]), keys.privateKey).toString("base64");
    expect(verifyTelnyxSignature(raw, signature, timestamp)).toBe(true);
    expect(verifyTelnyxSignature(Buffer.from("{}"), signature, timestamp)).toBe(false);
    expect(verifyTelnyxSignature(raw, signature, String(Number(timestamp) - 301))).toBe(false);
    expect(verifyTelnyxSignature(raw, signature, String(Number(timestamp) + 301))).toBe(false);
    expect(verifyTelnyxSignature(raw, null, timestamp)).toBe(false);
  });
  it("normalizes the WhatsApp sender and namespaces the provider message ID", () => {
    expect(parseTelnyxWhatsAppInbound(inbound())).toEqual({ id: "telnyx:message-1", from: "+972504975755", messageType: "text", text: "AAPL" });
  });
  it("reads channel-specific WhatsApp text bodies and string addresses", () => {
    const value = inbound();
    expect(parseTelnyxWhatsAppInbound({data: {...value.data, payload: {...value.data.payload,
      from: "+972504975755", to: "+17693909406", text: undefined, body: {type: "text", text: {body: "TSLA"}},
    }}})?.text).toBe("TSLA");
  });
  it.each(["SMS", "MMS"])("ignores %s on the same profile", type => {
    const event = inbound(); event.data.payload.type = type;
    expect(parseTelnyxWhatsAppInbound(event)).toBeNull();
  });
  it("ignores delivery receipts, wrong profiles, and the Meta test number", () => {
    expect(parseTelnyxWhatsAppInbound({data: {event_type: "message.finalized", payload: {}}})).toBeNull();
    const event = inbound(); event.data.payload.messaging_profile_id = "unrelated";
    expect(parseTelnyxWhatsAppInbound(event)).toBeNull();
    event.data.payload.messaging_profile_id = "profile-1";
    event.data.payload.to = [{phone_number: "+15554034824"}];
    expect(parseTelnyxWhatsAppInbound(event)).toBeNull();
  });
  it("requires all Telnyx configuration without needing Meta credentials", () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN; delete process.env.WHATSAPP_APP_SECRET;
    expect(isWhatsAppConfigured()).toBe(true);
    delete process.env.TELNYX_PUBLIC_KEY;
    expect(isWhatsAppConfigured()).toBe(false);
    process.env.WHATSAPP_PROVIDER = "typo";
    expect(isWhatsAppConfigured()).toBe(false);
  });
});

describe("Telnyx outbound delivery", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({data: {id: "sent-1"}})});
  });
  it("sends verification through Telnyx with matching body/button codes and numeric button index", async () => {
    await expect(sendWhatsAppVerificationCode("+972504975755", "123456")).resolves.toBe("sent-1");
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.telnyx.com/v2/messages/whatsapp");
    expect(JSON.parse(options.body)).toEqual({from: "+17693909406", to: "+972504975755", type: "WHATSAPP", messaging_profile_id: "profile-1",
      whatsapp_message: {type: "template", template: {name: "scamdunk_verify", language: {code: "en_US", policy: "deterministic"},
        components: [{type: "body", parameters: [{type: "text", text: "123456"}]},
          {type: "button", sub_type: "url", index: 0, parameters: [{type: "text", text: "123456"}]}]}}});
  });
  it("prefers the dedicated WhatsApp key over legacy account credentials", async () => {
    process.env.TELNYX_WHATSAPP_API_KEY = "dedicated-key";
    await sendWhatsAppTextReply("972504975755", "Test");
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe("Bearer dedicated-key");
  });
  it("sends text replies to normalized E.164 recipients", async () => {
    await sendWhatsAppTextReply("972504975755", "ScamDunk result");
    const payload = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(payload.to).toBe("+972504975755");
    expect(payload.whatsapp_message).toEqual({type: "text", text: {body: "ScamDunk result", preview_url: false}});
  });
  it("logs only safe error codes, never request or provider descriptions", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({ok: false, status: 403, json: async () => ({errors: [{code: "10009", detail: "private OTP/recipient"}]})});
    await expect(sendWhatsAppTextReply("972504975755", "private")).rejects.toThrow("WHATSAPP_PROVIDER_SEND_FAILED");
    expect(log).toHaveBeenCalledWith("WhatsApp Telnyx send failed", {status: 403, code: "10009"});
  });
});
