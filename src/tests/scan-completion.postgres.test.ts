import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { beginScan, completeScan, failScan, recoverAbandonedScans, ScanConflict } from "@/lib/scan-completion";
import type { RiskResponse } from "@/lib/types";

const url = process.env.SCAN_COMPLETION_DATABASE_URL;
if (url && (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) || new URL(url).pathname !== "/scamdunk_test")) throw new Error("Disposable local database required");
const suite = url ? describe : describe.skip;
suite("durable scan completion PostgreSQL", () => {
  const client = new PrismaClient({ datasourceUrl: url ?? "postgresql://skip:skip@127.0.0.1:1/skip" });
  const userId = `completion-${randomUUID()}`;
  const metadata = { ticker: "AAPL", assetType: "stock", processingTime: 1, pitchProvided: false, contextProvided: false, isOtc: false, isMicroCap: false, isHighVolume: false, usedAiBackend: false };
  const payload = (): RiskResponse => ({ resultId: randomUUID(), schemaVersion: "1.1", scoringVersion: "test-v2", riskLevel: "LOW", totalScore: 0, signals: [], stockSummary: { ticker: "AAPL" }, narrative: { header: "Test", stockRedFlags: [], behaviorRedFlags: [], suggestions: [], disclaimers: [] }, usage: { plan: "FREE", scansUsedThisMonth: 1, scansLimitThisMonth: 10, limitReached: false } });
  beforeAll(async () => { await client.user.create({ data: { id: userId, email: `${userId}@example.invalid`, freeMonthlyScanCredits: 10 } }); });
  beforeEach(async () => {
    await client.scanOperation.deleteMany({ where: { userId } });
    await client.scanHistory.deleteMany({ where: { userId } });
    await client.scanUsage.deleteMany({ where: { userId } });
  });
  afterAll(async () => {
    await client.scanHistory.deleteMany({ where: { userId } });
    await client.user.delete({ where: { id: userId } }); await client.$disconnect();
  });
  async function reserve(key = "same") {
    const result = await beginScan(userId, key, { ticker: "AAPL" }, client);
    if (result.state !== "RESERVED") throw new Error(result.state);
    return result.lease;
  }
  test("concurrent duplicates reserve and charge once, then replay the exact immutable result", async () => {
    const attempts = await Promise.all(Array.from({ length: 8 }, () => beginScan(userId, "same", { ticker: "AAPL" }, client)));
    expect(attempts.filter((item) => item.state === "RESERVED")).toHaveLength(1);
    expect(attempts.filter((item) => item.state === "PENDING")).toHaveLength(7);
    const first = attempts.find((item) => item.state === "RESERVED")!;
    if (first.state !== "RESERVED") throw new Error("No reservation");
    const result = payload(); await completeScan(first.lease, result, metadata, client);
    expect(await beginScan(userId, "same", { ticker: "AAPL" }, client)).toEqual({ state: "COMPLETED", result });
    expect((await client.scanUsage.findFirstOrThrow({ where: { userId } })).scanCount).toBe(1);
    expect(await client.scanHistory.count({ where: { userId } })).toBe(1);
    expect(await client.scanHistory.findFirst({ where: { id: result.resultId, userId: "other-user" } })).toBeNull();
    await failScan(first.lease, "late error", client);
    expect((await client.scanUsage.findFirstOrThrow({ where: { userId } })).scanCount).toBe(1);
  });
  test("a key cannot silently change inputs", async () => {
    await reserve();
    await expect(beginScan(userId, "same", { ticker: "MSFT" }, client)).rejects.toThrow(ScanConflict);
  });
  test("history write failure rolls completion back and an exactly-once refund remains possible", async () => {
    const lease = await reserve();
    const failing = { $transaction: (fn: Function) => client.$transaction((tx) => fn(new Proxy(tx, { get(target, key) { return key === "scanHistory" ? { create: () => { throw new Error("injected history failure"); } } : Reflect.get(target, key); } }))) } as unknown as PrismaClient;
    await expect(completeScan(lease, payload(), metadata, failing)).rejects.toThrow("injected history failure");
    expect((await client.scanOperation.findUniqueOrThrow({ where: { id: lease.id } })).status).toBe("RESERVED");
    expect(await client.scanHistory.count({ where: { userId } })).toBe(0);
    await Promise.all([failScan(lease, "failure", client), failScan(lease, "retry", client)]);
    expect((await client.scanUsage.findFirstOrThrow({ where: { userId } })).scanCount).toBe(0);
  });
  test("process termination is recovered; stale workers cannot complete a newer lease", async () => {
    const old = await reserve();
    await client.scanOperation.update({ where: { id: old.id }, data: { leaseUntil: new Date(0) } });
    await recoverAbandonedScans(client);
    await recoverAbandonedScans(client);
    expect((await client.scanUsage.findFirstOrThrow({ where: { userId } })).scanCount).toBe(0);
    const renewed = await reserve();
    expect(renewed.token).not.toBe(old.token);
    await expect(completeScan(old, payload(), metadata, client)).rejects.toThrow(ScanConflict);
    await completeScan(renewed, payload(), metadata, client);
    expect((await client.scanUsage.findFirstOrThrow({ where: { userId } })).scanCount).toBe(1);
  });
  test("refund uses the reserved month across a month boundary", async () => {
    const lease = await reserve();
    await client.scanUsage.updateMany({ where: { userId }, data: { monthKey: "2000-01" } });
    await client.scanOperation.update({ where: { id: lease.id }, data: { monthKey: "2000-01", leaseUntil: new Date(0) } });
    await recoverAbandonedScans(client);
    expect((await client.scanUsage.findFirstOrThrow({ where: { userId } })).scanCount).toBe(0);
  });
});
