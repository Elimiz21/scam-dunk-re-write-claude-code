import {
  ArtifactManifest,
  buildArtifactManifest,
} from "./artifact-ingestion";

export interface ArtifactPointer {
  schemaVersion: "scamdunk.artifact-pointer/v1" | "scamdunk.artifact-pointer/v2";
  scanDate: string;
  revisionHash: string;
  manifestPath: string;
  publicationGeneration: number;
  parentRevisionHash: string | null;
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
  if (
    declared.publicationGeneration !== pointer.publicationGeneration ||
    declared.parentRevisionHash !== pointer.parentRevisionHash
  ) {
    throw new Error(`Manifest publication lineage does not match pointer for ${scanDate}`);
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
  const raw = parseJson<Partial<ArtifactPointer>>(pointerBytes, pointerPath);
  const pointer = {
    ...raw,
    publicationGeneration: raw.publicationGeneration ?? 1,
    parentRevisionHash: raw.parentRevisionHash ?? null,
  } as ArtifactPointer;
  if (
    !["scamdunk.artifact-pointer/v1", "scamdunk.artifact-pointer/v2"].includes(pointer.schemaVersion) ||
    pointer.scanDate !== scanDate ||
    !/^[a-f0-9]{64}$/.test(pointer.revisionHash) ||
    pointer.manifestPath !==
      `revisions/${scanDate}/${pointer.revisionHash}/manifest.json` ||
    !Number.isSafeInteger(pointer.publicationGeneration) ||
    pointer.publicationGeneration < 1 ||
    (pointer.parentRevisionHash !== null && !/^[a-f0-9]{64}$/.test(pointer.parentRevisionHash))
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
  authoritativeRevisionHash?: string,
): Promise<LoadedArtifactRevision | null> {
  const declared = authoritativeRevisionHash
    ? await readArtifactManifestByHash(scanDate, authoritativeRevisionHash, readObject)
    : await readPublishedArtifactManifest(scanDate, readObject);
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
    publicationGeneration: declared.publicationGeneration,
    parentRevisionHash: declared.parentRevisionHash,
    producerKind: declared.producerKind,
    qualityStatus: declared.qualityStatus,
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

async function readArtifactManifestByHash(
  scanDate: string,
  revisionHash: string,
  readObject: (path: string) => Promise<Buffer | null>,
): Promise<ArtifactManifest> {
  if (!/^[a-f0-9]{64}$/.test(revisionHash)) throw new Error("Invalid authoritative revision hash");
  const manifestPath = `revisions/${scanDate}/${revisionHash}/manifest.json`;
  const bytes = await readObject(manifestPath);
  if (!bytes) throw new Error(`Missing manifest: ${manifestPath}`);
  const manifest = parseJson<ArtifactManifest>(bytes, manifestPath);
  if (manifest.scanDate !== scanDate || manifest.revisionHash !== revisionHash) {
    throw new Error(`Manifest does not match authoritative date head for ${scanDate}`);
  }
  return manifest;
}
