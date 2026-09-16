import { PrismaClient } from "@prisma/client";
import {
  CliIngestConflictError,
  ingestCliSocialScan,
  parseCliSocialIngestPayload,
} from "@/lib/social-scan/cli-ingest";

const databaseUrl = process.env.SOCIAL_CLI_INGEST_INTEGRATION_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("CLI social ingest PostgreSQL integration", () => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl ?? "postgresql://skip:skip@127.0.0.1:1/skip",
      },
    },
  });
  const ids = [
    "social-cli-2096-complete",
    "social-cli-2096-active-owner",
    "social-cli-2096-terminal-owner",
    "social-cli-2096-invalid",
  ];

  const rawPayload = (overrides: Record<string, unknown> = {}) => ({
    scanId: ids[0],
    scanDate: "2096-10-01",
    status: "COMPLETED",
    tickersScanned: 900,
    tickersWithMentions: 800,
    totalMentions: 700,
    platformsUsed: {
      version: 2,
      scanners: ["fixture"],
      stats: {},
      submittedTickers: ["AAPL"],
      persistence: {},
      coverage: [
        {
          scanner: "fixture",
          platform: "Fixture",
          status: "COMPLETED",
          submittedTickers: ["AAPL"],
          attemptedTickers: ["AAPL"],
          searchedTickers: ["AAPL"],
          failedTickers: [],
          rateLimitedTickers: [],
          skippedTickers: [],
        },
      ],
    },
    results: [
      {
        ticker: "AAPL",
        name: "Apple\u0000",
        platforms: [
          {
            mentions: [
              {
                platform: "Fixture",
                title: "retained 😀 \ud800",
                url: "https://example.test/cli-2096",
                promotionScore: 25,
                redFlags: ["flag \udfff"],
              },
            ],
          },
        ],
      },
    ],
    errors: ["source warning"],
    duration: 5,
    ...overrides,
  });

  beforeAll(async () => {
    await client.$connect();
    await client.socialScanRun.deleteMany({ where: { id: { in: ids } } });
  });

  afterAll(async () => {
    await client.socialScanRun.deleteMany({ where: { id: { in: ids } } });
    await client.$disconnect();
  });

  test("publishes canonical evidence once and accepts only identical retries", async () => {
    const parsed = parseCliSocialIngestPayload(rawPayload());
    if (!parsed.success) throw parsed.error;
    await expect(
      ingestCliSocialScan(client, parsed.data, { owner: "cli:postgres" }),
    ).resolves.toMatchObject({
      scanRunId: ids[0],
      status: "COMPLETED",
      totalMentions: 1,
      tickersWithMentions: 1,
      tickersScanned: 1,
      idempotent: false,
    });
    await expect(
      ingestCliSocialScan(client, parsed.data, { owner: "cli:postgres" }),
    ).resolves.toMatchObject({
      totalMentions: 1,
      idempotent: true,
    });

    const changed = parseCliSocialIngestPayload(
      rawPayload({ errors: ["conflicting retry"] }),
    );
    if (!changed.success) throw changed.error;
    await expect(
      ingestCliSocialScan(client, changed.data, { owner: "cli:postgres" }),
    ).rejects.toBeInstanceOf(CliIngestConflictError);

    const [run, mentions] = await Promise.all([
      client.socialScanRun.findUniqueOrThrow({ where: { id: ids[0] } }),
      client.socialMention.findMany({ where: { scanRunId: ids[0] } }),
    ]);
    expect(run).toMatchObject({
      status: "COMPLETED",
      tickersScanned: 1,
      tickersWithMentions: 1,
      totalMentions: 1,
      triggeredBy: "cli:postgres",
    });
    expect(JSON.parse(run.errors || "[]")).toEqual(["source warning"]);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      ticker: "AAPL",
      stockName: "Apple",
      title: "retained 😀 �",
    });
    expect(JSON.parse(mentions[0].redFlags || "[]")).toEqual(["flag �"]);
  });

  test("rejects orchestrator ownership and invalid mixed payloads without writes", async () => {
    await client.socialScanRun.createMany({
      data: [
        {
          id: ids[1],
          scanDate: new Date("2096-10-02T00:00:00.000Z"),
          status: "RUNNING",
          triggeredBy: "scheduled",
        },
        {
          id: ids[2],
          scanDate: new Date("2096-10-03T00:00:00.000Z"),
          status: "PARTIAL",
          triggeredBy: "manual",
        },
      ],
    });
    for (const scanId of [ids[1], ids[2]]) {
      const parsed = parseCliSocialIngestPayload(rawPayload({ scanId }));
      if (!parsed.success) throw parsed.error;
      await expect(
        ingestCliSocialScan(client, parsed.data, { owner: "cli:postgres" }),
      ).rejects.toBeInstanceOf(CliIngestConflictError);
    }

    const invalid = parseCliSocialIngestPayload(
      rawPayload({
        scanId: ids[3],
        results: [
          ...rawPayload().results,
          {
            ticker: "BAD",
            platforms: [{ mentions: [{ platform: "Fixture", postDate: "bad" }] }],
          },
        ],
      }),
    );
    expect(invalid.success).toBe(false);
    await expect(
      client.socialScanRun.findUnique({ where: { id: ids[3] } }),
    ).resolves.toBeNull();
  });
});
