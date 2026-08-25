import {
  MonitorExpiryError,
  MonitorExecutionTransitionError,
  MonitoringNotFoundError,
  MonitorStatusTransitionError,
  NotificationDeliveryTransitionError,
  MonitorSlotConflictError,
  UnsupportedWatchlistTickerError,
  createMonitoringRepository,
} from "@/lib/monitoring/repository";
import type { MonitoringPrismaClient } from "@/lib/monitoring/types";

const STARTS_AT = new Date("2026-08-25T00:00:00.000Z");

function createPrismaMock() {
  const watchlistEntry = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  };
  const activeMonitor = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const monitorExecution = {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const notificationDelivery = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  };
  notificationDelivery.findUnique.mockResolvedValue(null);

  const transaction = jest.fn(
    async (callback: (transactionClient: unknown) => unknown) =>
      callback({
        watchlistEntry,
        activeMonitor,
        monitorExecution,
        notificationDelivery,
      }),
  );

  return {
    prisma: {
      watchlistEntry,
      activeMonitor,
      monitorExecution,
      notificationDelivery,
      $transaction: transaction,
    } as unknown as MonitoringPrismaClient,
    watchlistEntry,
    activeMonitor,
    monitorExecution,
    notificationDelivery,
    transaction,
  };
}

describe("monitoring repository contracts", () => {
  test("repeatedly saving the same ticker returns one watchlist entry", async () => {
    const mock = createPrismaMock();
    const savedEntry = {
      id: "watchlist-1",
      userId: "user-1",
      ticker: "AAPL",
    };
    mock.watchlistEntry.upsert.mockResolvedValue(savedEntry);
    const repository = createMonitoringRepository(mock.prisma);

    const first = await repository.upsertWatchlistTicker("user-1", "aapl");
    const second = await repository.upsertWatchlistTicker("user-1", "AAPL");

    expect(first).toEqual(savedEntry);
    expect(second).toEqual(savedEntry);
    expect(mock.watchlistEntry.upsert).toHaveBeenCalledTimes(2);
    expect(mock.watchlistEntry.upsert).toHaveBeenLastCalledWith({
      where: { userId_ticker: { userId: "user-1", ticker: "AAPL" } },
      create: { userId: "user-1", ticker: "AAPL" },
      update: {},
    });
  });

  test("rejects clearly unsupported tickers before a watchlist write", async () => {
    const mock = createPrismaMock();
    const repository = createMonitoringRepository(mock.prisma);

    const saveUnsupportedTicker = repository.upsertWatchlistTicker(
      "user-1",
      "BTC-USD",
    );

    await expect(saveUnsupportedTicker).rejects.toBeInstanceOf(
      UnsupportedWatchlistTickerError,
    );
    await expect(saveUnsupportedTicker).rejects.toEqual(
      expect.objectContaining({
        name: "UnsupportedWatchlistTickerError",
        reason: "UNSUPPORTED_ASSET",
      }),
    );
    expect(mock.watchlistEntry.upsert).not.toHaveBeenCalled();
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  test("removing an absent ticker is idempotent", async () => {
    const mock = createPrismaMock();
    mock.watchlistEntry.deleteMany.mockResolvedValue({ count: 0 });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.removeWatchlistTicker("user-1", "AAPL"),
    ).resolves.toEqual({ removed: false });
    expect(mock.watchlistEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", ticker: "AAPL" },
    });
  });

  test("a second active monitor cannot occupy the same ticker and kind slot", async () => {
    const mock = createPrismaMock();
    mock.watchlistEntry.findFirst.mockResolvedValue({
      id: "watchlist-1",
      userId: "user-1",
    });
    mock.activeMonitor.findUnique.mockResolvedValue({
      id: "monitor-1",
      status: "ACTIVE",
    });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.createMonitor({
        userId: "user-1",
        watchlistEntryId: "watchlist-1",
        kind: "FULL",
        frequency: "DAILY",
        startsAt: STARTS_AT,
        expiresAt: new Date("2026-09-25T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(MonitorSlotConflictError);
    expect(mock.activeMonitor.create).not.toHaveBeenCalled();
  });

  test("a database unique monitor-slot conflict is reported as a typed conflict", async () => {
    const mock = createPrismaMock();
    mock.watchlistEntry.findFirst.mockResolvedValue({
      id: "watchlist-1",
      userId: "user-1",
    });
    mock.activeMonitor.findUnique.mockResolvedValue(null);
    mock.activeMonitor.create.mockRejectedValue({ code: "P2002" });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.createMonitor({
        userId: "user-1",
        watchlistEntryId: "watchlist-1",
        kind: "FULL",
        frequency: "DAILY",
        startsAt: STARTS_AT,
        expiresAt: new Date("2026-09-25T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(MonitorSlotConflictError);
  });

  test("a monitor cannot expire later than 24 calendar months after it starts", async () => {
    const mock = createPrismaMock();
    mock.watchlistEntry.findFirst.mockResolvedValue({
      id: "watchlist-1",
      userId: "user-1",
    });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.createMonitor({
        userId: "user-1",
        watchlistEntryId: "watchlist-1",
        kind: "PRICE",
        frequency: "WEEKLY",
        startsAt: STARTS_AT,
        expiresAt: new Date("2028-08-26T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(MonitorExpiryError);
    expect(mock.activeMonitor.findUnique).not.toHaveBeenCalled();
  });

  test("clamps leap-day expiry to the last day of the target month", async () => {
    const mock = createPrismaMock();
    mock.watchlistEntry.findFirst.mockResolvedValue({
      id: "watchlist-1",
      userId: "user-1",
    });
    mock.activeMonitor.findUnique.mockResolvedValue(null);
    mock.activeMonitor.create.mockResolvedValue({ id: "monitor-1" });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.createMonitor({
        userId: "user-1",
        watchlistEntryId: "watchlist-1",
        kind: "PRICE",
        frequency: "WEEKLY",
        startsAt: new Date("2028-02-29T00:00:00.000Z"),
        expiresAt: new Date("2030-02-28T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ id: "monitor-1" });

    await expect(
      repository.createMonitor({
        userId: "user-1",
        watchlistEntryId: "watchlist-1",
        kind: "PRICE",
        frequency: "WEEKLY",
        startsAt: new Date("2028-02-29T00:00:00.000Z"),
        expiresAt: new Date("2030-03-01T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(MonitorExpiryError);
  });

  test("rejects a monitor mutation when the resource is owned by another user", async () => {
    const mock = createPrismaMock();
    mock.watchlistEntry.findFirst.mockResolvedValue(null);
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.createMonitor({
        userId: "user-2",
        watchlistEntryId: "watchlist-1",
        kind: "FULL",
        frequency: "DAILY",
        startsAt: STARTS_AT,
        expiresAt: new Date("2026-09-25T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      name: "MonitoringNotFoundError",
      resource: "WATCHLIST_ENTRY",
    });
    expect(mock.activeMonitor.findUnique).not.toHaveBeenCalled();
  });

  test("soft-cancels a monitor without deleting its execution history", async () => {
    const mock = createPrismaMock();
    const current = {
      id: "monitor-1",
      watchlistEntryId: "watchlist-1",
      status: "ACTIVE",
      startsAt: STARTS_AT,
      expiresAt: new Date("2026-09-25T00:00:00.000Z"),
    };
    mock.activeMonitor.findFirst.mockResolvedValue(current);
    mock.activeMonitor.update.mockResolvedValue({
      ...current,
      status: "CANCELLED",
      nextEvaluationAt: null,
    });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.deleteMonitor("user-1", "monitor-1"),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    expect(mock.activeMonitor.delete).not.toHaveBeenCalled();
    expect(mock.activeMonitor.update).toHaveBeenCalledWith({
      where: { id: "monitor-1", status: "ACTIVE" },
      data: { status: "CANCELLED", nextEvaluationAt: null },
    });
  });

  test("retries for a publication key return the original execution without a second charge", async () => {
    const mock = createPrismaMock();
    const execution = {
      id: "execution-1",
      monitorId: "monitor-1",
      publicationKey: "eod:2026-08-25",
      status: "PENDING",
      creditReserved: true,
      creditCharged: false,
    };
    mock.activeMonitor.findFirst.mockResolvedValue({
      id: "execution-1",
      monitorId: "monitor-1",
    });
    mock.monitorExecution.upsert.mockResolvedValue(execution);
    const repository = createMonitoringRepository(mock.prisma);

    const first = await repository.recordExecutionOnce({
      userId: "user-1",
      monitorId: "monitor-1",
      publicationKey: "eod:2026-08-25",
      notificationIdempotencyKey: "notify:execution-1",
    });
    const retry = await repository.recordExecutionOnce({
      userId: "user-1",
      monitorId: "monitor-1",
      publicationKey: "eod:2026-08-25",
      notificationIdempotencyKey: "notify:execution-1",
    });

    expect(first).toEqual(execution);
    expect(retry).toEqual(execution);
    expect(mock.monitorExecution.upsert).toHaveBeenCalledTimes(2);
    expect(mock.monitorExecution.upsert).toHaveBeenLastCalledWith({
      where: {
        monitorId_publicationKey: {
          monitorId: "monitor-1",
          publicationKey: "eod:2026-08-25",
        },
      },
      create: {
        monitorId: "monitor-1",
        publicationKey: "eod:2026-08-25",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
        notificationIdempotencyKey: "notify:execution-1",
      },
      update: {},
    });
  });

  test("records a full execution lifecycle without duplicating the execution", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst
      .mockResolvedValueOnce({
        id: "execution-1",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
      })
      .mockResolvedValueOnce({
        id: "execution-1",
        status: "PENDING",
        creditReserved: true,
        creditCharged: false,
      })
      .mockResolvedValueOnce({
        id: "execution-1",
        status: "PENDING",
        creditReserved: true,
        creditCharged: true,
      })
      .mockResolvedValueOnce({
        id: "execution-2",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
      })
      .mockResolvedValueOnce({
        id: "execution-3",
        status: "PENDING",
        creditReserved: true,
        creditCharged: false,
      });
    mock.monitorExecution.update
      .mockResolvedValueOnce({
        id: "execution-1",
        monitorId: "monitor-1",
        publicationKey: "eod:2026-08-25",
        status: "PENDING",
        creditReserved: true,
        creditCharged: false,
        notificationIdempotencyKey: "notify:execution-1",
      })
      .mockResolvedValueOnce({
        id: "execution-1",
        monitorId: "monitor-1",
        publicationKey: "eod:2026-08-25",
        status: "PENDING",
        creditReserved: true,
        creditCharged: true,
        notificationIdempotencyKey: "notify:execution-1",
      })
      .mockResolvedValueOnce({
        id: "execution-1",
        monitorId: "monitor-1",
        publicationKey: "eod:2026-08-25",
        status: "COMPLETED",
        creditReserved: true,
        creditCharged: true,
        notificationIdempotencyKey: "notify:execution-1",
      })
      .mockResolvedValueOnce({
        id: "execution-2",
        monitorId: "monitor-1",
        publicationKey: "eod:2026-08-26",
        status: "SKIPPED",
        creditReserved: false,
        creditCharged: false,
        notificationIdempotencyKey: "notify:execution-2",
      })
      .mockResolvedValueOnce({
        id: "execution-3",
        monitorId: "monitor-1",
        publicationKey: "eod:2026-08-27",
        status: "FAILED",
        creditReserved: true,
        creditCharged: false,
        notificationIdempotencyKey: "notify:execution-3",
      });
    const repository = createMonitoringRepository(mock.prisma);

    await repository.reserveExecutionCredit("user-1", "execution-1");
    await repository.chargeExecutionCredit("user-1", "execution-1");
    await repository.completeExecution("user-1", "execution-1");
    await repository.skipExecution("user-1", "execution-2", "NO_MARKET_DATA");
    await repository.failExecution("user-1", "execution-3", "PROVIDER_TIMEOUT");

    expect(mock.monitorExecution.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: "execution-1",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
      },
      data: { creditReserved: true },
    });
    expect(mock.monitorExecution.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: "execution-1",
        status: "PENDING",
        creditReserved: true,
        creditCharged: false,
      },
      data: { creditCharged: true },
    });
    expect(mock.monitorExecution.update).toHaveBeenNthCalledWith(3, {
      where: { id: "execution-1", status: "PENDING", creditCharged: true },
      data: { status: "COMPLETED", skipReason: null, errorReason: null },
    });
    expect(mock.monitorExecution.update).toHaveBeenNthCalledWith(4, {
      where: { id: "execution-2", status: "PENDING" },
      data: {
        status: "SKIPPED",
        creditReserved: false,
        creditCharged: false,
        skipReason: "NO_MARKET_DATA",
        errorReason: null,
      },
    });
    expect(mock.monitorExecution.update).toHaveBeenNthCalledWith(5, {
      where: { id: "execution-3", status: "PENDING" },
      data: {
        status: "FAILED",
        creditReserved: false,
        creditCharged: false,
        skipReason: null,
        errorReason: "PROVIDER_TIMEOUT",
      },
    });
  });

  test("cannot charge an execution until credit has been reserved", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst.mockResolvedValue({
      id: "execution-1",
      status: "PENDING",
      creditReserved: false,
      creditCharged: false,
    });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.chargeExecutionCredit("user-1", "execution-1"),
    ).rejects.toBeInstanceOf(MonitorExecutionTransitionError);
    expect(mock.monitorExecution.update).not.toHaveBeenCalled();
  });

  test("retries of the same lifecycle operation are safe no-ops while cross-terminal transitions fail", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst.mockResolvedValue({
      id: "execution-1",
      monitorId: "monitor-1",
    });
    const completed = {
      id: "execution-1",
      status: "COMPLETED",
      creditReserved: true,
      creditCharged: true,
    };
    mock.monitorExecution.findFirst
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(completed);
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.chargeExecutionCredit("user-1", "execution-1"),
    ).resolves.toEqual(completed);
    await expect(repository.completeExecution("user-1", "execution-1")).resolves.toEqual(
      completed,
    );
    await expect(
      repository.skipExecution("user-1", "execution-1", "NO_MARKET_DATA"),
    ).rejects.toBeInstanceOf(MonitorExecutionTransitionError);
    await expect(
      repository.failExecution("user-1", "execution-1", "PROVIDER_TIMEOUT"),
    ).rejects.toBeInstanceOf(MonitorExecutionTransitionError);
    expect(mock.monitorExecution.update).not.toHaveBeenCalled();
  });

  test.each([
    ["SKIPPED", "skip", "complete"],
    ["COMPLETED", "complete", "skip"],
    ["FAILED", "fail", "complete"],
  ] as const)(
    "keeps %s executions terminal and idempotent",
    async (status, retryOperation, crossTerminalOperation) => {
      const mock = createPrismaMock();
      const terminal = {
        id: "execution-1",
        status,
        creditReserved: status !== "SKIPPED",
        creditCharged: status === "COMPLETED",
      };
      mock.monitorExecution.findFirst.mockResolvedValue(terminal);
      const repository = createMonitoringRepository(mock.prisma);

      const retry = {
        skip: () => repository.skipExecution("user-1", "execution-1", "NO_MARKET_DATA"),
        complete: () => repository.completeExecution("user-1", "execution-1"),
        fail: () => repository.failExecution("user-1", "execution-1", "PROVIDER_TIMEOUT"),
      }[retryOperation]();
      await expect(retry).resolves.toEqual(terminal);

      const crossTerminal = {
        skip: () => repository.skipExecution("user-1", "execution-1", "NO_MARKET_DATA"),
        complete: () => repository.completeExecution("user-1", "execution-1"),
        fail: () => repository.failExecution("user-1", "execution-1", "PROVIDER_TIMEOUT"),
      }[crossTerminalOperation]();
      await expect(crossTerminal).rejects.toBeInstanceOf(
        MonitorExecutionTransitionError,
      );

      const charge = repository.chargeExecutionCredit("user-1", "execution-1");
      if (status === "COMPLETED") {
        await expect(charge).resolves.toEqual(terminal);
      } else {
        await expect(charge).rejects.toBeInstanceOf(
          MonitorExecutionTransitionError,
        );
      }
      expect(mock.monitorExecution.update).not.toHaveBeenCalled();
    },
  );

  test("uses status and credit predicates so concurrent lifecycle updates cannot overwrite state", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst.mockResolvedValue({
      id: "execution-1",
      status: "PENDING",
      creditReserved: false,
      creditCharged: false,
    });
    mock.monitorExecution.update.mockResolvedValue({
      id: "execution-1",
      status: "PENDING",
      creditReserved: true,
      creditCharged: false,
    });
    const repository = createMonitoringRepository(mock.prisma);

    await repository.reserveExecutionCredit("user-1", "execution-1");

    expect(mock.monitorExecution.update).toHaveBeenCalledWith({
      where: {
        id: "execution-1",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
      },
      data: { creditReserved: true },
    });
  });

  test("upserts each in-app and email delivery with its delivery outcome", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst.mockResolvedValue({
      id: "execution-1",
      monitorId: "monitor-1",
    });
    mock.notificationDelivery.findUnique.mockResolvedValue(null);
    mock.notificationDelivery.upsert
      .mockResolvedValueOnce({
        id: "delivery-1",
        userId: "user-1",
        executionId: "execution-1",
        channel: "IN_APP",
        status: "DELIVERED",
      })
      .mockResolvedValueOnce({
        id: "delivery-2",
        userId: "user-1",
        executionId: "execution-1",
        channel: "EMAIL",
        status: "FAILED",
      });
    const repository = createMonitoringRepository(mock.prisma);
    const attemptedAt = new Date("2026-08-25T17:00:00.000Z");

    await repository.upsertNotificationDelivery({
      userId: "user-1",
      executionId: "execution-1",
      channel: "IN_APP",
      status: "DELIVERED",
      attemptedAt,
      deliveredAt: attemptedAt,
      providerMessageId: "in-app-1",
    });
    await repository.upsertNotificationDelivery({
      userId: "user-1",
      executionId: "execution-1",
      channel: "EMAIL",
      status: "FAILED",
      attemptedAt,
      errorReason: "EMAIL_PROVIDER_TIMEOUT",
    });

    expect(mock.notificationDelivery.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        userId_executionId_channel: {
          userId: "user-1",
          executionId: "execution-1",
          channel: "IN_APP",
        },
      },
      create: {
        userId: "user-1",
        executionId: "execution-1",
        channel: "IN_APP",
        status: "DELIVERED",
        attemptedAt,
        deliveredAt: attemptedAt,
        providerMessageId: "in-app-1",
        errorReason: null,
      },
      update: {
        status: "DELIVERED",
        attemptedAt,
        deliveredAt: attemptedAt,
        providerMessageId: "in-app-1",
        errorReason: null,
      },
    });
    expect(mock.notificationDelivery.upsert).toHaveBeenNthCalledWith(2, {
      where: {
        userId_executionId_channel: {
          userId: "user-1",
          executionId: "execution-1",
          channel: "EMAIL",
        },
      },
      create: {
        userId: "user-1",
        executionId: "execution-1",
        channel: "EMAIL",
        status: "FAILED",
        attemptedAt,
        deliveredAt: null,
        providerMessageId: null,
        errorReason: "EMAIL_PROVIDER_TIMEOUT",
      },
      update: {
        status: "FAILED",
        attemptedAt,
        deliveredAt: null,
        providerMessageId: null,
        errorReason: "EMAIL_PROVIDER_TIMEOUT",
      },
    });
  });

  test("rejects notification writes when the execution belongs to another user", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst.mockResolvedValue(null);
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.upsertNotificationDelivery({
        userId: "user-2",
        executionId: "execution-1",
        channel: "EMAIL",
        status: "PENDING",
        attemptedAt: null,
      }),
    ).rejects.toMatchObject({
      name: "MonitoringNotFoundError",
      resource: "MONITOR_EXECUTION",
    });
    expect(mock.notificationDelivery.upsert).not.toHaveBeenCalled();
  });

  test("does not regress a delivered notification to a non-terminal state", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst.mockResolvedValue({
      id: "execution-1",
      monitorId: "monitor-1",
    });
    mock.notificationDelivery.findUnique.mockResolvedValue({
      id: "delivery-1",
      userId: "user-1",
      executionId: "execution-1",
      channel: "EMAIL",
      status: "DELIVERED",
    });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.upsertNotificationDelivery({
        userId: "user-1",
        executionId: "execution-1",
        channel: "EMAIL",
        status: "PENDING",
        attemptedAt: null,
      }),
    ).rejects.toBeInstanceOf(NotificationDeliveryTransitionError);
    expect(mock.notificationDelivery.upsert).not.toHaveBeenCalled();
  });

  test("returns a typed error for a missing execution lifecycle target", async () => {
    const mock = createPrismaMock();
    mock.monitorExecution.findFirst.mockResolvedValue(null);
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.completeExecution("user-1", "missing-execution"),
    ).rejects.toMatchObject({
      name: "MonitoringNotFoundError",
      resource: "MONITOR_EXECUTION",
    });
  });

  test("rejects updates to terminal monitor state", async () => {
    const mock = createPrismaMock();
    mock.activeMonitor.findFirst.mockResolvedValue({
      id: "monitor-1",
      status: "CANCELLED",
      startsAt: STARTS_AT,
      expiresAt: new Date("2026-09-25T00:00:00.000Z"),
    });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.updateMonitor("user-1", "monitor-1", {
        frequency: "WEEKLY",
      }),
    ).rejects.toBeInstanceOf(MonitorStatusTransitionError);
  });
});
