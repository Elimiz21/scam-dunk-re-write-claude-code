import { PrismaClient } from "@prisma/client";
import {
  buildArtifactManifest,
  runResumableIngestion,
} from "@/lib/admin/artifact-ingestion";
import { PrismaIngestionStore } from "@/lib/admin/prisma-ingestion-store";

const databaseUrl = process.env.ARTIFACT_INTEGRATION_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("artifact ingestion PostgreSQL integration", () => {
  const client = new PrismaClient({
    // Jest still evaluates a skipped describe callback. A syntactically valid
    // inert URL keeps the optional suite importable without opening a socket.
    datasources: {
      db: {
        url:
          databaseUrl ??
          "postgresql://skipped:skipped@127.0.0.1:1/skipped_integration",
      },
    },
  });
  const scanDate = "2099-09-15";

  beforeAll(async () => {
    await client.$connect();
    await client.evaluationArtifactRevision.deleteMany({
      where: { scanDate: new Date(`${scanDate}T00:00:00.000Z`) },
    });
  });

  afterAll(async () => {
    await client.evaluationArtifactRevision.deleteMany({
      where: { scanDate: new Date(`${scanDate}T00:00:00.000Z`) },
    });
    await client.$disconnect();
  });

  function revision(run: string, content: string) {
    const name = `enhanced-evaluation-${scanDate}.json`;
    return buildArtifactManifest({
      scanDate,
      producerRunId: run,
      files: { [name]: Buffer.from(content) },
      required: [name],
    });
  }

  it("fences concurrent workers and publishes one same-date revision atomically", async () => {
    const first = revision("pg-run-1", "[]");
    let executions = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = (workerId: string) =>
      runResumableIngestion({
        manifest: first,
        workerId,
        phases: ["OBSERVATIONS"],
        store: new PrismaIngestionStore(client),
        handlers: {
          OBSERVATIONS: async () => {
            executions++;
            await gate;
          },
        },
      });
    const workerOne = run("pg-worker-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const workerTwo = run("pg-worker-2");
    release();
    const concurrentResults = await Promise.all([workerOne, workerTwo]);
    expect(executions).toBe(1);
    expect(
      concurrentResults.every(
        (result) => result.status === "BUSY" || result.status === "PUBLISHED",
      ),
    ).toBe(true);
    expect(
      concurrentResults.some((result) => result.status === "PUBLISHED"),
    ).toBe(true);
    const phase = await client.evaluationIngestionPhase.findFirstOrThrow({
      where: { revision: { revisionHash: first.revisionHash } },
      select: { attemptCount: true, status: true },
    });
    expect(phase).toEqual({ attemptCount: 1, status: "COMPLETE" });

    const second = revision("pg-run-2", '[{"symbol":"LATE"}]');
    await runResumableIngestion({
      manifest: second,
      workerId: "pg-worker-3",
      phases: ["OBSERVATIONS"],
      store: new PrismaIngestionStore(client),
      handlers: { OBSERVATIONS: async () => undefined },
    });
    const rows = await client.evaluationArtifactRevision.findMany({
      where: { scanDate: new Date(`${scanDate}T00:00:00.000Z`) },
      select: { revisionHash: true, status: true },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        { revisionHash: first.revisionHash, status: "SUPERSEDED" },
        { revisionHash: second.revisionHash, status: "PUBLISHED" },
      ]),
    );
    expect(rows.filter((row) => row.status === "PUBLISHED")).toHaveLength(1);
  });

  it("replaces canonical observations and publication metadata in one transaction", async () => {
    const canonicalDate = "2099-09-16";
    const canonicalScanDate = new Date(`${canonicalDate}T00:00:00.000Z`);
    const stock = await client.trackedStock.upsert({
      where: { symbol: "PGATOMIC" },
      create: {
        symbol: "PGATOMIC",
        name: "PostgreSQL atomic publication fixture",
        exchange: "TEST",
      },
      update: {},
    });
    await client.dailyScanSummary.deleteMany({ where: { scanDate: canonicalScanDate } });
    await client.stockDailySnapshot.deleteMany({ where: { scanDate: canonicalScanDate } });
    await client.evaluationArtifactRevision.deleteMany({
      where: { scanDate: canonicalScanDate },
    });

    const publish = async (run: string, score: number, price: number) => {
      const filename = `enhanced-evaluation-${canonicalDate}.json`;
      const manifest = buildArtifactManifest({
        scanDate: canonicalDate,
        producerRunId: run,
        files: { [filename]: Buffer.from(JSON.stringify([{ score, price }])) },
        required: [filename],
      });
      const store = new PrismaIngestionStore(client);
      await store.ensureRevision(manifest, ["CANONICAL_PUBLISH"]);
      const claim = await store.claimPhase(
        manifest.revisionHash,
        "CANONICAL_PUBLISH",
        run,
        60_000,
      );
      expect(claim.state).toBe("CLAIMED");
      if (claim.state !== "CLAIMED") throw new Error("Expected phase lease");
      await store.publishEvaluationRevision({
        revisionHash: manifest.revisionHash,
        phase: "CANONICAL_PUBLISH",
        leaseToken: claim.leaseToken,
        scanDate: canonicalScanDate,
        snapshots: [
          {
            stockId: stock.id,
            scanDate: canonicalScanDate,
            riskLevel: score >= 50 ? "HIGH" : "LOW",
            totalScore: score,
            isLegitimate: null,
            isInsufficient: null,
            lastPrice: price,
            previousClose: 0,
            priceChangePct: 0,
            volume: 0,
            avgVolume: 0,
            volumeRatio: 0,
            marketCap: null,
            signals: "[]",
            signalSummary: null,
            signalCount: 0,
            dataSource: null,
            sourceObservedAt: null,
            sourceVersion: null,
            evaluatedAt: new Date(),
          },
        ],
        alerts: [
          {
            stockId: stock.id,
            alertDate: canonicalScanDate,
            alertType: "NEW_HIGH_RISK",
            newRiskLevel: score >= 50 ? "HIGH" : "LOW",
            newScore: score,
          },
        ],
        promotedStocks: [
          {
            symbol: "PGATOMIC",
            addedDate: canonicalScanDate,
            promoterName: "Offline fixture",
            promotionPlatform: "TEST",
            promotionGroup: "TEST",
            entryPrice: price,
            entryMarketCap: null,
            entryRiskScore: score,
            evidenceLinks: "retained fixture",
            outcome: "MONITORING",
            isActive: true,
          },
        ],
        summary: {
          totalStocks: 1,
          evaluated: 1,
          skippedNoData: 0,
          lowRiskCount: score < 50 ? 1 : 0,
          mediumRiskCount: 0,
          highRiskCount: score >= 50 ? 1 : 0,
          insufficientCount: 0,
          byExchange: JSON.stringify({ TEST: 1 }),
          bySector: null,
          scanDurationMins: 0,
          apiCallsMade: 0,
        },
      });
      return manifest;
    };

    const first = await publish("pg-canonical-1", 10, 0);
    await client.promotedStock.update({
      where: {
        symbol_addedDate: {
          symbol: "PGATOMIC",
          addedDate: canonicalScanDate,
        },
      },
      data: { outcome: "DUMPED", currentPrice: 1.25, isActive: false },
    });
    await client.stockRiskAlert.updateMany({
      where: { stockId: stock.id, alertDate: canonicalScanDate },
      data: { isAcknowledged: true, notes: "Operator-reviewed fixture" },
    });
    const second = await publish("pg-canonical-2", 90, 2.5);

    const [snapshots, alerts, promotedStocks, summary, revisions] = await Promise.all([
      client.stockDailySnapshot.findMany({
        where: { scanDate: canonicalScanDate },
        select: {
          totalScore: true,
          lastPrice: true,
          previousClose: true,
          artifactRevision: { select: { revisionHash: true, status: true } },
        },
      }),
      client.stockRiskAlert.findMany({
        where: { alertDate: canonicalScanDate },
        select: {
          newScore: true,
          newRiskLevel: true,
          isAcknowledged: true,
          notes: true,
        },
      }),
      client.promotedStock.findMany({
        where: { addedDate: canonicalScanDate },
        select: {
          entryPrice: true,
          entryRiskScore: true,
          outcome: true,
          currentPrice: true,
          isActive: true,
        },
      }),
      client.dailyScanSummary.findUniqueOrThrow({
        where: { scanDate: canonicalScanDate },
        select: {
          highRiskCount: true,
          publishedAt: true,
          artifactRevision: {
            select: { revisionHash: true, status: true, publishedAt: true },
          },
        },
      }),
      client.evaluationArtifactRevision.findMany({
        where: { scanDate: canonicalScanDate },
        select: { revisionHash: true, status: true },
      }),
    ]);

    expect(snapshots).toEqual([
      {
        totalScore: 90,
        lastPrice: 2.5,
        previousClose: 0,
        artifactRevision: {
          revisionHash: second.revisionHash,
          status: "PUBLISHED",
        },
      },
    ]);
    expect(alerts).toEqual([
      {
        newScore: 90,
        newRiskLevel: "HIGH",
        isAcknowledged: true,
        notes: "Operator-reviewed fixture",
      },
    ]);
    expect(promotedStocks).toEqual([
      {
        entryPrice: 2.5,
        entryRiskScore: 90,
        outcome: "DUMPED",
        currentPrice: 1.25,
        isActive: false,
      },
    ]);
    expect(summary).toEqual({
      highRiskCount: 1,
      publishedAt: expect.any(Date),
      artifactRevision: {
        revisionHash: second.revisionHash,
        status: "PUBLISHED",
        publishedAt: expect.any(Date),
      },
    });
    expect(summary.publishedAt?.getTime()).toBe(
      summary.artifactRevision?.publishedAt?.getTime(),
    );
    expect(revisions).toEqual(
      expect.arrayContaining([
        { revisionHash: first.revisionHash, status: "SUPERSEDED" },
        { revisionHash: second.revisionHash, status: "PUBLISHED" },
      ]),
    );
    expect(revisions.filter((row) => row.status === "PUBLISHED")).toHaveLength(1);

    await client.dailyScanSummary.deleteMany({ where: { scanDate: canonicalScanDate } });
    await client.stockDailySnapshot.deleteMany({ where: { scanDate: canonicalScanDate } });
    await client.stockRiskAlert.deleteMany({ where: { alertDate: canonicalScanDate } });
    await client.promotedStock.deleteMany({ where: { addedDate: canonicalScanDate } });
    await client.evaluationArtifactRevision.deleteMany({
      where: { scanDate: canonicalScanDate },
    });
    await client.trackedStock.delete({ where: { id: stock.id } });
  });
});
