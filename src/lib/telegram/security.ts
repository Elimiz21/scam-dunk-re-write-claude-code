import crypto from "crypto";
export function hashTelegramIdentity(identity: string): string {
  const key = process.env.TELEGRAM_IDENTITY_HASH_KEY;
  if (!key) throw new Error("TELEGRAM_IDENTITY_HASH_KEY required");
  return crypto.createHmac("sha256", key).update(identity).digest("hex");
}
export function hashTelegramLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
export function verifyTelegramWebhookSecret(value: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !value) return false;
  const actualBytes = Buffer.from(value), expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}
