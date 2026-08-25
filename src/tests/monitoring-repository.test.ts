import {
  MonitorExpiryError,
  MonitorSlotConflictError,
  createMonitoringRepository,
} from "@/lib/monitoring/repository";
import type { MonitoringPrismaClient } from "@/lib/monitoring/types";

const STARTS_AT = new Date("2026-08-25T00:00:00.000Z");

function createPrismaMock() {
  const watchlistEntry = {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  };
  const activeMonitor = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const monitorExecution = {
    upsert: jest.fn(),
  };

  const transaction = jest.fn(
    async (callback: (transactionClient: unknown) => unknown) =>
      callback({
        watchlistEntry,
        activeMonitor,
        monitorExecution,
      }),
  );

  return {
    prisma: {
      watchlistEntry,
      activeMonitor,
      monitorExecution,
      $transaction: transaction,
    } as unknown as MonitoringPrismaClient,
    watchlistEntry,
    activeMonitor,
    monitorExecution,
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
    mock.activeMonitor.findUnique.mockResolvedValue({
      id: "monitor-1",
      status: "ACTIVE",
    });
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.createMonitor({
        watchlistEntryId: "watchlist-1",
        kind: "FULL",
        frequency: "DAILY",
        startsAt: STARTS_AT,
        expiresAt: new Date("2026-09-25T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(MonitorSlotConflictError);
    expect(mock.activeMonitor.create).not.toHaveBeenCalled();
  });

  test("a monitor cannot expire later than 24 calendar months after it starts", async () => {
    const mock = createPrismaMock();
    const repository = createMonitoringRepository(mock.prisma);

    await expect(
      repository.createMonitor({
        watchlistEntryId: "watchlist-1",
        kind: "PRICE",
        frequency: "WEEKLY",
        startsAt: STARTS_AT,
        expiresAt: new Date("2028-08-26T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(MonitorExpiryError);
    expect(mock.activeMonitor.findUnique).not.toHaveBeenCalled();
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
    mock.monitorExecution.upsert.mockResolvedValue(execution);
    const repository = createMonitoringRepository(mock.prisma);

    const first = await repository.recordExecutionOnce({
      monitorId: "monitor-1",
      publicationKey: "eod:2026-08-25",
      notificationIdempotencyKey: "notify:execution-1",
    });
    const retry = await repository.recordExecutionOnce({
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
});
