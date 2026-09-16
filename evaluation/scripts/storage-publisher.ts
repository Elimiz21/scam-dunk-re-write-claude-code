import { buildArtifactManifest } from "../../src/lib/admin/artifact-ingestion";
import { normalizeStrictIsoTimestamp } from "../../src/lib/strict-timestamp";
import { requireSupabaseServiceConfig } from "../../src/lib/server/supabase-service-config";

export interface StoragePublisherConfig {
  supabaseUrl: string;
  serviceKey: string;
}

export function requireStoragePublisherConfig(
  env: Readonly<Record<string, string | undefined>>,
): StoragePublisherConfig {
  return requireSupabaseServiceConfig(env);
}

export interface UploadOperation {
  kind: "ARTIFACT" | "MANIFEST" | "POINTER";
  path: string;
  content: Buffer;
  contentType: "application/json" | "text/markdown" | "application/octet-stream";
  upsert: boolean;
}

function contentTypeFor(filename: string): UploadOperation["contentType"] {
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}

/** Extracts producer completion evidence from the producer-owned run summary.
 * Upload time, scan date, and filesystem metadata are intentionally ignored. */
export function extractProducerExecutedAt(summaryBytes: Buffer): string | null {
  try {
    const summary = JSON.parse(summaryBytes.toString("utf8")) as {
      endTime?: unknown;
    };
    if (typeof summary.endTime !== "string") return null;
    return normalizeStrictIsoTimestamp(summary.endTime);
  } catch {
    return null;
  }
}

export function createRevisionUploadPlan(input: {
  scanDate: string;
  producerRunId: string;
  producerExecutedAt?: string | null;
  files: Record<string, Buffer>;
  required: string[];
}): {
  manifest: ReturnType<typeof buildArtifactManifest>;
  operations: UploadOperation[];
} {
  const manifest = buildArtifactManifest(input);
  const artifactOperations = manifest.artifacts.map((artifact) => ({
    kind: "ARTIFACT" as const,
    path: artifact.storagePath,
    content: input.files[artifact.logicalName],
    contentType: contentTypeFor(artifact.logicalName),
    upsert: false,
  }));
  const manifestPath = `revisions/${input.scanDate}/${manifest.revisionHash}/manifest.json`;
  const manifestContent = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const pointerContent = Buffer.from(
    `${JSON.stringify(
      {
        schemaVersion: "scamdunk.artifact-pointer/v1",
        scanDate: input.scanDate,
        revisionHash: manifest.revisionHash,
        manifestPath,
      },
      null,
      2,
    )}\n`,
  );

  return {
    manifest,
    operations: [
      ...artifactOperations,
      {
        kind: "MANIFEST",
        path: manifestPath,
        content: manifestContent,
        contentType: "application/json",
        upsert: false,
      },
      {
        kind: "POINTER",
        path: `revisions/${input.scanDate}/current.json`,
        content: pointerContent,
        contentType: "application/json",
        upsert: true,
      },
    ],
  };
}

export async function executeRevisionUploadPlan(input: {
  config: StoragePublisherConfig;
  operations: UploadOperation[];
  bucket?: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const bucket = input.bucket ?? "evaluation-data";
  const fetchImpl = input.fetchImpl ?? fetch;
  for (const operation of input.operations) {
    const response = await fetchImpl(
      `${input.config.supabaseUrl}/storage/v1/object/${bucket}/${operation.path}`,
      {
        method: "POST",
        headers: {
          apikey: input.config.serviceKey,
          Authorization: `Bearer ${input.config.serviceKey}`,
          "Content-Type": operation.contentType,
          "x-upsert": String(operation.upsert),
        },
        body: new Uint8Array(operation.content),
      },
    );
    if (!response.ok) {
      const responseBody = await response.text();
      if (!operation.upsert && (response.status === 400 || response.status === 409)) {
        const existingResponse = await fetchImpl(
          `${input.config.supabaseUrl}/storage/v1/object/authenticated/${bucket}/${operation.path}`,
          {
            headers: {
              apikey: input.config.serviceKey,
              Authorization: `Bearer ${input.config.serviceKey}`,
            },
          },
        );
        if (existingResponse.ok) {
          const existing = Buffer.from(await existingResponse.arrayBuffer());
          if (existing.equals(operation.content)) continue;
        }
        throw new Error(`Immutable storage path conflict: ${operation.path}`);
      }
      throw new Error(
        `Storage publication failed for ${operation.path}: HTTP ${response.status} ${responseBody.slice(0, 300)}`,
      );
    }
  }
}
