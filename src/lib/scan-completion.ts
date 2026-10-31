import { createHash, randomUUID } from "crypto";
import { prisma } from "./db";
import { getCurrentMonthKey, getScanLimit } from "./config";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Plan, RiskResponse, UsageInfo } from "./types";

type Client = PrismaClient;
type Tx = Prisma.TransactionClient;
export interface ScanLease { id: string; token: string; userId: string }
export class ScanConflict extends Error {}

async function refund(tx: Tx, operation: { userId: string; monthKey: string }) {
  await tx.scanUsage.updateMany({
    where: { userId: operation.userId, monthKey: operation.monthKey, scanCount: { gt: 0 } },
    data: { scanCount: { decrement: 1 } },
  });
}

/** No raw pitch or identity is retained in the reservation ledger. */
export async function beginScan(userId: string, requestKey: string, input: unknown, client: Client = prisma): Promise<
  | { state: "RESERVED"; lease: ScanLease; usage: UsageInfo }
  | { state: "COMPLETED"; result: RiskResponse }
  | { state: "PENDING" }
  | { state: "LIMIT_REACHED"; usage: UsageInfo }
> {
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return client.$transaction(async (tx) => {
    const now = new Date();
    // An actual UPDATE locks this key, serializing duplicates with completion.
    const operation = await tx.scanOperation.upsert({
      where: { userId_requestKey: { userId, requestKey } },
      create: { userId, requestKey, inputHash, monthKey: getCurrentMonthKey() },
      update: { updatedAt: now },
    });
    if (operation.inputHash !== inputHash) throw new ScanConflict("Idempotency key was used for a different scan.");
    if (operation.status === "COMPLETED") {
      const saved = await tx.scanHistory.findFirst({ where: { id: operation.resultId!, userId }, select: { resultPayload: true } });
      if (!saved?.resultPayload) throw new Error("Completed scan payload is missing");
      return { state: "COMPLETED", result: JSON.parse(saved.resultPayload) as RiskResponse };
    }
    if (operation.status === "RESERVED") {
      if (operation.leaseUntil && operation.leaseUntil > now) return { state: "PENDING" };
      await refund(tx, operation);
    }
    const user = await tx.user.findUnique({ where: { id: userId }, select: { plan: true, freeMonthlyScanCredits: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new Error("User unavailable");
    const monthKey = getCurrentMonthKey();
    const limit = getScanLimit(user.plan as Plan, user.freeMonthlyScanCredits);
    await tx.scanUsage.upsert({ where: { userId_monthKey: { userId, monthKey } }, create: { userId, monthKey, scanCount: 0 }, update: {} });
    const updated = await tx.scanUsage.updateMany({ where: { userId, monthKey, scanCount: { lt: limit } }, data: { scanCount: { increment: 1 } } });
    const count = (await tx.scanUsage.findUniqueOrThrow({ where: { userId_monthKey: { userId, monthKey } } })).scanCount;
    const usage: UsageInfo = { plan: user.plan as Plan, scansUsedThisMonth: count, scansLimitThisMonth: limit, limitReached: count >= limit };
    if (!updated.count) {
      await tx.scanOperation.update({ where: { id: operation.id }, data: { status: "FAILED", leaseToken: null, leaseUntil: null, lastError: "LIMIT_REACHED" } });
      return { state: "LIMIT_REACHED", usage };
    }
    const token = randomUUID();
    await tx.scanOperation.update({ where: { id: operation.id }, data: { status: "RESERVED", monthKey, leaseToken: token, leaseUntil: new Date(now.getTime() + 120_000), lastError: null } });
    return { state: "RESERVED", lease: { id: operation.id, token, userId }, usage };
  });
}

/** Acknowledgement is allowed only after the exact payload and completion commit. */
export async function completeScan(lease: ScanLease, result: RiskResponse, metadata: { ticker: string; assetType: string; processingTime: number; pitchProvided: boolean; contextProvided: boolean; isOtc: boolean; isMicroCap: boolean; isHighVolume: boolean; usedAiBackend: boolean }, client: Client = prisma) {
  return client.$transaction(async (tx) => {
    const updated = await tx.scanOperation.updateMany({ where: { id: lease.id, userId: lease.userId, status: "RESERVED", leaseToken: lease.token }, data: { status: "COMPLETED", resultId: result.resultId, leaseToken: null, leaseUntil: null } });
    if (updated.count !== 1) throw new ScanConflict("Scan reservation expired or was completed.");
    await tx.scanHistory.create({ data: {
      id: result.resultId, userId: lease.userId, ...metadata,
      riskLevel: result.riskLevel, totalScore: result.totalScore, signalsCount: result.signals.length,
      isLegitimate: result.isLegitimate, scoringVersion: result.scoringVersion,
      resultPayload: JSON.stringify(result),
    } });
  });
}

/** Retryable, exactly-once refund; a completed result is never refunded. */
export async function failScan(lease: ScanLease, reason: string, client: Client = prisma) {
  return client.$transaction(async (tx) => {
    const operation = await tx.scanOperation.findUnique({ where: { id: lease.id } });
    if (!operation) return;
    const updated = await tx.scanOperation.updateMany({ where: { id: lease.id, userId: lease.userId, status: "RESERVED", leaseToken: lease.token }, data: { status: "FAILED", leaseToken: null, leaseUntil: null, lastError: reason.slice(0,100) } });
    if (updated.count === 1) await refund(tx, operation);
  });
}

/** Recover reservations abandoned by terminated processes, without guessing the month. */
export async function recoverAbandonedScans(client: Client = prisma) {
  const expired = await client.scanOperation.findMany({ where: { status: "RESERVED", leaseUntil: { lt: new Date() } }, select: { id: true, userId: true, leaseToken: true }, take: 100 });
  for (const operation of expired) if (operation.leaseToken) await failScan({ id: operation.id, userId: operation.userId, token: operation.leaseToken }, "LEASE_EXPIRED", client);
  return expired.length;
}
