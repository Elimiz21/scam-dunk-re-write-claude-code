const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockSendMonitorResultEmail = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    notificationDelivery: {
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
  },
}));

jest.mock("@/lib/email", () => ({
  sendMonitorResultEmail: mockSendMonitorResultEmail,
}));

import { deliverPendingMonitorNotifications } from "@/lib/monitoring/notifications";

describe("monitor notification delivery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("delivers in-app notifications and sends email notifications from the outbox", async () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const execution = {
      status: "COMPLETED",
      skipReason: null,
      publicationKey: "eod:2026-08-25",
      monitor: {
        kind: "FULL",
        watchlistEntry: { ticker: "AAPL" },
      },
    };
    mockFindMany.mockResolvedValue([
      {
        id: "delivery-in-app",
        channel: "IN_APP",
        status: "PENDING",
        userId: "user-1",
        user: { email: "user@example.com" },
        execution,
      },
      {
        id: "delivery-email",
        channel: "EMAIL",
        status: "PENDING",
        userId: "user-1",
        user: { email: "user@example.com" },
        execution,
      },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockSendMonitorResultEmail.mockResolvedValue(true);

    await expect(deliverPendingMonitorNotifications(undefined, now)).resolves.toEqual({
      processed: 2,
      delivered: 2,
      failed: 0,
    });
    expect(mockSendMonitorResultEmail).toHaveBeenCalledWith(
      "user@example.com",
      expect.objectContaining({ ticker: "AAPL", status: "COMPLETED" }),
    );
    expect(mockUpdateMany).toHaveBeenCalled();
    expect(mockUpdateMany.mock.calls.filter(([args]) => args.where.status === "PROCESSING")).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ where: expect.objectContaining({ attemptedAt: now }) })],
      ]),
    );
  });
});
