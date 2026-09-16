import {
  createRevisionUploadPlan,
  executeRevisionUploadPlan,
  extractProducerExecutedAt,
  requireStoragePublisherConfig,
} from "../../evaluation/scripts/storage-publisher";

describe("server-side evaluation artifact publication", () => {
  const jwt = (payload: Record<string, unknown>) =>
    [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(JSON.stringify(payload)).toString("base64url"),
      "test-signature",
    ].join(".");

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
  });

  it("treats an existing immutable object as a retry only when bytes match", async () => {
    const plan = createRevisionUploadPlan({
      scanDate: "2026-09-15",
      producerRunId: "gha-123",
      files: { "enhanced-evaluation-2026-09-15.json": Buffer.from("[]") },
      required: ["enhanced-evaluation-2026-09-15.json"],
    });
    const existing = plan.operations[0].content;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response("exists", { status: 409 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(existing), { status: 200 }))
      .mockResolvedValue(new Response("{}", { status: 200 }));

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
