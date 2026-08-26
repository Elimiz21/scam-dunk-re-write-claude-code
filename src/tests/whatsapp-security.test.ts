import crypto from "crypto";
import {
  hashWhatsAppIdentity,
  normalizeWhatsAppPhoneNumber,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/security";

describe("WhatsApp security primitives", () => {
  const originalAppSecret = process.env.WHATSAPP_APP_SECRET;
  const originalHashKey = process.env.WHATSAPP_IDENTITY_HASH_KEY;

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = "webhook-secret";
    process.env.WHATSAPP_IDENTITY_HASH_KEY = "identity-secret";
  });

  afterAll(() => {
    process.env.WHATSAPP_APP_SECRET = originalAppSecret;
    process.env.WHATSAPP_IDENTITY_HASH_KEY = originalHashKey;
  });

  it("validates an HMAC over the exact raw webhook bytes", () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${crypto
      .createHmac("sha256", "webhook-secret")
      .update(rawBody)
      .digest("hex")}`;

    expect(verifyWhatsAppWebhookSignature(rawBody, signature)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(rawBody, "sha256=bad")).toBe(false);
    expect(
      verifyWhatsAppWebhookSignature(Buffer.from("different"), signature),
    ).toBe(false);
  });

  it("normalizes E.164 identities and makes their index non-reversible", () => {
    expect(normalizeWhatsAppPhoneNumber("+1 (212) 555-0199")).toBe(
      "+12125550199",
    );
    expect(normalizeWhatsAppPhoneNumber("12125550199")).toBeNull();
    expect(hashWhatsAppIdentity("+12125550199")).not.toContain("12125550199");
  });
});
