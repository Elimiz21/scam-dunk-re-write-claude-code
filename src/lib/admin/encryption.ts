/**
 * AES-256-GCM encryption for storing API keys in the database.
 * Uses a dedicated CREDENTIAL_ENCRYPTION_KEY (preferred) or derives from NEXTAUTH_SECRET.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive a 256-bit encryption key using HMAC-based derivation.
 * Prefers CREDENTIAL_ENCRYPTION_KEY env var; falls back to NEXTAUTH_SECRET in dev.
 */
function getEncryptionKey(): Buffer {
  const dedicatedKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (dedicatedKey) {
    return crypto
      .createHmac("sha256", "scamdunk-credential-encryption")
      .update(dedicatedKey)
      .digest();
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY or NEXTAUTH_SECRET is required for credential encryption",
    );
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "WARNING: Set CREDENTIAL_ENCRYPTION_KEY for production. Falling back to NEXTAUTH_SECRET derivation.",
    );
  }

  return crypto
    .createHmac("sha256", "scamdunk-credential-encryption")
    .update(secret)
    .digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a compact string: base64(iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (16) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a string produced by encrypt().
 * Returns the original plaintext.
 */
export function decrypt(packed: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(packed, "base64");

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt a JSON-serializable credentials object.
 */
export function encryptCredentials(
  credentials: Record<string, string>,
): string {
  return encrypt(JSON.stringify(credentials));
}

/**
 * Decrypt credentials stored in the database.
 * Returns null if the stored value is empty or decryption fails.
 */
export function decryptCredentials(
  encrypted: string | null | undefined,
): Record<string, string> | null {
  if (!encrypted) return null;
  try {
    const json = decrypt(encrypted);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
