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
    await client.evaluationArtifactPublicationHead.deleteMany({
      where: { scanDate: new Date(`${scanDate}T00:00:00.000Z`) },
    });
    await client.evaluationArtifactRevision.deleteMany({
      where: { scanDate: new Date(`${scanDate}T00:00:00.000Z`) },
    });
  });

  afterAll(async () => {
    await client.evaluationArtifactRevision.deleteMany({
      where: { scanDate: new Date(`${scanDate}T00:00:00.000Z`) },
    });
    await client.evaluationArtifactPublicationHead.deleteMany({
      where: { scanDate: new Date(`${scanDate}T00:00:00.000Z`) },
    });
    await client.$disconnect();
  });

  function revision(run: string, content: string, publicationGeneration = 1, parentRevisionHash: string | null = null) {
    const name = `enhanced-evaluation-${scanDate}.json`;
    return buildArtifactManifest({
      scanDate,
      producerRunId: run,
      files: { [name]: Buffer.from(content) },
      required: [name],
      publicationGeneration,
      parentRevisionHash,
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

    const second = revision("pg-run-2", '[{"symbol":"LATE"}]', 2, first.revisionHash);
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

  it("shares unchanged content paths across revisions and fences delayed older publication", async () => {
    const date = "2099-09-17";
    const scan = new Date(`${date}T00:00:00.000Z`);
    await client.evaluationArtifactRevision.deleteMany({ where: { scanDate: scan } });
    await client.evaluationArtifactPublicationHead.deleteMany({ where: { scanDate: scan } });
    const evalName = `enhanced-evaluation-${date}.json`;
    const summaryName = `fmp-summary-${date}.json`;
    const first = buildArtifactManifest({
      scanDate: date, producerRunId: "shared-1", publicationGeneration: 1,
      files: { [evalName]: Buffer.from("[]"), [summaryName]: Buffer.from('{"evaluated":0}') },
      required: [evalName, summaryName],
    });
    const second = buildArtifactManifest({
      scanDate: date, producerRunId: "shared-2", publicationGeneration: 2,
      parentRevisionHash: first.revisionHash,
      files: { [evalName]: Buffer.from('[{"symbol":"LATE"}]'), [summaryName]: Buffer.from('{"evaluated":0}') },
      required: [evalName, summaryName],
    });
    const store = new PrismaIngestionStore(client);
    await store.ensureRevision(first, ["OBSERVATIONS"]);
    const olderClaim = await store.claimPhase(first.revisionHash, "OBSERVATIONS", "older", 60_000);
    expect(olderClaim.state).toBe("CLAIMED");
    await store.completePhase(first.revisionHash, "OBSERVATIONS", olderClaim.leaseToken!);
    await expect(store.publishIfComplete(first.revisionHash, ["OBSERVATIONS"])).resolves.toBe(true);
    await store.ensureRevision(second, ["OBSERVATIONS"]);
    const sharedPath = first.artifacts.find((item) => item.logicalName === summaryName)!.storagePath;
    expect(await client.evaluationArtifactObject.count({ where: { storagePath: sharedPath } })).toBe(2);
    const newerClaim = await store.claimPhase(second.revisionHash, "OBSERVATIONS", "newer", 60_000);
    expect(newerClaim.state).toBe("CLAIMED");
    await store.completePhase(second.revisionHash, "OBSERVATIONS", newerClaim.leaseToken!);
    await expect(store.publishIfComplete(second.revisionHash, ["OBSERVATIONS"])).resolves.toBe(true);
    await expect(
      store.claimPhase(first.revisionHash, "OBSERVATIONS", "delayed-older", 60_000),
    ).rejects.toThrow("stale publication");
    const active = await client.evaluationArtifactRevision.findFirstOrThrow({ where: { scanDate: scan, status: "PUBLISHED" } });
    expect(active.revisionHash).toBe(second.revisionHash);
    await client.evaluationArtifactRevision.deleteMany({ where: { scanDate: scan } });
    await client.evaluationArtifactPublicationHead.deleteMany({ where: { scanDate: scan } });
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
    await client.evaluationArtifactPublicationHead.deleteMany({ where: { scanDate: canonicalScanDate } });

    let priorRevisionHash: string | null = null;
    let generation = 0;
    const publish = async (run: string, score: number, price: number) => {
      const filename = `enhanced-evaluation-${canonicalDate}.json`;
      const manifest = buildArtifactManifest({
        scanDate: canonicalDate,
        producerRunId: run,
        files: { [filename]: Buffer.from(JSON.stringify([{ score, price }])) },
        required: [filename],
        publicationGeneration: ++generation,
        parentRevisionHash: priorRevisionHash,
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
      priorRevisionHash = manifest.revisionHash;
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
    const delayedStore = new PrismaIngestionStore(client);
    await expect(delayedStore.claimPhase(
      first.revisionHash, "CANONICAL_PUBLISH", "delayed-old", 60_000,
    )).rejects.toThrow("stale publication");
    await expect(delayedStore.publishEvaluationRevision({
      revisionHash: first.revisionHash,
      phase: "CANONICAL_PUBLISH",
      leaseToken: "obsolete-lease",
      scanDate: canonicalScanDate,
      snapshots: [{
        stockId: stock.id, scanDate: canonicalScanDate, riskLevel: "LOW", totalScore: 10,
        isLegitimate: null, isInsufficient: null, lastPrice: 0, previousClose: 0,
        priceChangePct: 0, volume: 0, avgVolume: 0, volumeRatio: 0, marketCap: null,
        signals: "[]", signalSummary: null, signalCount: 0, dataSource: null,
        sourceObservedAt: null, sourceVersion: null, evaluatedAt: new Date(),
      }],
      alerts: [], promotedStocks: [],
      summary: {
        totalStocks: 1, evaluated: 1, skippedNoData: 0, lowRiskCount: 1,
        mediumRiskCount: 0, highRiskCount: 0, insufficientCount: 0,
        byExchange: "{}", bySector: null, scanDurationMins: 0, apiCallsMade: 0,
      },
    })).rejects.toThrow("stale publication");

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
    await client.evaluationArtifactPublicationHead.deleteMany({ where: { scanDate: canonicalScanDate } });
    await client.trackedStock.delete({ where: { id: stock.id } });
  });
});
