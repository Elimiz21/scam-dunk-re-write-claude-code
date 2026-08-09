import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getWhatsAppEncryptionKey(): Buffer {
  const secret = process.env.WHATSAPP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("WHATSAPP_ENCRYPTION_KEY is required");
  }
  return crypto
    .createHmac("sha256", "scamdunk-whatsapp-encryption-v1")
    .update(secret)
    .digest();
}

export function encryptWhatsAppData(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getWhatsAppEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptWhatsAppData(packed: string): string {
  const bytes = Buffer.from(packed, "base64");
  if (bytes.length <= IV_LENGTH + TAG_LENGTH) throw new Error("Invalid encrypted WhatsApp data");
  const decipher = crypto.createDecipheriv(ALGORITHM, getWhatsAppEncryptionKey(), bytes.subarray(0, IV_LENGTH));
  decipher.setAuthTag(bytes.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([
    decipher.update(bytes.subarray(IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8");
}
