import { createRevisionUploadPlan } from "../../evaluation/scripts/storage-publisher";
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
