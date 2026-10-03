import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getTelegramEncryptionKey(): Buffer {
  const secret = process.env.TELEGRAM_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("TELEGRAM_ENCRYPTION_KEY is required");
  }
  return crypto
    .createHmac("sha256", "scamdunk-telegram-encryption-v1")
    .update(secret)
    .digest();
}

export function encryptTelegramData(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getTelegramEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptTelegramData(packed: string): string {
  const bytes = Buffer.from(packed, "base64");
  if (bytes.length <= IV_LENGTH + TAG_LENGTH) throw new Error("Invalid encrypted Telegram data");
  const decipher = crypto.createDecipheriv(ALGORITHM, getTelegramEncryptionKey(), bytes.subarray(0, IV_LENGTH));
  decipher.setAuthTag(bytes.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([
    decipher.update(bytes.subarray(IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8");
}
