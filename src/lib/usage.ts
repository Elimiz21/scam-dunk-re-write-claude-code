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
 * Check if user can perform a scan (hasn't exceeded limit)
 */
export async function canUserScan(userId: string): Promise<{
  canScan: boolean;
  usage: UsageInfo;
}> {
  const { plan, scansUsedThisMonth, scansLimitThisMonth } = await getUserUsage(userId);

  const limitReached = scansUsedThisMonth >= scansLimitThisMonth;

  return {
    canScan: !limitReached,
    usage: {
      plan,
      scansUsedThisMonth,
      scansLimitThisMonth,
      limitReached,
    },
  };
}

/**
 * Increment scan count for a user
 * Should be called after a successful scan
 */
export async function incrementScanCount(userId: string): Promise<UsageInfo> {
  const monthKey = getCurrentMonthKey();

  // Get user's plan
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const plan = user.plan as Plan;
  const limit = getScanLimit(plan);

  // Upsert the usage record
  const usage = await prisma.scanUsage.upsert({
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
