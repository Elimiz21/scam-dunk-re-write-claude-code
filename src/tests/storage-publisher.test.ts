import {
  createRevisionUploadPlan,
  executeRevisionUploadPlan,
  extractProducerExecutedAt,
  assertPublicationQuality,
  readSupabaseStorageObject,
  requireStoragePublisherConfig,
} from "../../evaluation/scripts/storage-publisher";
import { loadPublishedArtifactRevision } from "@/lib/admin/artifact-storage";

describe("server-side evaluation artifact publication", () => {
  const jwt = (payload: Record<string, unknown>) =>
    [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(JSON.stringify(payload)).toString("base64url"),
      "test-signature",
    ].join(".");

  const unknownStorageError = (response: Response) => ({
    name: "StorageUnknownError",
    message: "{}",
    status: undefined,
    statusCode: undefined,
    originalError: response,
  });

  const missingKeyResponse = () => new Response(JSON.stringify({
    statusCode: "404",
    error: "not_found",
    message: "Object not found",
    code: "NoSuchKey",
  }), { status: 400, headers: { "content-type": "application/json" } });

  it("recognizes the verified SDK missing-key response without consuming its body", async () => {
    const originalResponse = missingKeyResponse();
    const download = jest.fn(async () => ({
      data: null,
      error: unknownStorageError(originalResponse),
    }));

    await expect(readSupabaseStorageObject("revisions/2026-09-16/current.json", download))
      .resolves.toBeNull();
    expect(await originalResponse.json()).toEqual({
      statusCode: "404",
      error: "not_found",
      message: "Object not found",
      code: "NoSuchKey",
    });
  });

  it("fails closed for auth, transport, ambiguous legacy, and message-only errors", async () => {
    const cases: unknown[] = [
      unknownStorageError(new Response(JSON.stringify({
        statusCode: "403", error: "unauthorized", message: "Invalid JWT", code: "InvalidJWT",
      }), { status: 400 })),
      { name: "StorageUnknownError", message: "network failed", originalError: new Error("ECONNRESET") },
      unknownStorageError(new Response(JSON.stringify({
        statusCode: "404", error: "not_found", message: "Object not found",
      }), { status: 400 })),
      { name: "StorageUnknownError", message: "Object not found" },
    ];
    for (const error of cases) {
      await expect(readSupabaseStorageObject("revisions/2026-09-16/current.json", async () => ({
        data: null, error,
      }))).rejects.toThrow("Failed to read revisions/2026-09-16/current.json");
    }
  });

  it("accepts the documented new missing-key API error shape", async () => {
    await expect(readSupabaseStorageObject("revisions/2026-09-16/current.json", async () => ({
      data: null,
      error: {
        name: "StorageApiError", message: "Object not found", status: 404, statusCode: "NoSuchKey",
      },
    }))).resolves.toBeNull();
  });

  it("keeps an authoritative database head fail closed when its manifest is missing", async () => {
    const revisionHash = "a".repeat(64);
    const readObject = (objectPath: string) => readSupabaseStorageObject(objectPath, async () => ({
      data: null,
      error: unknownStorageError(missingKeyResponse()),
    }));
    await expect(loadPublishedArtifactRevision("2026-09-16", readObject, revisionHash))
      .rejects.toThrow(`Missing manifest: revisions/2026-09-16/${revisionHash}/manifest.json`);
  });

  it("uses only a real run-summary end time as the producer execution time", () => {
    expect(
      extractProducerExecutedAt(
        Buffer.from('{"endTime":"2026-09-15T21:42:03.123Z"}'),
      ),
    ).toBe("2026-09-15T21:42:03.123Z");
    expect(extractProducerExecutedAt(Buffer.from('{"endTime":"invalid"}'))).toBeNull();
    expect(
      extractProducerExecutedAt(
        Buffer.from('{"endTime":"2026-02-30T21:42:03.123Z"}'),
      ),
    ).toBeNull();
    expect(
      extractProducerExecutedAt(
        Buffer.from('{"endTime":"September 15, 2026 21:42 UTC"}'),
      ),
    ).toBeNull();
    expect(extractProducerExecutedAt(Buffer.from('{"createdAt":"2026-09-15T21:42:03.123Z"}'))).toBeNull();
  });

  it("blocks failed mandatory scoring but retains explicitly degraded optional social output", () => {
    const date = "2026-09-15";
    const files = (riskStatus: string, pipelineStatus = "degraded") => ({
      [`scan-status-${date}.json`]: Buffer.from(JSON.stringify({
        date,
        pipelineStatus,
        phases: {
          phase1_riskScoring: { status: riskStatus },
          phase4_socialMedia: { status: "degraded" },
        },
      })),
      [`pipeline-validation-${date}.json`]: Buffer.from(JSON.stringify({
        date, status: "degraded", scanPipelineStatus: pipelineStatus,
      })),
    });
    expect(() => assertPublicationQuality(date, files("failed"))).toThrow("risk scoring");
    expect(() => assertPublicationQuality(date, files("completed"))).not.toThrow();
    expect(() => assertPublicationQuality(date, files("completed", "failed"))).toThrow("failed");
    const partial = files("degraded");
    const scan = JSON.parse(partial[`scan-status-${date}.json`].toString());
    scan.phases.phase1_riskScoring.details = {
      listedExpected: 100, listedEvaluated: 92, listedMissing: 8,
    };
    partial[`scan-status-${date}.json`] = Buffer.from(JSON.stringify(scan));
    expect(assertPublicationQuality(date, partial)).toBe("DEGRADED");
    scan.phases.phase1_riskScoring.details.listedEvaluated = 0;
    scan.phases.phase1_riskScoring.details.listedMissing = 100;
    partial[`scan-status-${date}.json`] = Buffer.from(JSON.stringify(scan));
    expect(() => assertPublicationQuality(date, partial)).toThrow("listed coverage");
  });

  it("binds quality artifact bodies to the scan date and reconciles aggregate statuses", () => {
    const date = "2026-09-15";
    const files = {
      [`scan-status-${date}.json`]: Buffer.from(JSON.stringify({
        date,
        pipelineStatus: "completed",
        phases: { phase1_riskScoring: { status: "completed" } },
      })),
      [`pipeline-validation-${date}.json`]: Buffer.from(JSON.stringify({
        date,
        status: "healthy",
        scanPipelineStatus: "degraded",
      })),
    };
    expect(assertPublicationQuality(date, files)).toBe("DEGRADED");

    files[`scan-status-${date}.json`] = Buffer.from(JSON.stringify({
      date: "2026-09-14",
      pipelineStatus: "completed",
      phases: { phase1_riskScoring: { status: "completed" } },
    }));
    expect(() => assertPublicationQuality(date, files)).toThrow("scan date");
  });

  it("fails closed when only a public anonymous key is configured", () => {
    expect(() =>
      requireStoragePublisherConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
      }),
    ).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("uses the dedicated server credential without accepting a public fallback", () => {
    expect(
      requireStoragePublisherConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server-test-key",
      }),
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      serviceKey: "sb_secret_server-test-key",
    });
  });

  it("rejects an anon JWT placed in the server credential variable", () => {
    expect(() =>
      requireStoragePublisherConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example-ref.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: jwt({
          role: "anon",
          ref: "example-ref",
        }),
      }),
    ).toThrow("service_role");
  });

  it("rejects a legacy service JWT for a different Supabase project", () => {
    expect(() =>
      requireStoragePublisherConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://expected-ref.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: jwt({
          role: "service_role",
          ref: "different-ref",
        }),
      }),
    ).toThrow("project ref");
  });

  it("accepts a legacy service JWT only when role and project ref match", () => {
    const serviceKey = jwt({ role: "service_role", ref: "expected-ref" });
    expect(
      requireStoragePublisherConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://expected-ref.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      }),
    ).toEqual({
      supabaseUrl: "https://expected-ref.supabase.co",
      serviceKey,
    });
  });

  it("uploads immutable objects before atomically replacing the date pointer", () => {
    const plan = createRevisionUploadPlan({
      scanDate: "2026-09-15",
      producerRunId: "gha-123",
      producerExecutedAt: "2026-09-15T21:42:03.123Z",
      files: {
        "enhanced-evaluation-2026-09-15.json": Buffer.from("[]"),
        "fmp-summary-2026-09-15.json": Buffer.from('{"evaluated":0}'),
      },
      required: [
        "enhanced-evaluation-2026-09-15.json",
        "fmp-summary-2026-09-15.json",
      ],
      publicationGeneration: 2,
      parentRevisionHash: "a".repeat(64),
    });

    expect(plan.operations.at(-1)).toMatchObject({
      path: "revisions/2026-09-15/current.json",
      upsert: true,
      kind: "POINTER",
    });
    expect(plan.operations.slice(0, -1).every((operation) => !operation.upsert)).toBe(
      true,
    );
    expect(plan.manifest.revisionHash).toHaveLength(64);
    expect(plan.manifest.producerExecutedAt).toBe(
      "2026-09-15T21:42:03.123Z",
    );
    expect(plan.manifest.publicationGeneration).toBe(2);
    expect(plan.manifest.parentRevisionHash).toBe("a".repeat(64));
  });

  it("rejects a pointer update whose expected parent is no longer current", async () => {
    const plan = createRevisionUploadPlan({
      scanDate: "2026-09-15",
      producerRunId: "delayed-run",
      files: { "enhanced-evaluation-2026-09-15.json": Buffer.from("[]") },
      required: ["enhanced-evaluation-2026-09-15.json"],
      publicationGeneration: 2,
      parentRevisionHash: "a".repeat(64),
    });
    const newerPointer = Buffer.from(JSON.stringify({
      schemaVersion: "scamdunk.artifact-pointer/v2",
      scanDate: "2026-09-15",
      publicationGeneration: 3,
      parentRevisionHash: "b".repeat(64),
      revisionHash: "c".repeat(64),
      manifestPath: `revisions/2026-09-15/${"c".repeat(64)}/manifest.json`,
    }));
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("EvaluationArtifactPublicationHead")) {
        return new Response(JSON.stringify([{
          publicationGeneration: 3,
          parentRevisionHash: "b".repeat(64),
          revisionHash: "c".repeat(64),
        }]), { status: 200 });
      }
      if (url.includes("current.json") && (!init?.method || init.method === "GET")) {
        return new Response(new Uint8Array(newerPointer), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    await expect(executeRevisionUploadPlan({
      config: { supabaseUrl: "https://example.supabase.co", serviceKey: "secret" },
      operations: plan.operations,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow("superseded");
    expect(fetchImpl.mock.calls.some(([url, init]) =>
      String(url).includes("current.json") && init?.method === "POST",
    )).toBe(false);
  });

  it("allows only one same-parent publisher to claim a date generation", async () => {
    const parentHash = "a".repeat(64);
    const child = (run: string, value: string) => createRevisionUploadPlan({
      scanDate: "2026-09-15", producerRunId: run,
      publicationGeneration: 2, parentRevisionHash: parentHash,
      files: { "enhanced-evaluation-2026-09-15.json": Buffer.from(value) },
      required: ["enhanced-evaluation-2026-09-15.json"],
    });
    const left = child("left", "[]");
    const right = child("right", "[1]");
    let head = { generation: 1, revisionHash: parentHash };
    let pointer = Buffer.from(JSON.stringify({
      schemaVersion: "scamdunk.artifact-pointer/v2", scanDate: "2026-09-15",
      publicationGeneration: 1, parentRevisionHash: null, revisionHash: parentHash,
      manifestPath: `revisions/2026-09-15/${parentHash}/manifest.json`,
    }));
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/rpc/claim_evaluation_artifact_publication")) {
        const body = JSON.parse(String(init?.body));
        if (body.parent_revision_hash_input !== head.revisionHash || body.generation_input !== head.generation + 1) {
          return new Response("stale", { status: 409 });
        }
        head = { generation: body.generation_input, revisionHash: body.revision_hash_input };
        return new Response("true", { status: 200 });
      }
      if (url.includes("EvaluationArtifactPublicationHead")) {
        return new Response(JSON.stringify([{
          publicationGeneration: head.generation,
          revisionHash: head.revisionHash,
          parentRevisionHash: head.generation === 1 ? null : parentHash,
        }]), { status: 200 });
      }
      if (url.includes("current.json")) {
        if (init?.method === "POST") {
          pointer = Buffer.from(init.body as Uint8Array);
          return new Response("{}", { status: 200 });
        }
        return new Response(pointer.toString("utf8"), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    const results = await Promise.allSettled([left, right].map((plan) =>
      executeRevisionUploadPlan({
        config: { supabaseUrl: "https://example.supabase.co", serviceKey: "secret" },
        operations: plan.operations, fetchImpl: fetchImpl as typeof fetch,
      }),
    ));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(JSON.parse(pointer.toString()).revisionHash).toBe(head.revisionHash);
  });

  it("repairs the pointer when an older duplicate resumes after a newer head wins", async () => {
    const old = createRevisionUploadPlan({
      scanDate: "2026-09-15", producerRunId: "old", files: { "old.json": Buffer.from("old") },
      required: ["old.json"],
    });
    const newerHash = "d".repeat(64);
    let head = {
      publicationGeneration: 1,
      parentRevisionHash: null as string | null,
      revisionHash: old.manifest.revisionHash,
    };
    let pointer = Buffer.from(old.operations.at(-1)!.content);
    let pointerWrites = 0;
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/rpc/")) return new Response("true", { status: 200 });
      if (url.includes("EvaluationArtifactPublicationHead")) {
        return new Response(JSON.stringify([head]), { status: 200 });
      }
      if (url.includes("current.json")) {
        if (init?.method === "POST") {
          pointer = Buffer.from(init.body as Uint8Array);
          pointerWrites++;
          if (pointerWrites === 1) {
            head = {
              publicationGeneration: 2,
              parentRevisionHash: old.manifest.revisionHash,
              revisionHash: newerHash,
            };
          }
          return new Response("{}", { status: 200 });
        }
        return new Response(pointer.toString("utf8"), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    // Force the first write by presenting a missing pointer after the old claim.
    pointer = Buffer.from("{}");
    await expect(executeRevisionUploadPlan({
      config: { supabaseUrl: "https://example.supabase.co", serviceKey: "secret" },
      operations: old.operations, fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow("superseded");
    expect(pointerWrites).toBe(2);
    expect(JSON.parse(pointer.toString()).revisionHash).toBe(newerHash);
  });

  it("treats an existing immutable object as a retry only when bytes match", async () => {
    const plan = createRevisionUploadPlan({
      scanDate: "2026-09-15",
      producerRunId: "gha-123",
      files: { "enhanced-evaluation-2026-09-15.json": Buffer.from("[]") },
      required: ["enhanced-evaluation-2026-09-15.json"],
    });
    const existing = plan.operations[0].content;
    let currentPointer: Uint8Array | null = null;
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("EvaluationArtifactPublicationHead")) {
        return new Response(JSON.stringify([{
          publicationGeneration: plan.manifest.publicationGeneration,
          revisionHash: plan.manifest.revisionHash,
          parentRevisionHash: plan.manifest.parentRevisionHash,
        }]), { status: 200 });
      }
      if (String(url).includes("current.json")) {
        if (init?.method === "POST") {
          currentPointer = init.body as Uint8Array;
          return new Response("{}", { status: 200 });
        }
        return currentPointer
          ? new Response(new TextDecoder().decode(currentPointer), { status: 200 })
          : new Response("missing", { status: 404 });
      }
      if (String(url).includes(plan.operations[0].path)) {
        if (init?.method === "POST") return new Response("exists", { status: 409 });
        return new Response(new Uint8Array(existing), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    await expect(
      executeRevisionUploadPlan({
        config: {
          supabaseUrl: "https://example.supabase.co",
          serviceKey: "secret",
        },
        operations: plan.operations,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBeUndefined();
  });
});
