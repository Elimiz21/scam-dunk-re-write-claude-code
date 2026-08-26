import {
  calculateNextEvaluationAt,
  createMonitoringRunner,
} from "@/lib/monitoring/runner";

const NOW = new Date("2026-08-26T01:00:00.000Z");
const SCAN_DATE = new Date("2026-08-25T00:00:00.000Z");

function createRunnerClient() {
  const client = {
    dailyScanSummary: { findUnique: jest.fn(), findFirst: jest.fn() },
    activeMonitor: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    stockDailySnapshot: { findFirst: jest.fn() },
    monitorExecution: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    scanUsage: { findUnique: jest.fn(), upsert: jest.fn() },
    scanHistory: { create: jest.fn() },
    watchlistEntry: { update: jest.fn() },
    notificationDelivery: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation(
    async (callback: (transaction: typeof client) => unknown) => callback(client),
  );
  client.activeMonitor.findFirst.mockResolvedValue({
    id: "monitor-1",
    watchlistEntryId: "watch-1",
  });
  client.monitorExecution.findFirst.mockResolvedValue({
    id: "execution-1",
    monitorId: "monitor-1",
    status: "PENDING",
    creditReserved: false,
    creditCharged: false,
  });
  client.notificationDelivery.findUnique.mockResolvedValue(null);
  return client;
}

function dueMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: "monitor-1",
    watchlistEntryId: "watch-1",
    kind: "FULL",
    frequency: "DAILY",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: new Date("2027-08-01T00:00:00.000Z"),
    status: "ACTIVE",
    lastEvaluatedAt: null,
    nextEvaluationAt: new Date("2026-08-01T00:00:00.000Z"),
    watchlistEntry: {
      ticker: "AAPL",
      userId: "user-1",
    },
    ...overrides,
  };
}

function freshPublication() {
  return {
    scanDate: SCAN_DATE,
    createdAt: new Date("2026-08-25T22:15:00.000Z"),
    totalStocks: 5000,
    evaluated: 4920,
    skippedNoData: 80,
  };
}

function monitorEligibleForRunnerQuery(monitor: ReturnType<typeof dueMonitor>, where: any) {
  const startsAtUpperBound = where.startsAt?.lte;
  const nextEvaluationUpperBound = where.OR?.find(
    (condition: any) => condition.nextEvaluationAt?.lte,
  )?.nextEvaluationAt?.lte;

  return (
    startsAtUpperBound instanceof Date &&
    new Date(monitor.startsAt).getTime() <= startsAtUpperBound.getTime() &&
    (monitor.nextEvaluationAt === null ||
      (nextEvaluationUpperBound instanceof Date &&
        new Date(monitor.nextEvaluationAt).getTime() <=
          nextEvaluationUpperBound.getTime()))
  );
}

describe("monitoring publication runner", () => {
  test("skips a stale publication, persists both notification hooks, and charges no credit", async () => {
    const client = createRunnerClient();
    client.dailyScanSummary.findUnique.mockResolvedValue({
      ...freshPublication(),
      scanDate: new Date("2026-08-10T00:00:00.000Z"),
    });
    client.activeMonitor.findMany.mockResolvedValue([dueMonitor()]);
    client.monitorExecution.upsert.mockResolvedValue({
      id: "execution-stale",
      status: "PENDING",
      creditReserved: false,
      creditCharged: false,
    });
    client.monitorExecution.update.mockResolvedValue({});
    client.notificationDelivery.upsert.mockResolvedValue({});
    client.activeMonitor.update.mockResolvedValue({});
    const runner = createMonitoringRunner(client as never, { now: () => NOW });

    const result = await runner.runEligibleMonitorPublication("eod:2026-08-10");

    expect(result).toMatchObject({
      publicationKey: "eod:2026-08-10",
      status: "STALE_DATA",
      charged: 0,
      skipped: 1,
    });
    expect(client.scanUsage.upsert).not.toHaveBeenCalled();
    expect(client.scanHistory.create).not.toHaveBeenCalled();
    expect(client.monitorExecution.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "execution-stale" }),
      data: expect.objectContaining({
        status: "SKIPPED",
        creditReserved: false,
        creditCharged: false,
        skipReason: "STALE_DATA",
      }),
    });
    expect(client.notificationDelivery.upsert).toHaveBeenCalledTimes(2);
  });

  test("charges and writes automatic history exactly once when the same publication is retried", async () => {
    const client = createRunnerClient();
    client.dailyScanSummary.findUnique.mockResolvedValue(freshPublication());
    client.activeMonitor.findMany.mockResolvedValue([dueMonitor()]);
    client.stockDailySnapshot.findFirst.mockResolvedValue({
      riskLevel: "HIGH",
      totalScore: 92,
      signalCount: 4,
      evaluatedAt: new Date("2026-08-25T22:00:00.000Z"),
    });
    client.monitorExecution.upsert
      .mockResolvedValueOnce({
        id: "execution-1",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
      })
      .mockResolvedValueOnce({
        id: "execution-1",
        status: "COMPLETED",
        creditReserved: true,
        creditCharged: true,
      });
    client.monitorExecution.findFirst
      .mockResolvedValueOnce({
        id: "execution-1",
        monitorId: "monitor-1",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
      })
      .mockResolvedValueOnce({
        id: "execution-1",
        monitorId: "monitor-1",
        status: "PENDING",
        creditReserved: true,
        creditCharged: false,
      })
      .mockResolvedValueOnce({
        id: "execution-1",
        monitorId: "monitor-1",
        status: "PENDING",
        creditReserved: true,
        creditCharged: true,
      });
    client.monitorExecution.updateMany.mockResolvedValue({ count: 1 });
    client.user.findUnique.mockResolvedValue({ plan: "PAID" });
    client.scanUsage.findUnique.mockResolvedValue({ scanCount: 7 });
    client.scanUsage.upsert.mockResolvedValue({ scanCount: 8 });
    client.scanHistory.create.mockResolvedValue({ id: "scan-auto-1" });
    client.watchlistEntry.update.mockResolvedValue({});
    client.monitorExecution.update.mockResolvedValue({});
    client.notificationDelivery.upsert.mockResolvedValue({});
    client.activeMonitor.update.mockResolvedValue({});
    const runner = createMonitoringRunner(client as never, { now: () => NOW });

    const first = await runner.runEligibleMonitorPublication("eod:2026-08-25");
    const retry = await runner.runEligibleMonitorPublication("eod:2026-08-25");

    expect(first).toMatchObject({ charged: 1, completed: 1 });
    expect(retry).toMatchObject({ charged: 0, duplicates: 1 });
    expect(client.scanUsage.upsert).toHaveBeenCalledTimes(1);
    expect(client.scanHistory.create).toHaveBeenCalledTimes(1);
    expect(client.scanHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetType: "monitor-full",
        createdAt: new Date("2026-08-25T00:00:00.000Z"),
      }),
    });
    expect(client.watchlistEntry.update).toHaveBeenCalledTimes(1);
    expect(client.watchlistEntry.update).toHaveBeenCalledWith({
      where: { id: "watch-1" },
      data: { lastDataAt: new Date("2026-08-25T00:00:00.000Z") },
    });
    expect(client.notificationDelivery.upsert).toHaveBeenCalledTimes(2);
    expect(client.monitorExecution.updateMany).not.toHaveBeenCalled();
    expect(client.monitorExecution.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: "execution-1",
        status: "PENDING",
        creditReserved: false,
        creditCharged: false,
      },
      data: { creditReserved: true },
    });
    expect(client.monitorExecution.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: "execution-1",
        status: "PENDING",
        creditReserved: true,
        creditCharged: false,
      },
      data: { creditCharged: true },
    });
    expect(client.monitorExecution.update).toHaveBeenNthCalledWith(3, {
      where: { id: "execution-1", status: "PENDING", creditCharged: true },
      data: { status: "COMPLETED", skipReason: null, errorReason: null },
    });
  });

  test("skips a ticker absent from the published dataset without charging", async () => {
    const client = createRunnerClient();
    client.dailyScanSummary.findUnique.mockResolvedValue(freshPublication());
    client.activeMonitor.findMany.mockResolvedValue([dueMonitor()]);
    client.stockDailySnapshot.findFirst.mockResolvedValue(null);
    client.monitorExecution.upsert.mockResolvedValue({
      id: "execution-missing",
      status: "PENDING",
      creditReserved: false,
      creditCharged: false,
    });
    client.monitorExecution.update.mockResolvedValue({});
    client.notificationDelivery.upsert.mockResolvedValue({});
    client.activeMonitor.update.mockResolvedValue({});
    const runner = createMonitoringRunner(client as never, { now: () => NOW });

    const result = await runner.runEligibleMonitorPublication("eod:2026-08-25");

    expect(result).toMatchObject({ charged: 0, skipped: 1 });
    expect(client.scanUsage.upsert).not.toHaveBeenCalled();
    expect(client.monitorExecution.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "execution-missing" }),
      data: expect.objectContaining({ skipReason: "UNSUPPORTED_TICKER" }),
    });
  });

  test("marks expired schedules before evaluation and does not create an execution", async () => {
    const client = createRunnerClient();
    client.dailyScanSummary.findUnique.mockResolvedValue(freshPublication());
    client.activeMonitor.findMany.mockResolvedValue([
      dueMonitor({ expiresAt: new Date("2026-08-25T23:59:59.000Z") }),
    ]);
    client.activeMonitor.update.mockResolvedValue({});
    const runner = createMonitoringRunner(client as never, { now: () => NOW });

    const result = await runner.runEligibleMonitorPublication("eod:2026-08-25");

    expect(result).toMatchObject({ expired: 1, charged: 0 });
    expect(client.activeMonitor.update).toHaveBeenCalledWith({
      where: { id: "monitor-1" },
      data: { status: "EXPIRED", nextEvaluationAt: null },
    });
    expect(client.monitorExecution.upsert).not.toHaveBeenCalled();
  });

  test("does not charge a later-created monitor for an earlier publication", async () => {
    const client = createRunnerClient();
    const monitor = dueMonitor({
      startsAt: new Date("2026-08-25T12:00:00.000Z"),
      nextEvaluationAt: new Date("2026-08-25T12:00:00.000Z"),
    });
    client.dailyScanSummary.findUnique.mockResolvedValue(freshPublication());
    client.activeMonitor.findMany.mockImplementation(async ({ where }) =>
      monitorEligibleForRunnerQuery(monitor, where) ? [monitor] : [],
    );
    const runner = createMonitoringRunner(client as never, { now: () => NOW });

    const result = await runner.runEligibleMonitorPublication("eod:2026-08-25");

    expect(result).toMatchObject({ eligible: 0, charged: 0, completed: 0 });
    expect(client.scanUsage.upsert).not.toHaveBeenCalled();
    expect(client.scanHistory.create).not.toHaveBeenCalled();
  });

  test("does not charge a monitor before its next scheduled publication", async () => {
    const client = createRunnerClient();
    const monitor = dueMonitor({
      startsAt: new Date("2026-08-20T00:00:00.000Z"),
      nextEvaluationAt: new Date("2026-08-25T12:00:00.000Z"),
    });
    client.dailyScanSummary.findUnique.mockResolvedValue(freshPublication());
    client.activeMonitor.findMany.mockImplementation(async ({ where }) =>
      monitorEligibleForRunnerQuery(monitor, where) ? [monitor] : [],
    );
    const runner = createMonitoringRunner(client as never, { now: () => NOW });

    const result = await runner.runEligibleMonitorPublication("eod:2026-08-25");

    expect(result).toMatchObject({ eligible: 0, charged: 0, completed: 0 });
    expect(client.scanUsage.upsert).not.toHaveBeenCalled();
    expect(client.scanHistory.create).not.toHaveBeenCalled();
  });

  test("advances daily and weekly schedules from the publication date", () => {
    expect(calculateNextEvaluationAt(SCAN_DATE, "DAILY").toISOString()).toBe(
      "2026-08-26T00:00:00.000Z",
    );
    expect(calculateNextEvaluationAt(SCAN_DATE, "WEEKLY").toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });
});
