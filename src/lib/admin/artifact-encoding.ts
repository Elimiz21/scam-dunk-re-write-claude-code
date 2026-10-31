import { gunzipSync, gzipSync } from "node:zlib";

// Storage limits apply to each object. Preserve the exact logical bytes and
// their manifest digest while storing large evidence files losslessly.
export const ARTIFACT_COMPRESSION_THRESHOLD = 8 * 1024 * 1024;
export const MAX_DECODED_ARTIFACT_BYTES = 256 * 1024 * 1024;

export function encodeArtifact(bytes: Buffer): { bytes: Buffer; suffix: string } {
  if (bytes.length <= ARTIFACT_COMPRESSION_THRESHOLD) return { bytes, suffix: "" };
  if (bytes.length > MAX_DECODED_ARTIFACT_BYTES) throw new Error("Artifact exceeds the supported decoded size");
  return { bytes: gzipSync(bytes), suffix: ".gz" };
}

export function decodeArtifact(bytes: Buffer, storagePath: string, declaredLength: number): Buffer {
  if (!storagePath.endsWith(".gz")) return bytes;
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > MAX_DECODED_ARTIFACT_BYTES) {
    throw new Error("Invalid compressed artifact length");
  }
  try {
    return gunzipSync(bytes, { maxOutputLength: declaredLength });
  } catch {
    throw new Error("Compressed artifact is corrupt or exceeds its declared length");
  }
}
