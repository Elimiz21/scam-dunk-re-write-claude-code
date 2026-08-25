import { prisma } from "@/lib/db";
import { getPlanEntitlements } from "@/lib/entitlements";
import { isFreshMarketPublication } from "@/lib/pump-radar";
import { normalizeSupportedTicker } from "@/lib/stock-universe";

type RunnerClient = {
  dailyScanSummary: {
    findUnique: (args: unknown) => Promise<any>;
    findFirst: (args: unknown) => Promise<any>;
  };
  activeMonitor: {
    findMany: (args: unknown) => Promise<any[]>;
    update: (args: unknown) => Promise<any>;
  };
  stockDailySnapshot: { findFirst: (args: unknown) => Promise<any> };
  monitorExecution: {
    upsert: (args: unknown) => Promise<any>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    update: (args: unknown) => Promise<any>;
  };
  user: { findUnique: (args: unknown) => Promise<any> };
  scanUsage: {
    findUnique: (args: unknown) => Promise<any>;
    upsert: (args: unknown) => Promise<any>;
  };
  scanHistory: { create: (args: unknown) => Promise<any> };
  watchlistEntry: { update: (args: unknown) => Promise<any> };
  notificationDelivery: { upsert: (args: unknown) => Promise<any> };
  $transaction: <T>(
    callback: (transaction: RunnerClient) => Promise<T>,
    options?: unknown,
  ) => Promise<T>;
};

type MonitorFrequency = "DAILY" | "WEEKLY";

type RunnerResult = {
  publicationKey: string;
  status: "PUBLISHED" | "STALE_DATA" | "UNPUBLISHED";
  eligible: number;
  completed: number;
  charged: number;
  skipped: number;
  duplicates: number;
  expired: number;
  failed: number;
};

const TERMINAL_EXECUTION_STATUSES = new Set([
  "COMPLETED",
  "SKIPPED",
  "FAILED",
]);

function parsePublicationKey(publicationKey: string): Date {
  const match = /^eod:(\d{4}-\d{2}-\d{2})$/.exec(publicationKey);
  if (!match) throw new Error("INVALID_PUBLICATION_KEY");
  const scanDate = new Date(`${match[1]}T00:00:00.000Z`);
  if (
    Number.isNaN(scanDate.getTime()) ||
    scanDate.toISOString().slice(0, 10) !== match[1]
  ) {
    throw new Error("INVALID_PUBLICATION_KEY");
  }
  return scanDate;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calculateNextEvaluationAt(
  publicationDate: Date,
  frequency: MonitorFrequency,
): Date {
  const next = new Date(publicationDate);
  next.setUTCDate(next.getUTCDate() + (frequency === "WEEKLY" ? 7 : 1));
  return next;
}

function notificationIdempotencyKey(
  monitorId: string,
  publicationKey: string,
): string {
  return `monitor:${monitorId}:${publicationKey}`;
}

async function queueNotifications(
  transaction: RunnerClient,
  userId: string,
  executionId: string,
) {
  await Promise.all(
    (["IN_APP", "EMAIL"] as const).map((channel) =>
      transaction.notificationDelivery.upsert({
        where: {
          userId_executionId_channel: { userId, executionId, channel },
        },
        create: {
          userId,
          executionId,
          channel,
          status: "PENDING",
          attemptedAt: null,
          deliveredAt: null,
          providerMessageId: null,
          errorReason: null,
        },
        update: {},
      }),
    ),
  );
}

function executionIsTerminal(execution: any): boolean {
  return (
    execution.creditCharged === true ||
    TERMINAL_EXECUTION_STATUSES.has(String(execution.status))
  );
}

export function createMonitoringRunner(
  client: RunnerClient = prisma as unknown as RunnerClient,
  options: { now?: () => Date } = {},
) {
  const currentTime = options.now ?? (() => new Date());

  async function getLatestPublishedPublicationKey(): Promise<string | null> {
    const summary = await client.dailyScanSummary.findFirst({
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: { scanDate: true },
    });
    return summary
      ? `eod:${summary.scanDate.toISOString().slice(0, 10)}`
      : null;
  }

  async function persistSkippedExecution({
    monitor,
    publicationKey,
    publicationDate,
    reason,
    now,
  }: {
    monitor: any;
    publicationKey: string;
    publicationDate: Date;
    reason: "STALE_DATA" | "UNSUPPORTED_TICKER" | "NO_CREDITS";
    now: Date;
  }): Promise<"SKIPPED" | "DUPLICATE"> {
    return client.$transaction(async (transaction) => {
      const execution = await transaction.monitorExecution.upsert({
        where: {
          monitorId_publicationKey: {
            monitorId: monitor.id,
            publicationKey,
          },
        },
        create: {
          monitorId: monitor.id,
          publicationKey,
          status: "PENDING",
          creditReserved: false,
          creditCharged: false,
          notificationIdempotencyKey: notificationIdempotencyKey(
            monitor.id,
            publicationKey,
          ),
        },
        update: {},
      });
      if (executionIsTerminal(execution)) return "DUPLICATE";

      await transaction.monitorExecution.update({
        where: { id: execution.id },
        data: {
          status: "SKIPPED",
          creditReserved: false,
          creditCharged: false,
          skipReason: reason,
          errorReason: null,
        },
      });
      await queueNotifications(
        transaction,
        monitor.watchlistEntry.userId,
        execution.id,
      );
      await transaction.activeMonitor.update({
        where: { id: monitor.id },
        data: {
          lastEvaluatedAt: now,
          nextEvaluationAt: calculateNextEvaluationAt(
            publicationDate,
            monitor.frequency,
          ),
        },
      });
      return "SKIPPED";
    });
  }

  async function processCoveredMonitor({
    monitor,
    snapshot,
    publicationKey,
    publicationDate,
    now,
  }: {
    monitor: any;
    snapshot: any;
    publicationKey: string;
    publicationDate: Date;
    now: Date;
  }): Promise<"COMPLETED" | "SKIPPED" | "DUPLICATE"> {
    return client.$transaction(
      async (transaction) => {
        const execution = await transaction.monitorExecution.upsert({
          where: {
            monitorId_publicationKey: {
              monitorId: monitor.id,
              publicationKey,
            },
          },
          create: {
            monitorId: monitor.id,
            publicationKey,
            status: "PENDING",
            creditReserved: false,
            creditCharged: false,
            notificationIdempotencyKey: notificationIdempotencyKey(
              monitor.id,
              publicationKey,
            ),
          },
          update: {},
        });
        if (executionIsTerminal(execution)) return "DUPLICATE";

        // This conditional update is the atomic ownership fence. On concurrent
        // retries, only one transaction can reserve this execution for charge.
        const claim = await transaction.monitorExecution.updateMany({
          where: {
            id: execution.id,
            status: "PENDING",
            creditReserved: false,
            creditCharged: false,
          },
          data: { creditReserved: true },
        });
        if (claim.count !== 1) return "DUPLICATE";

        const user = await transaction.user.findUnique({
          where: { id: monitor.watchlistEntry.userId },
          select: { plan: true },
        });
        if (!user) throw new Error("MONITOR_USER_NOT_FOUND");

        const entitlements = getPlanEntitlements(user.plan);
        const usageKey = monthKey(now);
        const usage = await transaction.scanUsage.findUnique({
          where: {
            userId_monthKey: {
              userId: monitor.watchlistEntry.userId,
              monthKey: usageKey,
            },
          },
          select: { scanCount: true },
        });
        if ((usage?.scanCount ?? 0) >= entitlements.manualScanCredits) {
          await transaction.monitorExecution.update({
            where: { id: execution.id },
            data: {
              status: "SKIPPED",
              creditReserved: false,
              creditCharged: false,
              skipReason: "NO_CREDITS",
              errorReason: null,
            },
          });
          await queueNotifications(
            transaction,
            monitor.watchlistEntry.userId,
            execution.id,
          );
          await transaction.activeMonitor.update({
            where: { id: monitor.id },
            data: {
              lastEvaluatedAt: now,
              nextEvaluationAt: calculateNextEvaluationAt(
                publicationDate,
                monitor.frequency,
              ),
            },
          });
          return "SKIPPED";
        }

        await transaction.scanUsage.upsert({
          where: {
            userId_monthKey: {
              userId: monitor.watchlistEntry.userId,
              monthKey: usageKey,
            },
          },
          create: {
            userId: monitor.watchlistEntry.userId,
            monthKey: usageKey,
            scanCount: 1,
          },
          update: { scanCount: { increment: 1 } },
        });
        await transaction.scanHistory.create({
          data: {
            userId: monitor.watchlistEntry.userId,
            ticker: monitor.watchlistEntry.ticker,
            assetType:
              monitor.kind === "FULL" ? "monitor-full" : "monitor-price",
            riskLevel: snapshot.riskLevel,
            totalScore: snapshot.totalScore,
            signalsCount: snapshot.signalCount,
            isLegitimate: snapshot.isLegitimate ?? null,
            createdAt: now,
          },
        });
        await transaction.watchlistEntry.update({
          where: { id: monitor.watchlistEntryId },
          data: { lastDataAt: publicationDate },
        });
        await transaction.monitorExecution.update({
          where: { id: execution.id },
          data: {
            status: "COMPLETED",
            creditReserved: true,
            creditCharged: true,
            skipReason: null,
            errorReason: null,
          },
        });
        await queueNotifications(
          transaction,
          monitor.watchlistEntry.userId,
          execution.id,
        );
        await transaction.activeMonitor.update({
          where: { id: monitor.id },
          data: {
            lastEvaluatedAt: now,
            nextEvaluationAt: calculateNextEvaluationAt(
              publicationDate,
              monitor.frequency,
            ),
          },
        });
        return "COMPLETED";
      },
      { isolationLevel: "Serializable" },
    );
  }

  async function recordFailedExecution(
    monitor: any,
    publicationKey: string,
    publicationDate: Date,
    now: Date,
    error: unknown,
  ) {
    try {
      await client.$transaction(async (transaction) => {
        const execution = await transaction.monitorExecution.upsert({
          where: {
            monitorId_publicationKey: {
              monitorId: monitor.id,
              publicationKey,
            },
          },
          create: {
            monitorId: monitor.id,
            publicationKey,
            status: "PENDING",
            creditReserved: false,
            creditCharged: false,
            notificationIdempotencyKey: notificationIdempotencyKey(
              monitor.id,
              publicationKey,
            ),
          },
          update: {},
        });
        if (executionIsTerminal(execution)) return;
        await transaction.monitorExecution.update({
          where: { id: execution.id },
          data: {
            status: "FAILED",
            creditReserved: false,
            creditCharged: false,
            errorReason:
              error instanceof Error ? error.message.slice(0, 1000) : "UNKNOWN",
          },
        });
        await queueNotifications(
          transaction,
          monitor.watchlistEntry.userId,
          execution.id,
        );
        await transaction.activeMonitor.update({
          where: { id: monitor.id },
          data: {
            lastEvaluatedAt: now,
            nextEvaluationAt: calculateNextEvaluationAt(
              publicationDate,
              monitor.frequency,
            ),
          },
        });
      });
    } catch (recordError) {
      console.error("Unable to persist failed monitor execution:", recordError);
    }
  }

  async function runEligibleMonitorPublication(
    publicationKey: string,
  ): Promise<RunnerResult> {
    const publicationDate = parsePublicationKey(publicationKey);
    const now = currentTime();
    const publication = await client.dailyScanSummary.findUnique({
      where: { scanDate: publicationDate },
      select: {
        scanDate: true,
        createdAt: true,
        totalStocks: true,
        evaluated: true,
        skippedNoData: true,
      },
    });
    const stale =
      publication !== null &&
      !isFreshMarketPublication(publication.scanDate, now);
    const result: RunnerResult = {
      publicationKey,
      status: publication ? (stale ? "STALE_DATA" : "PUBLISHED") : "UNPUBLISHED",
      eligible: 0,
      completed: 0,
      charged: 0,
      skipped: 0,
      duplicates: 0,
      expired: 0,
      failed: 0,
    };

    const monitors = await client.activeMonitor.findMany({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ nextEvaluationAt: null }, { nextEvaluationAt: { lte: now } }],
      },
      include: {
        watchlistEntry: { select: { userId: true, ticker: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    result.eligible = monitors.length;

    for (const monitor of monitors) {
      if (new Date(monitor.expiresAt).getTime() <= now.getTime()) {
        await client.activeMonitor.update({
          where: { id: monitor.id },
          data: { status: "EXPIRED", nextEvaluationAt: null },
        });
        result.expired += 1;
        continue;
      }

      try {
        if (!publication || stale) {
          const status = await persistSkippedExecution({
            monitor,
            publicationKey,
            publicationDate,
            reason: "STALE_DATA",
            now,
          });
          result[status === "SKIPPED" ? "skipped" : "duplicates"] += 1;
          continue;
        }

        const normalized = normalizeSupportedTicker(
          monitor.watchlistEntry.ticker,
        );
        if (!normalized.ok) {
          const status = await persistSkippedExecution({
            monitor,
            publicationKey,
            publicationDate,
            reason: "UNSUPPORTED_TICKER",
            now,
          });
          result[status === "SKIPPED" ? "skipped" : "duplicates"] += 1;
          continue;
        }

        const snapshot = await client.stockDailySnapshot.findFirst({
          where: {
            scanDate: publication.scanDate,
            stock: {
              symbol: normalized.ticker,
              exchange: { in: ["NASDAQ", "NYSE", "AMEX"] },
              isOTC: false,
            },
          },
          select: {
            riskLevel: true,
            totalScore: true,
            signalCount: true,
            isLegitimate: true,
            evaluatedAt: true,
          },
        });
        if (!snapshot) {
          const status = await persistSkippedExecution({
            monitor,
            publicationKey,
            publicationDate,
            reason: "UNSUPPORTED_TICKER",
            now,
          });
          result[status === "SKIPPED" ? "skipped" : "duplicates"] += 1;
          continue;
        }

        const status = await processCoveredMonitor({
          monitor,
          snapshot,
          publicationKey,
          publicationDate,
          now,
        });
        if (status === "COMPLETED") {
          result.completed += 1;
          result.charged += 1;
        } else if (status === "SKIPPED") {
          result.skipped += 1;
        } else {
          result.duplicates += 1;
        }
      } catch (error) {
        result.failed += 1;
        await recordFailedExecution(
          monitor,
          publicationKey,
          publicationDate,
          now,
          error,
        );
      }
    }

    return result;
  }

  return { getLatestPublishedPublicationKey, runEligibleMonitorPublication };
}

const defaultRunner = createMonitoringRunner();
export const getLatestPublishedPublicationKey =
  defaultRunner.getLatestPublishedPublicationKey;
export const runEligibleMonitorPublication =
  defaultRunner.runEligibleMonitorPublication;
