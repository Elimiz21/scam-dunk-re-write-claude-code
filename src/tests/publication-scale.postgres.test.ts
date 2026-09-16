import { readFileSync } from "node:fs";
import path from "node:path";
let mockStatsClient: PrismaClient;
jest.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get(_target, key) {
  const value = (mockStatsClient as any)[key];
  return typeof value === "function" ? value.bind(mockStatsClient) : value;
} }) }));
import { GET as siteStats } from "@/app/api/stats/site/route";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
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
  mockStatsClient = client;
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
    const migration = readFileSync(path.join(process.cwd(), "prisma/migrations/20260917010000_promoted_entry_price_nullable/migration.sql"), "utf8");
    await client.$transaction(async (tx) => {
      for (const statement of migration.split(";").filter((sql) => sql.trim())) await tx.$executeRawUnsafe(statement);
    });
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
  test("retains source IEEE bits for every publication float insert and source update", async () => {
    const input = await inputFor("2092-05-05", 8);
    const values = [3965061512412.9995, 3562492932151.0005, 0, null, -0, 0.10000000000000002, 1e-300, undefined];
    const suppliedTimestamp = new Date("2091-01-01T00:00:00Z");
    const snapshotFields = ["lastPrice", "previousClose", "priceChangePct", "volumeRatio", "marketCap"];
    const promotedFields = ["entryPrice", "entryMarketCap", "peakPrice", "currentPrice", "maxGainPct", "currentGainPct"];
    const snapshots = input.snapshots.map((row, i) => ({ ...row, id: `float-snapshot-${i}`, createdAt: suppliedTimestamp, ...Object.fromEntries(snapshotFields.map((field) => [field, values[i]])) }));
    const alerts = snapshots.map((row, i) => ({ id: `float-alert-${i}`, createdAt: suppliedTimestamp, stockId: row.stockId, alertDate: input.scanDate, alertType: "FLOAT_TEST", newRiskLevel: "HIGH", newScore: 70, priceAtAlert: values[i] }));
    const promoted = snapshots.map((row, i) => ({ id: `float-promoted-${i}`, createdAt: suppliedTimestamp, updatedAt: suppliedTimestamp, symbol: stocks[i].symbol, addedDate: input.scanDate, promoterName: "Float fixture", promotionPlatform: "Offline", entryRiskScore: 70, entryPrice: values[i] ?? 0, ...Object.fromEntries(promotedFields.filter((field) => field !== "entryPrice").map((field) => [field, values[i]])) }));
    const bits = (value: number | null | undefined) => {
      if (value == null) return null;
      const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value); return bytes.toString("hex");
    };
    const assertBits = async (table: string, id: string, fields: string[], expected: Array<number | null | undefined>) => {
      const rows = await client.$queryRaw<Array<Record<string, string | null>>>(Prisma.sql`
        SELECT ${Prisma.join(fields.map((field) => Prisma.sql`encode(float8send(${Prisma.raw(`"${field}"`)}), 'hex') AS ${Prisma.raw(`"${field}"`)}`))}
        FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id}`);
      expect(rows[0]).toEqual(Object.fromEntries(fields.map((field, i) => [field, bits(expected[i])])));
    };
    await new PrismaIngestionStore(client).publishEvaluationRevision({ ...input, snapshots, alerts, promotedStocks: promoted });
    for (let i = 0; i < values.length; i++) {
      const snapshot = await client.stockDailySnapshot.findUniqueOrThrow({ where: { stockId_scanDate: { stockId: stocks[i].id, scanDate: input.scanDate } } });
      const alert = await client.stockRiskAlert.findFirstOrThrow({ where: { stockId: stocks[i].id, alertDate: input.scanDate } });
      const promotion = await client.promotedStock.findUniqueOrThrow({ where: { symbol_addedDate: { symbol: stocks[i].symbol, addedDate: input.scanDate } } });
      expect(snapshot).toMatchObject({ id: `float-snapshot-${i}`, createdAt: suppliedTimestamp });
      expect(alert).toMatchObject({ id: `float-alert-${i}`, createdAt: suppliedTimestamp });
      expect(promotion).toMatchObject({ id: `float-promoted-${i}`, createdAt: suppliedTimestamp, updatedAt: suppliedTimestamp });
      await assertBits("StockDailySnapshot", snapshot.id, snapshotFields, snapshotFields.map(() => values[i]));
      await assertBits("StockRiskAlert", alert.id, ["priceAtAlert"], [values[i]]);
      await assertBits("PromotedStock", promotion.id, promotedFields, promotedFields.map((field) => field === "entryPrice" ? values[i] ?? 0 : values[i]));
    }
    // A fresh date with pre-existing rows exercises source updates separately;
    // omitted source fields and independently tracked outcomes must survive.
    const next = await inputFor("2092-05-06");
    const existingAlert = await client.stockRiskAlert.create({ data: { ...alerts[0], id: "float-update-alert", alertDate: next.scanDate, priceAtAlert: 10, notes: "retain float operator note" } });
    const existingPromoted = await client.promotedStock.create({ data: { ...promoted[0], id: "float-update-promoted", addedDate: next.scanDate, entryPrice: 10, entryMarketCap: 20, peakPrice: 99 } });
    await new PrismaIngestionStore(client).publishEvaluationRevision({ ...next,
      alerts: [{ ...alerts[0], alertDate: next.scanDate, priceAtAlert: -0 }],
      promotedStocks: [{ symbol: stocks[0].symbol, addedDate: next.scanDate, promoterName: "Updated", promotionPlatform: "Offline", entryRiskScore: 70, entryPrice: values[0]!, peakPrice: 1 }],
    });
    await assertBits("StockRiskAlert", existingAlert.id, ["priceAtAlert"], [-0]);
    await assertBits("PromotedStock", existingPromoted.id, ["entryPrice", "entryMarketCap", "peakPrice"], [values[0], 20, 99]);
    expect(await client.stockRiskAlert.findUnique({ where: { id: existingAlert.id } })).toMatchObject({ notes: "retain float operator note" });
  });

  test("rolls back inserted rows when exact float restoration fails", async () => {
    const input = await inputFor("2092-05-07");
    input.snapshots[0].marketCap = 3965061512412.9995;
    const failing = client.$extends({ query: { $allOperations: async ({ operation, args, query }) => {
      if (operation === "$executeRaw" && JSON.stringify(args).includes("StockDailySnapshot")) {
        throw new Error("Injected exact float transport failure");
      }
      return query(args);
    } } });
    await expect(new PrismaIngestionStore(failing as unknown as PrismaClient).publishEvaluationRevision(input)).rejects.toThrow("Injected exact float transport failure");
    expect(await client.stockDailySnapshot.count({ where: { scanDate: input.scanDate } })).toBe(0);
    expect(await client.dailyScanSummary.count({ where: { scanDate: input.scanDate } })).toBe(0);
    expect(await client.evaluationArtifactRevision.findUnique({ where: { revisionHash: input.revisionHash } })).toMatchObject({ status: "INGESTING", publishedAt: null });
  });

  test("publishes null, omitted and zero promoted entry prices without resetting existing outcomes", async () => {
    const input = await inputFor("2092-06-01");
    const rows = [null, undefined, 0].map((entryPrice, i) => ({ symbol: `UNKNOWN${i}`, addedDate: input.scanDate, entryPrice, promoterName: "Retained", promotionPlatform: "Offline", entryRiskScore: 10 }));
    const oldTime = new Date("2091-01-01T00:00:00Z");
    const existing = await client.promotedStock.create({ data: { ...rows[0], id: "unknown-existing", entryPrice: 2, peakPrice: 99, currentPrice: 88, currentGainPct: 4300, maxGainPct: 4850, outcome: "PUMPING", createdAt: oldTime } });
    await new PrismaIngestionStore(client).publishEvaluationRevision({ ...input, promotedStocks: rows });
    expect(await client.promotedStock.findUnique({ where: { id: existing.id } })).toMatchObject({ id: existing.id, entryPrice: null, peakPrice: 99, currentPrice: 88, currentGainPct: 4300, maxGainPct: 4850, outcome: "PUMPING", createdAt: oldTime });
    for (const [i, expected] of Array.from([null, null, 0].entries())) {
      expect(await client.promotedStock.findUnique({ where: { symbol_addedDate: { symbol: `UNKNOWN${i}`, addedDate: input.scanDate } } })).toMatchObject({ entryPrice: expected });
    }
  });

  test("site performance counts exclude unknown and zero entry while flag counts retain them", async () => {
    const before = await (await siteStats()).json();
    await client.promotedStock.createMany({ data: [null, 0, -1, 2].flatMap((entryPrice, i) => ["DUMPED", "PUMPING"].map((outcome) => ({ symbol: `STATS-${i}-${outcome}`, addedDate: new Date(), promoterName: "Fixture", promotionPlatform: "Offline", entryRiskScore: 10, entryPrice, outcome, isActive: true }))) });
    const after = await (await siteStats()).json();
    expect(after.dumpsConfirmed6mo - before.dumpsConfirmed6mo).toBe(1);
    expect(after.dumpsConfirmed30d - before.dumpsConfirmed30d).toBe(1);
    expect(after.pumpingNow - before.pumpingNow).toBe(1);
    expect(after.newFlagSymbols7d - before.newFlagSymbols7d).toBe(8);
  });

});
