import { createRevisionUploadPlan } from "../../evaluation/scripts/storage-publisher";
import { gzipSync } from "node:zlib";
import { ARTIFACT_COMPRESSION_THRESHOLD, MAX_DECODED_ARTIFACT_BYTES, decodeArtifact } from "@/lib/admin/artifact-encoding";
import {
  loadPublishedArtifactRevision,
  readPublishedArtifactManifest,
} from "@/lib/admin/artifact-storage";

function fixture() {
  const plan = createRevisionUploadPlan({
    scanDate: "2026-09-15",
    producerRunId: "run-1",
    files: {
      "enhanced-evaluation-2026-09-15.json": Buffer.from("[]"),
      "fmp-summary-2026-09-15.json": Buffer.from('{"evaluated":0}'),
    },
    required: [
      "enhanced-evaluation-2026-09-15.json",
      "fmp-summary-2026-09-15.json",
    ],
  });
  const objects = new Map(
    plan.operations.map((operation) => [operation.path, operation.content]),
  );
  return { plan, objects };
}

describe("published artifact loading", () => {
  it("round-trips large news evidence through a small storage object without changing any logical bytes", async () => {
    const logicalName = "enhanced-evaluation-2026-09-15.json";
    const original = Buffer.from(JSON.stringify([{ text: "retained evidence ".repeat(Math.ceil(ARTIFACT_COMPRESSION_THRESHOLD / 18)) }]));
    expect(original.length).toBeGreaterThan(ARTIFACT_COMPRESSION_THRESHOLD);
    const input = { scanDate: "2026-09-15", producerRunId: "large-news", files: { [logicalName]: original }, required: [logicalName] };
    const plan = createRevisionUploadPlan(input);
    const repeated = createRevisionUploadPlan(input);
    const artifact = plan.manifest.artifacts[0];
    expect(artifact.storagePath).toMatch(/\.json\.gz$/);
    expect(artifact.byteLength).toBe(original.length);
    expect(plan.operations[0].contentType).toBe("application/gzip");
    expect(plan.operations[0].content.length).toBeLessThan(50 * 1024 * 1024);
    expect(repeated.manifest).toEqual(plan.manifest);
    expect(repeated.operations[0].content.equals(plan.operations[0].content)).toBe(true);
    const objects = new Map(plan.operations.map(operation => [operation.path, operation.content]));
    const loaded = await loadPublishedArtifactRevision(input.scanDate, async path => objects.get(path) ?? null);
    expect(loaded?.manifest.revisionHash).toBe(plan.manifest.revisionHash);
    expect(loaded?.files.get(logicalName)?.equals(original)).toBe(true);
    // The authoritative-head path used for production ingestion must decode too.
    const byHead = await loadPublishedArtifactRevision(input.scanDate, async path => objects.get(path) ?? null, plan.manifest.revisionHash);
    expect(byHead?.files.get(logicalName)?.equals(original)).toBe(true);
    objects.set(artifact.storagePath, gzipSync(Buffer.alloc(original.length, "x")));
    await expect(loadPublishedArtifactRevision(input.scanDate, async path => objects.get(path) ?? null)).rejects.toThrow("hash mismatch");
  });

  it("rejects corrupt gzip and expansion beyond its declared or supported size", () => {
    expect(() => decodeArtifact(Buffer.from("corrupt"), "evidence.json.gz", 100)).toThrow("corrupt");
    expect(() => decodeArtifact(gzipSync(Buffer.alloc(1024)), "evidence.json.gz", 16)).toThrow("declared length");
    for (const length of [0, -1, NaN, 1.5, MAX_DECODED_ARTIFACT_BYTES + 1]) {
      expect(() => decodeArtifact(Buffer.alloc(0), "evidence.json.gz", length)).toThrow("Invalid compressed artifact length");
    }
  });
  it("verifies pointer, manifest, artifact lengths and hashes", async () => {
    const { plan, objects } = fixture();
    const loaded = await loadPublishedArtifactRevision(
      "2026-09-15",
      async (path) => objects.get(path) ?? null,
    );
    expect(loaded?.manifest.revisionHash).toBe(plan.manifest.revisionHash);
    expect(Array.from(loaded!.files)).toHaveLength(2);
  });

  it("discovers revision metadata without downloading large artifact bodies", async () => {
    const { plan, objects } = fixture();
    const reads: string[] = [];
    const manifest = await readPublishedArtifactManifest(
      "2026-09-15",
      async (path) => {
        reads.push(path);
        return objects.get(path) ?? null;
      },
    );
    expect(manifest?.revisionHash).toBe(plan.manifest.revisionHash);
    expect(reads).toEqual([
      "revisions/2026-09-15/current.json",
      `revisions/2026-09-15/${plan.manifest.revisionHash}/manifest.json`,
    ]);
  });

  it("fails closed when immutable artifact bytes no longer match the manifest", async () => {
    const { plan, objects } = fixture();
    objects.set(plan.manifest.artifacts[0].storagePath, Buffer.from("tampered"));
    await expect(
      loadPublishedArtifactRevision(
        "2026-09-15",
        async (path) => objects.get(path) ?? null,
      ),
    ).rejects.toThrow("hash mismatch");
  });

  it("returns null only when the date pointer is absent", async () => {
    await expect(
      loadPublishedArtifactRevision("2026-09-15", async () => null),
    ).resolves.toBeNull();
  });
});
