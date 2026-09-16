import {
  ArtifactManifest,
  buildArtifactManifest,
} from "@/lib/admin/artifact-ingestion";

interface ArtifactPointer {
  schemaVersion: "scamdunk.artifact-pointer/v1";
  scanDate: string;
  revisionHash: string;
  manifestPath: string;
}

export interface LoadedArtifactRevision {
  manifest: ArtifactManifest;
  files: Map<string, Buffer>;
}

export async function readPublishedArtifactManifest(
  scanDate: string,
  readObject: (path: string) => Promise<Buffer | null>,
): Promise<ArtifactManifest | null> {
  const pointer = await readArtifactPointer(scanDate, readObject);
  if (!pointer) return null;
  const manifestBytes = await readObject(pointer.manifestPath);
  if (!manifestBytes) throw new Error(`Missing manifest: ${pointer.manifestPath}`);
  const declared = parseJson<ArtifactManifest>(
    manifestBytes,
    pointer.manifestPath,
  );
  if (
    declared.schemaVersion !== "scamdunk.artifact-manifest/v1" ||
    declared.scanDate !== scanDate ||
    declared.revisionHash !== pointer.revisionHash ||
    !Array.isArray(declared.artifacts) ||
    !Array.isArray(declared.requiredArtifacts)
  ) {
    throw new Error(`Manifest does not match pointer for ${scanDate}`);
  }
  return declared;
}

export async function readArtifactPointer(
  scanDate: string,
  readObject: (path: string) => Promise<Buffer | null>,
): Promise<ArtifactPointer | null> {
  const pointerPath = `revisions/${scanDate}/current.json`;
  const pointerBytes = await readObject(pointerPath);
  if (!pointerBytes) return null;
  const pointer = parseJson<ArtifactPointer>(pointerBytes, pointerPath);
  if (
    pointer.schemaVersion !== "scamdunk.artifact-pointer/v1" ||
    pointer.scanDate !== scanDate ||
    !/^[a-f0-9]{64}$/.test(pointer.revisionHash) ||
    pointer.manifestPath !==
      `revisions/${scanDate}/${pointer.revisionHash}/manifest.json`
  ) {
    throw new Error(`Invalid artifact pointer for ${scanDate}`);
  }
  return pointer;
}

function parseJson<T>(bytes: Buffer, label: string): T {
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    throw new Error(`Invalid JSON in ${label}`);
  }
}

export async function loadPublishedArtifactRevision(
  scanDate: string,
  readObject: (path: string) => Promise<Buffer | null>,
): Promise<LoadedArtifactRevision | null> {
  const declared = await readPublishedArtifactManifest(scanDate, readObject);
  if (!declared) return null;

  const files: Record<string, Buffer> = {};
  for (const artifact of declared.artifacts) {
    const bytes = await readObject(artifact.storagePath);
    if (!bytes) {
      if (artifact.required) {
        throw new Error(`Missing required artifact: ${artifact.logicalName}`);
      }
      continue;
    }
    files[artifact.logicalName] = bytes;
  }
  const verified = buildArtifactManifest({
    scanDate,
    producerRunId: declared.producerRunId,
    producerExecutedAt: declared.producerExecutedAt,
    files,
    required: declared.requiredArtifacts,
    declaredArtifacts: declared.artifacts.filter(
      (artifact) => files[artifact.logicalName],
    ),
  });
  if (verified.revisionHash !== declared.revisionHash) {
    throw new Error(`Artifact revision hash mismatch for ${scanDate}`);
  }
  return { manifest: verified, files: new Map(Object.entries(files)) };
}
