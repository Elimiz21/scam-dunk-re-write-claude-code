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
  result.setUTCMonth(result.getUTCMonth() + months);
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
  if (
    !requestedStatus ||
    requestedStatus === currentStatus ||
    MONITOR_STATUS_TRANSITIONS[currentStatus].includes(
      requestedStatus as never,
    )
  ) {
    return;
  }

  throw new MonitorStatusTransitionError();
}

export function createMonitoringRepository(
  client: MonitoringPrismaClient = prisma as unknown as MonitoringPrismaClient,
) {
  async function listWatchlist(userId: string): Promise<WatchlistEntryRecord[]> {
    return client.watchlistEntry.findMany({
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

    return client.$transaction((transaction) =>
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

    return client.$transaction(async (transaction) => {
      const result = await transaction.watchlistEntry.deleteMany({
        where: { userId, ticker: normalizedTicker },
      });
      return { removed: result.count > 0 };
    });
  }

  async function listMonitors(userId: string): Promise<ActiveMonitorRecord[]> {
    return client.activeMonitor.findMany({
      where: { watchlistEntry: { userId } },
      orderBy: [{ status: "asc" }, { nextEvaluationAt: "asc" }],
    });
  }

  async function createMonitor(
    input: CreateMonitorInput,
  ): Promise<ActiveMonitorRecord> {
    assertMonitorExpiry(input.startsAt, input.expiresAt);

    try {
      return await client.$transaction(async (transaction) => {
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
    monitorId: string,
    input: UpdateMonitorInput,
  ): Promise<ActiveMonitorRecord> {
    return client.$transaction(async (transaction) => {
      const current = await transaction.activeMonitor.findUnique({
        where: { id: monitorId },
      });

      if (!current) {
        throw new Error("Monitor not found.");
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

  async function deleteMonitor(monitorId: string): Promise<ActiveMonitorRecord> {
    return client.$transaction((transaction) =>
      transaction.activeMonitor.delete({ where: { id: monitorId } }),
    );
  }

  async function recordExecutionOnce(
    input: RecordExecutionOnceInput,
  ): Promise<MonitorExecutionRecord> {
    return client.$transaction((transaction) =>
      transaction.monitorExecution.upsert({
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
      }),
    );
  }

  async function transitionExecution(
    executionId: string,
    operation: MonitorExecutionOperation,
    isAlreadyApplied: (execution: MonitorExecutionRecord) => boolean,
    canApply: (execution: MonitorExecutionRecord) => boolean,
    where: Record<string, string | boolean>,
    data: Record<string, string | boolean | null>,
  ): Promise<MonitorExecutionRecord> {
    return client.$transaction(async (transaction) => {
      const current = await transaction.monitorExecution.findUnique({
        where: { id: executionId },
      });

      if (!current) {
        throw new MonitorExecutionTransitionError(
          operation,
          "The monitor execution does not exist.",
        );
      }

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

        const latest = await transaction.monitorExecution.findUnique({
          where: { id: executionId },
        });
        if (latest && isAlreadyApplied(latest)) {
          return latest;
        }

        throw new MonitorExecutionTransitionError(
          operation,
          "The monitor execution changed before this transition could be applied.",
        );
      }
    });
  }

  async function reserveExecutionCredit(
    executionId: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
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
    executionId: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
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
    executionId: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      executionId,
      "COMPLETE",
      (execution) => execution.status === "COMPLETED",
      (execution) => execution.status === "PENDING",
      { status: "PENDING" },
      { status: "COMPLETED", skipReason: null, errorReason: null },
    );
  }

  async function skipExecution(
    executionId: string,
    skipReason: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      executionId,
      "SKIP",
      (execution) => execution.status === "SKIPPED",
      (execution) => execution.status === "PENDING",
      { status: "PENDING" },
      { status: "SKIPPED", skipReason, errorReason: null },
    );
  }

  async function failExecution(
    executionId: string,
    errorReason: string,
  ): Promise<MonitorExecutionRecord> {
    return transitionExecution(
      executionId,
      "FAIL",
      (execution) => execution.status === "FAILED",
      (execution) => execution.status === "PENDING",
      { status: "PENDING" },
      { status: "FAILED", errorReason },
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

    return client.$transaction((transaction) =>
      transaction.notificationDelivery.upsert({
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
      }),
    );
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
