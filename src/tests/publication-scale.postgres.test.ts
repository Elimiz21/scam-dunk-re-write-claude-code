import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { buildArtifactManifest } from "@/lib/admin/artifact-ingestion";
import { PrismaIngestionStore } from "@/lib/admin/prisma-ingestion-store";

const databaseUrl = process.env.PUBLICATION_SCALE_DATABASE_URL;
// Validate before constructing clients or registering cleanup hooks. A bad
// fixture URL must never reach connection setup, including afterAll cleanup.
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("Scale fixtures require a local PostgreSQL URL");
  }
}
const describePostgres = databaseUrl ? describe : describe.skip;
const tables = ["TrackedStock", "StockDailySnapshot", "StockRiskAlert", "PromotedStock", "DailyScanSummary", "EvaluationArtifactRevision", "EvaluationArtifactPublicationHead", "EvaluationArtifactObject", "EvaluationIngestionPhase"];

describePostgres("bounded full-date publication on PostgreSQL", () => {
  const schema = `publication_scale_2092_${randomUUID().replaceAll("-", "")}`;
  const baseUrl = databaseUrl ?? "postgresql://skip@127.0.0.1:1/skip";
  const isolatedUrl = new URL(baseUrl);
  isolatedUrl.searchParams.set("schema", schema);
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  const client = new PrismaClient({ datasources: { db: { url: isolatedUrl.toString() } }, log: [{ emit: "event", level: "query" }] });
  let measure = false;
  let queries = 0;
  let createdSchema = false;
  client.$on("query", () => { if (measure) queries++; });
  const stocks = Array.from({ length: 6551 }, (_, i) => ({ id: `scale-stock-${i}`, symbol: `SCALE${i}`, name: `Offline scale ${i}`, exchange: "NASDAQ" }));

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    createdSchema = true;
    for (const table of tables) await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    const foreignKeys = await admin.$queryRawUnsafe<Array<{ table: string; name: string; definition: string }>>(
      `SELECT c.relname AS "table", con.conname AS "name", pg_get_constraintdef(con.oid) AS definition
       FROM pg_constraint con JOIN pg_class c ON con.conrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'public' AND con.contype = 'f' AND c.relname = ANY($1::text[])`, tables,
    );
    for (const fk of foreignKeys) {
      const definition = fk.definition.replace(/REFERENCES (?:public\.)?"([^"]+)"/g, `REFERENCES "${schema}"."$1"`);
      await admin.$executeRawUnsafe(`ALTER TABLE "${schema}"."${fk.table}" ADD CONSTRAINT "${fk.name}" ${definition}`);
    }
    expect(foreignKeys.length).toBeGreaterThan(0);
    await client.trackedStock.createMany({ data: stocks.slice(0, 6000) });
  }, 30_000);

  afterAll(async () => {
    await client.$disconnect();
    if (createdSchema) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  });

  async function inputFor(date: string, count = 1) {
    const scanDate = new Date(`${date}T00:00:00Z`);
    const filename = `enhanced-evaluation-${date}.json`;
    const manifest = buildArtifactManifest({ scanDate: date, producerRunId: `scale-${date}`, files: { [filename]: Buffer.from("[]") }, required: [filename] });
    const store = new PrismaIngestionStore(client);
    await store.ensureRevision(manifest, ["CANONICAL_PUBLISH"]);
    const claim = await store.claimPhase(manifest.revisionHash, "CANONICAL_PUBLISH", "scale-test", 600_000);
    if (claim.state !== "CLAIMED") throw new Error("Fixture lease was not claimed");
    return {
      revisionHash: manifest.revisionHash, phase: "CANONICAL_PUBLISH", leaseToken: claim.leaseToken, scanDate,
      snapshots: stocks.slice(0, count).map((stock) => ({ stockId: stock.id, scanDate, riskLevel: "HIGH", totalScore: 70, isLegitimate: null, isInsufficient: null, lastPrice: 2, previousClose: 1, priceChangePct: 100, volume: 100, avgVolume: 100, volumeRatio: 1, marketCap: 1_000_000, signals: "[]", signalSummary: null, signalCount: 0, dataSource: null, sourceObservedAt: null, sourceVersion: null, evaluatedAt: scanDate })),
      alerts: [] as Array<{ stockId: string; alertDate: Date; alertType: string; newRiskLevel: string; newScore: number; previousScore?: number; notes?: string }>,
      promotedStocks: [] as Array<{ symbol: string; addedDate: Date; promoterName: string; promotionPlatform: string; entryPrice: number; entryRiskScore: number; peakPrice?: number; outcome?: string; isActive?: boolean }>,
      summary: { totalStocks: count, evaluated: count, skippedNoData: 0, lowRiskCount: 0, mediumRiskCount: 0, highRiskCount: count, insufficientCount: 0, byExchange: "{}" },
    };
  }

  test("publishes 6551 snapshots and 1447 alerts with bounded query count while preserving operator/outcome state", async () => {
    const input = await inputFor("2092-01-11", 6551);
    input.alerts = stocks.slice(0, 1447).map((stock) => ({ stockId: stock.id, alertDate: input.scanDate, alertType: "NEW_HIGH_RISK", newRiskLevel: "HIGH", newScore: 70, previousScore: 3 }));
    const oldTime = new Date("2091-01-01T00:00:00Z");
    await client.stockRiskAlert.createMany({ data: input.alerts.slice(0, 1000).map((alert, i) => ({ ...alert, id: `existing-alert-${i}`, createdAt: oldTime, isAcknowledged: i === 0, notes: i === 0 ? "operator note" : null })) });
    await client.stockRiskAlert.createMany({ data: [
      { ...input.alerts[0], id: "later-annotated-duplicate", createdAt: new Date("2091-02-01"), notes: "duplicate operator note" },
      { ...input.alerts[0], id: "obsolete-machine-alert", alertType: "OBSOLETE" },
    ] });
    input.alerts.push({ ...input.alerts[0], newScore: 99, previousScore: undefined });
    input.alerts.push({ ...input.alerts[1001], newScore: 88, previousScore: undefined, notes: "must not overwrite first-create notes" });
    input.promotedStocks = stocks.slice(0, 1000).map((stock) => ({ symbol: stock.symbol, addedDate: input.scanDate, promoterName: "Retained source", promotionPlatform: "Fixture", entryPrice: 2, entryRiskScore: 70, outcome: "MONITORING" }));
    await client.promotedStock.createMany({ data: input.promotedStocks.slice(0, 500).map((row, i) => ({ ...row, id: `existing-promoted-${i}`, createdAt: oldTime, peakPrice: 99, currentPrice: 12, outcome: "DUMPED", isActive: false })) });
    input.promotedStocks.push({ ...input.promotedStocks[0], entryPrice: 3, peakPrice: 0, outcome: "RESET", isActive: true });
    let budgetDelayApplied = false;
    const delayed = client.$extends({ query: { $allOperations: async ({ args, query }) => {
      if (measure) {
        // The old default five-second transaction must fail this fixture even
        // on loopback. Bulk operations also retain modest per-call latency.
        if (!budgetDelayApplied) { budgetDelayApplied = true; await new Promise((r) => setTimeout(r, 5_500)); }
        await new Promise((r) => setTimeout(r, 2));
      }
      return query(args);
    } } });
    const started = Date.now(); queries = 0; measure = true;
    let result;
    try {
      result = await new PrismaIngestionStore(delayed as unknown as PrismaClient).publishEvaluationRevision({ ...input,
        newStocks: stocks.slice(6000),
        trackedStockUpdates: stocks.slice(0, 6000).map((stock) => ({ id: stock.id, data: { exchange: "NYSE", isOTC: false } })),
      });
    } finally { measure = false; }
    const elapsedMs = Date.now() - started;
    expect(result).toMatchObject({ snapshotsCreated: 6551, alertsCreated: 447, stocksCreated: 551, promotedStocksCreated: 1001 });
    expect(queries).toBeLessThan(150);
    expect(elapsedMs).toBeLessThan(30_000);
    expect(await client.stockDailySnapshot.count({ where: { scanDate: input.scanDate } })).toBe(6551);
    expect(await client.stockRiskAlert.findUnique({ where: { id: "existing-alert-0" } })).toMatchObject({ id: "existing-alert-0", isAcknowledged: true, notes: "operator note", createdAt: oldTime, newScore: 99, previousScore: 3 });
    expect(await client.stockRiskAlert.findUnique({ where: { id: "later-annotated-duplicate" } })).toMatchObject({ notes: "duplicate operator note" });
    expect(await client.stockRiskAlert.findUnique({ where: { id: "obsolete-machine-alert" } })).toBeNull();
    const duplicateNew = await client.stockRiskAlert.findMany({ where: { stockId: stocks[1001].id, alertDate: input.scanDate } });
    expect(duplicateNew).toHaveLength(1);
    expect(duplicateNew[0]).toMatchObject({ newScore: 88, previousScore: 3, notes: null });
    expect(await client.promotedStock.findUnique({ where: { id: "existing-promoted-0" } })).toMatchObject({ id: "existing-promoted-0", entryPrice: 3, peakPrice: 99, currentPrice: 12, outcome: "DUMPED", isActive: false, createdAt: oldTime });
    expect(await client.trackedStock.findUnique({ where: { id: stocks[0].id } })).toMatchObject({ name: stocks[0].name, exchange: "NYSE", isOTC: false });
    expect(await client.evaluationArtifactRevision.findUnique({ where: { revisionHash: input.revisionHash } })).toMatchObject({ status: "PUBLISHED" });
    console.info(JSON.stringify({ fixture: "publication-scale", snapshots: 6551, alerts: 1447, trackedUpdates: 6000, promotedInputs: 1001, injectedInitialDelayMs: 5500, injectedPerOperationDelayMs: 2, elapsedMs, queries }));
  }, 45_000);

  test("rolls back all bulk writes when final publication fails", async () => {
    const input = await inputFor("2092-02-02", 2);
    const originalStock = await client.trackedStock.findUniqueOrThrow({ where: { id: stocks[0].id } });
    await client.stockDailySnapshot.create({ data: { ...input.snapshots[0], id: "rollback-original-snapshot", totalScore: 5, lastPrice: 50 } });
    input.alerts = [{ stockId: stocks[0].id, alertDate: input.scanDate, alertType: "NEW_HIGH_RISK", newRiskLevel: "HIGH", newScore: 90 }];
    await client.stockRiskAlert.create({ data: { ...input.alerts[0], id: "rollback-original-alert", newScore: 5, notes: "keep note", isAcknowledged: true } });
    const failing = client.$extends({ query: { dailyScanSummary: { upsert: async () => { throw new Error("Injected final summary failure"); } } } });
    await expect(new PrismaIngestionStore(failing as unknown as PrismaClient).publishEvaluationRevision({ ...input, trackedStockUpdates: [{ id: stocks[0].id, data: { exchange: "OTC", isOTC: true } }] })).rejects.toThrow("Injected final summary failure");
    expect(await client.stockDailySnapshot.findMany({ where: { scanDate: input.scanDate } })).toEqual([expect.objectContaining({ id: "rollback-original-snapshot", totalScore: 5, lastPrice: 50 })]);
    expect(await client.stockRiskAlert.findUnique({ where: { id: "rollback-original-alert" } })).toMatchObject({ newScore: 5, notes: "keep note", isAcknowledged: true });
    expect(await client.trackedStock.findUnique({ where: { id: stocks[0].id } })).toMatchObject({ exchange: originalStock.exchange, isOTC: originalStock.isOTC });
    expect(await client.evaluationArtifactRevision.findUnique({ where: { revisionHash: input.revisionHash } })).toMatchObject({ status: "INGESTING", publishedAt: null });
  });

  test("rejects a stale lease before any canonical writes", async () => {
    const input = await inputFor("2092-03-03");
    await expect(new PrismaIngestionStore(client).publishEvaluationRevision({ ...input, leaseToken: "wrong-lease" })).rejects.toThrow("Lost lease");
    expect(await client.stockDailySnapshot.count({ where: { scanDate: input.scanDate } })).toBe(0);
    expect(await client.dailyScanSummary.count({ where: { scanDate: input.scanDate } })).toBe(0);
  });

  test("retries a raw PostgreSQL serialization conflict without partial publication", async () => {
    const input = await inputFor("2092-04-04");
    let interfered = false;
    const conflicts: string[] = [];
    const contended = client.$extends({ query: { $allOperations: async ({ operation, args, query }) => {
      if (operation === "$executeRaw" && JSON.stringify(args).includes("TrackedStock") && !interfered) {
        interfered = true;
        // The publication already established its Serializable snapshot by
        // reading its fence/lease. This separate commit must force a restart.
        await client.trackedStock.update({ where: { id: stocks[0].id }, data: { exchange: "AMEX" } });
      }
      try { return await query(args); }
      catch (error) {
        const known = error as { code?: string; meta?: { code?: string } };
        if (known.code === "P2010" && known.meta?.code === "40001") conflicts.push("40001");
        throw error;
      }
    } } });
    const result = await new PrismaIngestionStore(contended as unknown as PrismaClient).publishEvaluationRevision({ ...input,
      trackedStockUpdates: [{ id: stocks[0].id, data: { exchange: "NYSE", isOTC: false } }],
    });
    expect(conflicts).toEqual(["40001"]);
    expect(result.snapshotsCreated).toBe(1);
    expect(await client.stockDailySnapshot.count({ where: { scanDate: input.scanDate } })).toBe(1);
    expect(await client.dailyScanSummary.count({ where: { scanDate: input.scanDate } })).toBe(1);
    expect(await client.trackedStock.findUnique({ where: { id: stocks[0].id } })).toMatchObject({ exchange: "NYSE" });
    expect(await client.evaluationArtifactRevision.findUnique({ where: { revisionHash: input.revisionHash } })).toMatchObject({ status: "PUBLISHED" });
  });
});
