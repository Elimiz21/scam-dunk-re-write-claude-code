import { prisma } from "@/lib/db";

import type {
  ActiveMonitorRecord,
  CreateMonitorInput,
  MonitorExecutionRecord,
  MonitoringPrismaClient,
  MonitoringTransactionClient,
  RecordExecutionOnceInput,
  UpdateMonitorInput,
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

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
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
    const normalizedTicker = normalizeTicker(ticker);

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
    const normalizedTicker = normalizeTicker(ticker);

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

    return client.$transaction(async (transaction) => {
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

  return {
    listWatchlist,
    upsertWatchlistTicker,
    removeWatchlistTicker,
    listMonitors,
    createMonitor,
    updateMonitor,
    deleteMonitor,
    recordExecutionOnce,
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

export type { MonitoringTransactionClient } from "./types";
