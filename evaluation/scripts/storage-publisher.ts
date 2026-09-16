import { buildArtifactManifest } from "../../src/lib/admin/artifact-ingestion";
import { normalizeStrictIsoTimestamp } from "../../src/lib/strict-timestamp";
import { requireSupabaseServiceConfig } from "../../src/lib/server/supabase-service-config";
import { assessPublicationQuality } from "../../src/lib/admin/artifact-quality";
export { assessPublicationQuality as assertPublicationQuality };

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

interface PublicationPointer {
  schemaVersion: "scamdunk.artifact-pointer/v2";
  scanDate: string;
  publicationGeneration: number;
  parentRevisionHash: string | null;
  revisionHash: string;
  manifestPath: string;
}

async function isMissingStorageObject(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const body = await response.clone().json() as Record<string, unknown>;
    return String(body.statusCode) === "404" &&
      body.error === "not_found" && body.message === "Object not found";
  } catch {
    return false;
  }
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
  publicationGeneration?: number;
  parentRevisionHash?: string | null;
  producerKind?: "DAILY_PIPELINE" | "LEGACY_RETAINED";
  qualityStatus?: "VERIFIED" | "DEGRADED" | "UNKNOWN";
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
        schemaVersion: "scamdunk.artifact-pointer/v2",
        scanDate: input.scanDate,
        publicationGeneration: manifest.publicationGeneration,
        parentRevisionHash: manifest.parentRevisionHash,
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
  const authHeaders = {
    apikey: input.config.serviceKey,
    Authorization: `Bearer ${input.config.serviceKey}`,
  };
  const readHead = async (scanDate: string): Promise<{
    publicationGeneration: number;
    revisionHash: string;
    parentRevisionHash: string | null;
  }> => {
    const response = await fetchImpl(
      `${input.config.supabaseUrl}/rest/v1/EvaluationArtifactPublicationHead?scanDate=eq.${encodeURIComponent(`${scanDate}T00:00:00.000Z`)}&select=publicationGeneration,revisionHash,parentRevisionHash`,
      { headers: authHeaders },
    );
    if (!response.ok) throw new Error(`Could not read authoritative publication head: HTTP ${response.status}`);
    const rows = await response.json() as Array<{
      publicationGeneration: number;
      revisionHash: string;
      parentRevisionHash: string | null;
    }>;
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error(`Authoritative publication head missing for ${scanDate}`);
    }
    return rows[0];
  };
  for (const operation of input.operations) {
    if (operation.kind === "POINTER") {
      const desired = JSON.parse(operation.content.toString("utf8")) as PublicationPointer;
      const claimResponse = await fetchImpl(
        `${input.config.supabaseUrl}/rest/v1/rpc/claim_evaluation_artifact_publication`,
        {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            scan_date_input: `${desired.scanDate}T00:00:00.000Z`,
            generation_input: desired.publicationGeneration,
            parent_revision_hash_input: desired.parentRevisionHash,
            revision_hash_input: desired.revisionHash,
          }),
        },
      );
      if (!claimResponse.ok) {
        throw new Error(`Atomic publication head claim failed: HTTP ${claimResponse.status}`);
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const head = await readHead(desired.scanDate);
        const pointer: PublicationPointer = {
          schemaVersion: "scamdunk.artifact-pointer/v2",
          scanDate: desired.scanDate,
          publicationGeneration: head.publicationGeneration,
          parentRevisionHash: head.parentRevisionHash,
          revisionHash: head.revisionHash,
          manifestPath: `revisions/${desired.scanDate}/${head.revisionHash}/manifest.json`,
        };
        const currentResponse = await fetchImpl(
          `${input.config.supabaseUrl}/storage/v1/object/authenticated/${bucket}/${operation.path}`,
          { headers: authHeaders },
        );
        if (currentResponse.ok) {
          const current = JSON.parse(await currentResponse.text()) as PublicationPointer;
          if (current.revisionHash === head.revisionHash) {
            if (head.revisionHash !== desired.revisionHash) {
              throw new Error("Publication was superseded by a newer authoritative revision");
            }
            break;
          }
        } else if (!(await isMissingStorageObject(currentResponse))) {
          throw new Error(`Could not verify current publication pointer: HTTP ${currentResponse.status}`);
        }
        const pointerResponse = await fetchImpl(
          `${input.config.supabaseUrl}/storage/v1/object/${bucket}/${operation.path}`,
          {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json", "x-upsert": "true" },
            body: new Uint8Array(Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`)),
          },
        );
        if (!pointerResponse.ok) {
          throw new Error(`Storage publication failed for ${operation.path}: HTTP ${pointerResponse.status}`);
        }
        const confirmedHead = await readHead(desired.scanDate);
        if (confirmedHead.revisionHash === head.revisionHash) {
          if (head.revisionHash !== desired.revisionHash) {
            throw new Error("Publication was superseded by a newer authoritative revision");
          }
          break;
        }
        if (attempt === 4) throw new Error("Publication head changed repeatedly during pointer convergence");
      }
      continue;
    }
    const response = await fetchImpl(
      `${input.config.supabaseUrl}/storage/v1/object/${bucket}/${operation.path}`,
      {
        method: "POST",
        headers: {
          ...authHeaders,
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
              ...authHeaders,
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
