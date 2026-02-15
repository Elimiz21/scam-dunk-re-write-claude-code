/**
 * Usage Tracking Module
 *
 * Handles per-user monthly scan limits and usage tracking.
 */

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
 * Get usage info object for API response
 */
export async function getUsageInfo(userId: string): Promise<UsageInfo> {
  const { plan, scansUsedThisMonth, scansLimitThisMonth } = await getUserUsage(userId);

  return {
    plan,
    scansUsedThisMonth,
    scansLimitThisMonth,
    limitReached: scansUsedThisMonth >= scansLimitThisMonth,
  };
}
