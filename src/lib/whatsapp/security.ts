import crypto from "crypto";

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Normalize a user-provided number to the E.164 identity Meta sends. */
export function normalizeWhatsAppPhoneNumber(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
    return null;
  }
  return compact;
}

/** A deterministic, non-reversible lookup index. Never log its input. */
export function hashWhatsAppIdentity(identity: string): string {
  return crypto
    .createHmac("sha256", requireSecret("WHATSAPP_IDENTITY_HASH_KEY"))
    .update(identity)
    .digest("hex");
}

/** Verify Meta's sha256=<hex> HMAC against the exact raw request body. */
export function verifyWhatsAppWebhookSignature(
  rawBody: Buffer,
  header: string | null,
): boolean {
  if (!header?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", requireSecret("WHATSAPP_APP_SECRET"))
    .update(rawBody)
    .digest("hex");
  const provided = header.slice("sha256=".length);

  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function hashWhatsAppVerificationCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function verificationCodesMatch(code: string, expectedHash: string): boolean {
  const actualHash = hashWhatsAppVerificationCode(code);
  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}
