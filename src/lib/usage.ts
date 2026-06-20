/**
 * Usage Tracking Module
 *
 * Handles per-user monthly scan limits and usage tracking.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getCurrentMonthKey, getScanLimit } from "./config";
import { UsageInfo, Plan } from "./types";

/**
 * Get current usage for a user
 */
export async function getUserUsage(userId: string): Promise<{
  plan: Plan;
  scansUsedThisMonth: number;
  scansLimitThisMonth: number;
}> {
  const monthKey = getCurrentMonthKey();

  // Get user with their plan
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const plan = user.plan as Plan;
  const limit = getScanLimit(plan);

  // Get or create usage record for this month
  const usage = await prisma.scanUsage.findUnique({
    where: {
      userId_monthKey: {
        userId,
        monthKey,
      },
    },
  });

  return {
    plan,
    scansUsedThisMonth: usage?.scanCount ?? 0,
    scansLimitThisMonth: limit,
  };
}

/**
 * Check if user can perform a scan (hasn't exceeded limit).
 * Uses a transaction to ensure consistent reads of user plan and usage count.
 * Note: There is still a TOCTOU window between this check and the separate
 * incrementScanCount() call — callers should be aware that concurrent requests
 * may both pass this check before either increments.
 */
export async function canUserScan(userId: string): Promise<{
  canScan: boolean;
  usage: UsageInfo;
}> {
  const monthKey = getCurrentMonthKey();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const plan = user.plan as Plan;
    const limit = getScanLimit(plan);

    const usage = await tx.scanUsage.findUnique({
      where: {
        userId_monthKey: {
          userId,
          monthKey,
        },
      },
    });

    const currentCount = usage?.scanCount ?? 0;
    const limitReached = currentCount >= limit;

    return {
      canScan: !limitReached,
      usage: {
        plan,
        scansUsedThisMonth: currentCount,
        scansLimitThisMonth: limit,
        limitReached,
      } as UsageInfo,
    };
  });

  return result;
}

/**
 * Atomically increment scan count for a user within a transaction.
 * Should be called after a successful scan.
 */
export async function incrementScanCount(userId: string): Promise<UsageInfo> {
  const monthKey = getCurrentMonthKey();

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const plan = user.plan as Plan;
    const limit = getScanLimit(plan);

    const usage = await tx.scanUsage.upsert({
      where: {
        userId_monthKey: {
          userId,
          monthKey,
        },
      },
      update: {
        scanCount: {
          increment: 1,
        },
      },
      create: {
        userId,
        monthKey,
        scanCount: 1,
      },
    });

    return {
      plan,
      scansUsedThisMonth: usage.scanCount,
      scansLimitThisMonth: limit,
      limitReached: usage.scanCount >= limit,
    };
  });
}

/**
 * Atomically check the scan limit and reserve (increment) a slot.
 *
 * Concurrency-safe: the increment is performed as a single conditional UPDATE
 * (`scanCount = scanCount + 1 WHERE scanCount < limit`), so the database — not
 * the application — enforces the ceiling. N concurrent requests at limit-1 can
 * no longer all pass: at most one wins the row, the rest match zero rows and
 * are rejected. This replaces the previous findUnique→compare→upsert sequence,
 * which raced under READ COMMITTED with no row lock (audit ARCH-C4).
 *
 * The first scan of the month has no row yet; a create-on-miss handles that,
 * and a unique-violation retry covers two concurrent first-scans.
 *
 * Returns { reserved: false } if the limit is already reached.
 */
export async function reserveScanSlot(userId: string): Promise<{
  reserved: boolean;
  usage: UsageInfo;
}> {
  const monthKey = getCurrentMonthKey();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const plan = user.plan as Plan;
  const limit = getScanLimit(plan);

  // Conditional atomic increment: only succeeds while still under the limit.
  // Returns the number of rows affected (1 = reserved, 0 = at limit or no row).
  const incremented = await prisma.$executeRaw`
    UPDATE "ScanUsage"
    SET "scanCount" = "scanCount" + 1, "updatedAt" = NOW()
    WHERE "userId" = ${userId}
      AND "monthKey" = ${monthKey}
      AND "scanCount" < ${limit}
  `;

  if (incremented === 1) {
    const updated = await prisma.scanUsage.findUnique({
      where: { userId_monthKey: { userId, monthKey } },
      select: { scanCount: true },
    });
    const scanCount = updated?.scanCount ?? 1;
    return {
      reserved: true,
      usage: {
        plan,
        scansUsedThisMonth: scanCount,
        scansLimitThisMonth: limit,
        limitReached: scanCount >= limit,
      },
    };
  }

  // No row was updated. Either (a) the limit is reached, or (b) this is the
  // first scan of the month and no row exists yet. Distinguish by reading.
  const existing = await prisma.scanUsage.findUnique({
    where: { userId_monthKey: { userId, monthKey } },
    select: { scanCount: true },
  });

  if (existing) {
    // Row exists but the conditional update matched nothing → at the limit.
    return {
      reserved: false,
      usage: {
        plan,
        scansUsedThisMonth: existing.scanCount,
        scansLimitThisMonth: limit,
        limitReached: true,
      },
    };
  }

  // First scan of the month: create the row with count 1. If a concurrent
  // request created it first, the unique constraint trips — fall back to the
  // conditional increment path so the race is still serialized correctly.
  try {
    const created = await prisma.scanUsage.create({
      data: { userId, monthKey, scanCount: 1 },
      select: { scanCount: true },
    });
    return {
      reserved: true,
      usage: {
        plan,
        scansUsedThisMonth: created.scanCount,
        scansLimitThisMonth: limit,
        limitReached: created.scanCount >= limit,
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Lost the create race; retry the atomic conditional increment.
      const retry = await prisma.$executeRaw`
        UPDATE "ScanUsage"
        SET "scanCount" = "scanCount" + 1, "updatedAt" = NOW()
        WHERE "userId" = ${userId}
          AND "monthKey" = ${monthKey}
          AND "scanCount" < ${limit}
      `;
      const after = await prisma.scanUsage.findUnique({
        where: { userId_monthKey: { userId, monthKey } },
        select: { scanCount: true },
      });
      const scanCount = after?.scanCount ?? limit;
      const reserved = retry === 1;
      return {
        reserved,
        usage: {
          plan,
          scansUsedThisMonth: scanCount,
          scansLimitThisMonth: limit,
          limitReached: !reserved || scanCount >= limit,
        },
      };
    }
    throw error;
  }
}

/**
 * Refund a previously reserved scan slot for the current month, flooring at 0.
 *
 * Used when a scan reserves a slot but then fails before producing a result
 * (5xx/internal error), so users aren't charged for failed scans (audit
 * ARCH-C4). The decrement is a single conditional UPDATE guarded by
 * `scanCount > 0` so it can never drive the counter negative, and it is a
 * no-op when no row exists. Safe to call fire-and-forget.
 */
export async function refundScanSlot(userId: string): Promise<void> {
  const monthKey = getCurrentMonthKey();

  await prisma.$executeRaw`
    UPDATE "ScanUsage"
    SET "scanCount" = "scanCount" - 1, "updatedAt" = NOW()
    WHERE "userId" = ${userId}
      AND "monthKey" = ${monthKey}
      AND "scanCount" > 0
  `;
}

/**
 * Get usage info object for API response
 */
export async function getUsageInfo(userId: string): Promise<UsageInfo> {
  const { plan, scansUsedThisMonth, scansLimitThisMonth } =
    await getUserUsage(userId);

  return {
    plan,
    scansUsedThisMonth,
    scansLimitThisMonth,
    limitReached: scansUsedThisMonth >= scansLimitThisMonth,
  };
}
