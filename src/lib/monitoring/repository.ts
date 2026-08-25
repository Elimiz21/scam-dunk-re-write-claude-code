import { prisma } from "@/lib/db";
import { normalizeSupportedTicker } from "@/lib/stock-universe";

import type {
  ActiveMonitorRecord,
  CreateMonitorInput,
  MonitorExecutionRecord,
  MonitoringPrismaClient,
  MonitoringTransactionClient,
  NotificationDeliveryRecord,
  RecordExecutionOnceInput,
  UpdateMonitorInput,
  UpsertNotificationDeliveryInput,
  WatchlistEntryRecord,
} from "./types";

const MAX_MONITOR_MONTHS = 24;

const MONITOR_STATUS_TRANSITIONS = {
  ACTIVE: ["PAUSED", "EXPIRED", "CANCELLED"],
  PAUSED: ["ACTIVE", "EXPIRED", "CANCELLED"],
  EXPIRED: [],
  CANCELLED: [],
} as const;

export class MonitorSlotConflictError extends Error {
  constructor() {
    super("A monitor of this kind is already active for this watchlist entry.");
    this.name = "MonitorSlotConflictError";
  }
}

export class MonitorExpiryError extends Error {
  constructor() {
    super("A monitor must expire after it starts and within 24 calendar months.");
    this.name = "MonitorExpiryError";
  }
}

export class MonitorStatusTransitionError extends Error {
  constructor() {
    super("The requested monitor status transition is not allowed.");
    this.name = "MonitorStatusTransitionError";
  }
}

export type MonitoringResource = "WATCHLIST_ENTRY" | "MONITOR" | "MONITOR_EXECUTION";

export class MonitoringNotFoundError extends Error {
  constructor(readonly resource: MonitoringResource) {
    super(`The requested ${resource.toLowerCase().replace("_", " ")} was not found.`);
    this.name = "MonitoringNotFoundError";
  }
}

export class NotificationDeliveryTransitionError extends Error {
  constructor() {
    super("A delivered notification cannot move back to a non-terminal state.");
    this.name = "NotificationDeliveryTransitionError";
  }
}

export type MonitorExecutionOperation =
  | "RESERVE_CREDIT"
  | "CHARGE_CREDIT"
  | "COMPLETE"
  | "SKIP"
  | "FAIL";

export class MonitorExecutionTransitionError extends Error {
  readonly operation: MonitorExecutionOperation;

  constructor(operation: MonitorExecutionOperation, message: string) {
    super(message);
    this.name = "MonitorExecutionTransitionError";
    this.operation = operation;
  }
}

export class UnsupportedWatchlistTickerError extends Error {
  readonly reason: "UNSUPPORTED_ASSET" | "INVALID_TICKER";

  constructor(reason: "UNSUPPORTED_ASSET" | "INVALID_TICKER") {
    super("Only supported US-stock ticker formats can be added to a watchlist.");
    this.name = "UnsupportedWatchlistTickerError";
    this.reason = reason;
  }
}

function normalizeWatchlistTicker(ticker: string): string {
  const normalized = normalizeSupportedTicker(ticker);
  if (normalized.ok === false) {
    throw new UnsupportedWatchlistTickerError(normalized.reason);
  }

  return normalized.ticker;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function assertMonitorExpiry(startsAt: Date, expiresAt: Date): void {
  if (
    expiresAt <= startsAt ||
    expiresAt > addCalendarMonths(startsAt, MAX_MONITOR_MONTHS)
  ) {
    throw new MonitorExpiryError();
  }
}

function assertStatusTransition(
  currentStatus: ActiveMonitorRecord["status"],
  requestedStatus: UpdateMonitorInput["status"],
): void {
  const allowedTransitions = MONITOR_STATUS_TRANSITIONS[currentStatus];
  if (!allowedTransitions) {
    throw new MonitorStatusTransitionError();
  }
  if (
    !requestedStatus ||
    requestedStatus === currentStatus ||
    allowedTransitions.includes(requestedStatus as never)
  ) {
    return;
  }

  throw new MonitorStatusTransitionError();
}

type MonitoringRepositoryOptions = {
  transactionClient?: MonitoringTransactionClient;
};

export function createMonitoringRepository(
  client: MonitoringPrismaClient = prisma as unknown as MonitoringPrismaClient,
  options: MonitoringRepositoryOptions = {},
) {
  const readClient = options.transactionClient ?? client;

  function runTransaction<T>(
    callback: (transaction: MonitoringTransactionClient) => Promise<T>,
  ): Promise<T> {
    if (options.transactionClient) return callback(options.transactionClient);
    return client.$transaction(callback);
  }

  async function findOwnedMonitor(
    transaction: MonitoringTransactionClient,
    userId: string,
    monitorId: string,
  ): Promise<ActiveMonitorRecord> {
    const monitor = await transaction.activeMonitor.findFirst({
      where: { id: monitorId, watchlistEntry: { userId } },
    });
    if (!monitor) throw new MonitoringNotFoundError("MONITOR");
    return monitor;
  }

  async function findOwnedExecution(
    transaction: MonitoringTransactionClient,
    userId: string,
    executionId: string,
  ): Promise<MonitorExecutionRecord> {
    const execution = await transaction.monitorExecution.findFirst({
      where: {
        id: executionId,
        monitor: { watchlistEntry: { userId } },
      },
    });
    if (!execution) throw new MonitoringNotFoundError("MONITOR_EXECUTION");
    return execution;
  }
  async function listWatchlist(userId: string): Promise<WatchlistEntryRecord[]> {
    return readClient.watchlistEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        monitors: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  async function upsertWatchlistTicker(
    userId: string,
    ticker: string,
  ): Promise<WatchlistEntryRecord> {
    const normalizedTicker = normalizeWatchlistTicker(ticker);

    return runTransaction((transaction) =>
      transaction.watchlistEntry.upsert({
        where: { userId_ticker: { userId, ticker: normalizedTicker } },
        create: { userId, ticker: normalizedTicker },
        update: {},
      }),
    );
  }

  async function removeWatchlistTicker(
    userId: string,
    ticker: string,
  ): Promise<{ removed: boolean }> {
    const normalizedTicker = normalizeWatchlistTicker(ticker);

    return runTransaction(async (transaction) => {
      const result = await transaction.watchlistEntry.deleteMany({
        where: { userId, ticker: normalizedTicker },
      });
      return { removed: result.count > 0 };
    });
  }

  async function listMonitors(userId: string): Promise<ActiveMonitorRecord[]> {
    return readClient.activeMonitor.findMany({
      where: { watchlistEntry: { userId } },
      orderBy: [{ status: "asc" }, { nextEvaluationAt: "asc" }],
    });
  }

  async function createMonitor(
    input: CreateMonitorInput,
  ): Promise<ActiveMonitorRecord> {
    assertMonitorExpiry(input.startsAt, input.expiresAt);

    try {
      return await runTransaction(async (transaction) => {
        const watchlistEntry = await transaction.watchlistEntry.findFirst({
          where: { id: input.watchlistEntryId, userId: input.userId },
        });
        if (!watchlistEntry) {
          throw new MonitoringNotFoundError("WATCHLIST_ENTRY");
        }
        const existing = await transaction.activeMonitor.findUnique({
          where: {
            watchlistEntryId_kind: {
              watchlistEntryId: input.watchlistEntryId,
              kind: input.kind,
            },
          },
        });

        if (existing?.status === "ACTIVE") {
          throw new MonitorSlotConflictError();
        }

        const data = {
          frequency: input.frequency,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          status: "ACTIVE" as const,
          lastEvaluatedAt: null,
          nextEvaluationAt: input.startsAt,
        };

        if (existing) {
          return transaction.activeMonitor.update({
            where: { id: existing.id },
            data,
          });
        }

        return transaction.activeMonitor.create({
          data: { watchlistEntryId: input.watchlistEntryId, kind: input.kind, ...data },
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new MonitorSlotConflictError();
      }
      throw error;
    }
  }

  async function updateMonitor(
    userId: string,
    monitorId: string,
    input: UpdateMonitorInput,
  ): Promise<ActiveMonitorRecord> {
    return runTransaction(async (transaction) => {
      const current = await findOwnedMonitor(transaction, userId, monitorId);
      if (current.status === "CANCELLED" || current.status === "EXPIRED") {
        if (Object.keys(input).some((key) => key !== "status")) {
          throw new MonitorStatusTransitionError();
        }
        return current;
      }
      assertStatusTransition(current.status, input.status);
      assertMonitorExpiry(
        input.startsAt ?? current.startsAt,
        input.expiresAt ?? current.expiresAt,
      );
      return transaction.activeMonitor.update({
        where: { id: monitorId },
        data: input,
      });
    });
  }

  async function deleteMonitor(
    userId: string,
    monitorId: string,
  ): Promise<ActiveMonitorRecord> {
    return runTransaction(async (transaction) => {
      const current = await findOwnedMonitor(transaction, userId, monitorId);
      if (current.status === "CANCELLED" || current.status === "EXPIRED") {
        return current;
      }
      return transaction.activeMonitor.update({
        where: { id: monitorId, status: current.status },
        data: { status: "CANCELLED", nextEvaluationAt: null },
      });
    });
  }

  async function recordExecutionOnce(
    input: RecordExecutionOnceInput,
  ): Promise<MonitorExecutionRecord> {
    return runTransaction(async (transaction) => {
      const monitor = await transaction.activeMonitor.findFirst({
        where: { id: input.monitorId, watchlistEntry: { userId: input.userId } },
      });
      if (!monitor) throw new MonitoringNotFoundError("MONITOR");
      return transaction.monitorExecution.upsert({
        where: {
          monitorId_publicationKey: {
            monitorId: input.monitorId,
            publicationKey: input.publicationKey,
          },
        },
        create: {
          monitorId: input.monitorId,
          publicationKey: input.publicationKey,
          status: "PENDING",
          creditReserved: false,
          creditCharged: false,
          notificationIdempotencyKey: input.notificationIdempotencyKey,
        },
        update: {},
      });
    });
  }

  async function transitionExecution(
    userId: string,
    executionId: string,
    operation: MonitorExecutionOperation,
    isAlreadyApplied: (execution: MonitorExecutionRecord) => boolean,
    canApply: (execution: MonitorExecutionRecord) => boolean,
    where: Record<string, string | boolean>,
    data: Record<string, string | boolean | null>,
  ): Promise<MonitorExecutionRecord> {
    return runTransaction(async (transaction) => {
      const current = await findOwnedExecution(transaction, userId, executionId);

      if (isAlreadyApplied(current)) {
        return current;
      }

      if (!canApply(current)) {
        throw new MonitorExecutionTransitionError(
          operation,
          "The monitor execution is not eligible for this transition.",
        );
      }

      try {
        return await transaction.monitorExecution.update({
          where: { id: executionId, ...where },
          data,
        });
      } catch (error) {
        if (!isRecordNotFoundError(error)) {
          throw error;
        }

        const latest = await findOwnedExecution(transaction, userId, executionId);
        if (isAlreadyApplied(latest)) return latest;

        throw new MonitorExecutionTransitionError(
          operation,
          "The monitor execution changed before this transition could be applied.",
        );
      }
    });
  }

  async function reserveExecutionCredit(
    userId: string,
    executionId: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      userId,
      executionId,
      "RESERVE_CREDIT",
      (execution) => execution.creditReserved,
      (execution) =>
        execution.status === "PENDING" &&
        !execution.creditReserved &&
        !execution.creditCharged,
      { status: "PENDING", creditReserved: false, creditCharged: false },
      { creditReserved: true },
    );
  }

  async function chargeExecutionCredit(
    userId: string,
    executionId: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      userId,
      executionId,
      "CHARGE_CREDIT",
      (execution) => execution.creditCharged,
      (execution) =>
        execution.status === "PENDING" &&
        execution.creditReserved &&
        !execution.creditCharged,
      { status: "PENDING", creditReserved: true, creditCharged: false },
      { creditCharged: true },
    );
  }

  async function completeExecution(
    userId: string,
    executionId: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      userId,
      executionId,
      "COMPLETE",
      (execution) => execution.status === "COMPLETED",
      (execution) => execution.status === "PENDING" && execution.creditCharged,
      { status: "PENDING", creditCharged: true },
      { status: "COMPLETED", skipReason: null, errorReason: null },
    );
  }

  async function skipExecution(
    userId: string,
    executionId: string,
    skipReason: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      userId,
      executionId,
      "SKIP",
      (execution) => execution.status === "SKIPPED",
      (execution) => execution.status === "PENDING",
      { status: "PENDING" },
      {
        status: "SKIPPED",
        creditReserved: false,
        creditCharged: false,
        skipReason,
        errorReason: null,
      },
    );
  }

  async function failExecution(
    userId: string,
    executionId: string,
    errorReason: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      userId,
      executionId,
      "FAIL",
      (execution) => execution.status === "FAILED",
      (execution) => execution.status === "PENDING",
      { status: "PENDING" },
      {
        status: "FAILED",
        creditReserved: false,
        creditCharged: false,
        skipReason: null,
        errorReason,
      },
    );
  }

  async function upsertNotificationDelivery(
    input: UpsertNotificationDeliveryInput,
  ): Promise<NotificationDeliveryRecord> {
    const deliveryData = {
      status: input.status,
      attemptedAt: input.attemptedAt,
      deliveredAt: input.deliveredAt ?? null,
      providerMessageId: input.providerMessageId ?? null,
      errorReason: input.errorReason ?? null,
    };

    return runTransaction(async (transaction) => {
      await findOwnedExecution(transaction, input.userId, input.executionId);
      const existing = await transaction.notificationDelivery.findUnique({
        where: {
          userId_executionId_channel: {
            userId: input.userId,
            executionId: input.executionId,
            channel: input.channel,
          },
        },
      });
      if (existing?.status === "DELIVERED") {
        if (input.status !== "DELIVERED") {
          throw new NotificationDeliveryTransitionError();
        }
        return existing;
      }
      return transaction.notificationDelivery.upsert({
        where: {
          userId_executionId_channel: {
            userId: input.userId,
            executionId: input.executionId,
            channel: input.channel,
          },
        },
        create: {
          userId: input.userId,
          executionId: input.executionId,
          channel: input.channel,
          ...deliveryData,
        },
        update: deliveryData,
      });
    });
  }

  return {
    listWatchlist,
    upsertWatchlistTicker,
    removeWatchlistTicker,
    listMonitors,
    createMonitor,
    updateMonitor,
    deleteMonitor,
    recordExecutionOnce,
    reserveExecutionCredit,
    chargeExecutionCredit,
    completeExecution,
    skipExecution,
    failExecution,
    upsertNotificationDelivery,
  };
}

const defaultRepository = createMonitoringRepository();

export const listWatchlist = defaultRepository.listWatchlist;
export const upsertWatchlistTicker = defaultRepository.upsertWatchlistTicker;
export const removeWatchlistTicker = defaultRepository.removeWatchlistTicker;
export const listMonitors = defaultRepository.listMonitors;
export const createMonitor = defaultRepository.createMonitor;
export const updateMonitor = defaultRepository.updateMonitor;
export const deleteMonitor = defaultRepository.deleteMonitor;
export const recordExecutionOnce = defaultRepository.recordExecutionOnce;
export const reserveExecutionCredit = defaultRepository.reserveExecutionCredit;
export const chargeExecutionCredit = defaultRepository.chargeExecutionCredit;
export const completeExecution = defaultRepository.completeExecution;
export const skipExecution = defaultRepository.skipExecution;
export const failExecution = defaultRepository.failExecution;
export const upsertNotificationDelivery =
  defaultRepository.upsertNotificationDelivery;

export type { MonitoringTransactionClient } from "./types";
