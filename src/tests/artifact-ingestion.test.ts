import {
  ArtifactManifest,
  InMemoryIngestionStore,
  buildArtifactManifest,
  runResumableIngestion,
} from "@/lib/admin/artifact-ingestion";

const files = {
  "enhanced-evaluation-2026-09-15.json": Buffer.from('[{"symbol":"ZERO"}]'),
  "fmp-summary-2026-09-15.json": Buffer.from('{"evaluated":1}'),
};

function manifest(
  input: Record<string, Buffer> = files,
  required = Object.keys(input),
): ArtifactManifest {
  return buildArtifactManifest({
    scanDate: "2026-09-15",
    producerRunId: "run-123",
    files: input,
    required,
  });
}

describe("artifact revision lineage", () => {
  it("gives identical bytes a stable revision and a late artifact a new revision", () => {
    const first = manifest();
    const same = manifest({ ...files });
    const late = manifest({
      ...files,
      "promoted-stocks-2026-09-15.json": Buffer.from('{"promotedStocks":[]}'),
    });

    expect(same.revisionHash).toBe(first.revisionHash);
    expect(late.revisionHash).not.toBe(first.revisionHash);
    expect(first.artifacts.map((artifact) => artifact.sha256)).toEqual([
      "7d961bd4af0dc43ad81b59c0a9dc023fc1c62e6a7bc569ec088f6e099f1c93e1",
      "2b875564b18f5a1d65600e6163ba6b49b5c114e423e42506e9f5a499a54f1479",
    ]);
  });

  it("keeps evidenced producer execution time in revision identity and never invents it", () => {
    const unknown = manifest();
    const observed = buildArtifactManifest({
      scanDate: "2026-09-15",
      producerRunId: "run-123",
      producerExecutedAt: "2026-09-15T21:42:03.123Z",
      files,
      required: Object.keys(files),
    });
    expect(unknown.producerExecutedAt).toBeNull();
    expect(observed.producerExecutedAt).toBe("2026-09-15T21:42:03.123Z");
    expect(observed.revisionHash).not.toBe(unknown.revisionHash);
    expect(() =>
      buildArtifactManifest({
        scanDate: "2026-09-15",
        producerRunId: "run-123",
        producerExecutedAt: "not-a-time",
        files,
        required: Object.keys(files),
      }),
    ).toThrow("producerExecutedAt");
  });

  it("rejects a manifest whose declared artifact hash does not match the bytes", () => {
    const revision = manifest();
    const corrupted = {
      ...revision,
      artifacts: revision.artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, sha256: "0".repeat(64) } : artifact,
      ),
    };

    expect(() =>
      buildArtifactManifest({
        scanDate: corrupted.scanDate,
        producerRunId: corrupted.producerRunId,
        files,
        required: corrupted.requiredArtifacts,
        declaredArtifacts: corrupted.artifacts,
      }),
    ).toThrow("hash mismatch");
  });
});

describe("resumable ingestion", () => {
  const phases = ["OBSERVATIONS", "SUMMARY"] as const;

  it("resumes after a failure following summary work without rerunning completed work", async () => {
    const store = new InMemoryIngestionStore();
    const calls: string[] = [];
    let failSummary = true;
    const handlers = {
      OBSERVATIONS: async () => calls.push("OBSERVATIONS"),
      SUMMARY: async () => {
        calls.push("SUMMARY");
        if (failSummary) throw new Error("interrupted after summary write");
      },
    };

    await expect(
      runResumableIngestion({
        manifest: manifest(),
        workerId: "worker-a",
        phases,
        store,
        handlers,
      }),
    ).rejects.toThrow("interrupted after summary write");

    failSummary = false;
    await expect(
      runResumableIngestion({
        manifest: manifest(),
        workerId: "worker-b",
        phases,
        store,
        handlers,
      }),
    ).resolves.toMatchObject({ status: "PUBLISHED" });
    expect(calls).toEqual(["OBSERVATIONS", "SUMMARY", "SUMMARY"]);
  });

  it("allows only one concurrent worker to execute a phase", async () => {
    const store = new InMemoryIngestionStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let executions = 0;
    const handlers = {
      OBSERVATIONS: async () => {
        executions++;
        await gate;
      },
    };
    const one = runResumableIngestion({
      manifest: manifest(),
      workerId: "worker-a",
      phases: ["OBSERVATIONS"],
      store,
      handlers,
    });
    await Promise.resolve();
    const two = runResumableIngestion({
      manifest: manifest(),
      workerId: "worker-b",
      phases: ["OBSERVATIONS"],
      store,
      handlers,
    });
    release();

    const results = await Promise.all([one, two]);
    expect(executions).toBe(1);
    expect(results.map((result) => result.status).sort()).toEqual([
      "BUSY",
      "PUBLISHED",
    ]);
  });

  it("does not publish until every required phase completes", async () => {
    const store = new InMemoryIngestionStore();
    await expect(
      runResumableIngestion({
        manifest: manifest(),
        workerId: "worker-a",
        phases,
        store,
        handlers: {
          OBSERVATIONS: async () => undefined,
        },
      }),
    ).rejects.toThrow("Missing handler for required phase SUMMARY");
    expect(store.getRevision(manifest().revisionHash)?.status).toBe("FAILED");
  });
});
