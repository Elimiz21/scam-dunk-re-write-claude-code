import { PrismaClient } from "@prisma/client";
import { getTickerCoverage, parseRunMetadata } from "@/lib/social-scan/coverage";
import { reconcileStaleSocialRuns } from "@/lib/social-scan/stale-run-cleanup";

const databaseUrl = process.env.SOCIAL_CLEANUP_INTEGRATION_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("stale social scan PostgreSQL recovery", () => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url:
          databaseUrl ??
          "postgresql://skipped:skipped@127.0.0.1:1/skipped_integration",
      },
    },
  });
  const runIds = [
    "social-cleanup-2096-evidence",
    "social-cleanup-2096-empty",
    "social-cleanup-2096-fresh",
    "social-cleanup-2096-writer-locked",
  ];
  const now = new Date("2096-09-16T12:00:00.000Z");

  beforeAll(async () => {
    await client.$connect();
    await client.socialScanRun.deleteMany({ where: { id: { in: runIds } } });
    await client.socialScanRun.createMany({
      data: [
        {
          id: runIds[0],
          scanDate: new Date("2096-09-15T00:00:00.000Z"),
          status: "RUNNING",
          tickersScanned: 50,
          errors: JSON.stringify(["Original provider warning"]),
          platformsUsed: JSON.stringify(["youtube_api", "reddit_public"]),
          createdAt: new Date("2096-09-15T00:00:00.000Z"),
          updatedAt: new Date("2096-09-16T11:00:00.000Z"),
        },
        {
          id: runIds[1],
          scanDate: new Date("2096-09-14T00:00:00.000Z"),
          status: "RUNNING",
          tickersScanned: 17,
          errors: JSON.stringify(["Earlier warning"]),
          platformsUsed: JSON.stringify({ customAuditMarker: "empty-run" }),
          createdAt: new Date("2096-09-14T00:00:00.000Z"),
          updatedAt: new Date("2096-09-16T10:00:00.000Z"),
        },
        {
          id: runIds[2],
          scanDate: new Date("2096-09-13T00:00:00.000Z"),
          status: "RUNNING",
          tickersScanned: 4,
          createdAt: new Date("2096-09-13T00:00:00.000Z"),
          updatedAt: new Date("2096-09-16T11:55:00.000Z"),
        },
      ],
    });
    await client.socialMention.createMany({
      data: [
        {
          id: "social-cleanup-2096-mention-1",
          scanRunId: runIds[0],
          ticker: "AAPL",
          platform: "YouTube",
          source: "fixture",
          discoveredVia: "fixture",
          contentHash: "cleanup-2096-hash-1",
        },
        {
          id: "social-cleanup-2096-mention-2",
          scanRunId: runIds[0],
          ticker: "AAPL",
          platform: "Reddit",
          source: "fixture",
          discoveredVia: "fixture",
          contentHash: "cleanup-2096-hash-2",
        },
        {
          id: "social-cleanup-2096-mention-3",
          scanRunId: runIds[0],
          ticker: "MSFT",
          platform: "YouTube",
          source: "fixture",
          discoveredVia: "fixture",
          contentHash: "cleanup-2096-hash-3",
        },
      ],
    });
  });

  afterAll(async () => {
    await client.socialScanRun.deleteMany({ where: { id: { in: runIds } } });
    await client.$disconnect();
  });

  test("publishes retained evidence as PARTIAL and leaves fresh work RUNNING", async () => {
    await expect(
      reconcileStaleSocialRuns(client, { now }),
    ).resolves.toEqual({ expired: 2, partial: 1, timedOut: 1 });

    const rows = await client.socialScanRun.findMany({
      where: { id: { in: runIds } },
      orderBy: { id: "asc" },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const recovered = byId.get(runIds[0])!;
    expect(recovered).toMatchObject({
      status: "PARTIAL",
      tickersScanned: 50,
      tickersWithMentions: 2,
      totalMentions: 3,
    });
    expect(JSON.parse(recovered.errors || "[]")).toEqual([
      "Original provider warning",
      expect.stringContaining("retained evidence"),
    ]);
    const recoveredMetadata = JSON.parse(recovered.platformsUsed || "{}");
    expect(recoveredMetadata).toMatchObject({
      legacyPlatformsUsed: ["youtube_api", "reddit_public"],
      staleRunRecovery: {
        coverageStatus: "UNKNOWN",
        retainedMentions: 3,
        retainedTickers: ["AAPL", "MSFT"],
        retainedPlatforms: ["Reddit", "YouTube"],
      },
    });
    expect(
      getTickerCoverage(parseRunMetadata(recovered.platformsUsed), "AAPL")
        .status,
    ).toBe("UNKNOWN");
    const lateWriterAccepted = await client.$transaction(async (tx) => {
      const running = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "SocialScanRun"
         WHERE "id" = $1 AND "status" = 'RUNNING'
         FOR UPDATE`,
        runIds[0],
      );
      if (running.length === 0) return false;
      await tx.socialMention.create({
        data: {
          scanRunId: runIds[0],
          ticker: "LATE",
          platform: "Fixture",
          source: "fixture",
          discoveredVia: "fixture",
          contentHash: "cleanup-2096-late-writer",
        },
      });
      return true;
    });
    expect(lateWriterAccepted).toBe(false);
    await expect(
      client.socialMention.count({ where: { scanRunId: runIds[0] } }),
    ).resolves.toBe(3);

    expect(byId.get(runIds[1])).toMatchObject({
      status: "TIMED_OUT",
      tickersScanned: 17,
      tickersWithMentions: 0,
      totalMentions: 0,
    });
    expect(byId.get(runIds[2])).toMatchObject({
      status: "RUNNING",
      tickersScanned: 4,
    });
  });

  test("skips a stale row while a writer owns its lock", async () => {
    const lockedRunId = runIds[3];
    await client.socialScanRun.create({
      data: {
        id: lockedRunId,
        scanDate: new Date("2096-09-12T00:00:00.000Z"),
        status: "RUNNING",
        updatedAt: new Date("2096-09-16T10:00:00.000Z"),
      },
    });

    let releaseWriter!: () => void;
    let writerLocked!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      writerLocked = resolve;
    });
    const writer = client.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT "id" FROM "SocialScanRun" WHERE "id" = $1 FOR UPDATE`,
        lockedRunId,
      );
      writerLocked();
      await release;
      await tx.socialScanRun.update({
        where: { id: lockedRunId },
        data: { updatedAt: new Date("2096-09-16T11:59:00.000Z") },
      });
    });

    await acquired;
    try {
      await expect(
        reconcileStaleSocialRuns(client, { now }),
      ).resolves.toEqual({ expired: 0, partial: 0, timedOut: 0 });
    } finally {
      releaseWriter();
      await writer;
    }

    await expect(
      client.socialScanRun.findUniqueOrThrow({ where: { id: lockedRunId } }),
    ).resolves.toMatchObject({
      status: "RUNNING",
      totalMentions: 0,
      tickersWithMentions: 0,
    });
  });
});
