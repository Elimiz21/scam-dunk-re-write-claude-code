import { prisma } from "@/lib/db";
import { sendMonitorResultEmail } from "@/lib/email";

const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;

type NotificationClient = typeof prisma;

export async function deliverPendingMonitorNotifications(
  client: NotificationClient = prisma,
  now = new Date(),
) {
  const retryBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  const pending = await client.notificationDelivery.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "PROCESSING", attemptedAt: { lt: retryBefore } },
        { status: "FAILED", attemptCount: { lt: MAX_DELIVERY_ATTEMPTS } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      channel: true,
      status: true,
      attemptCount: true,
      attemptedAt: true,
      user: { select: { email: true } },
      execution: {
        select: {
          status: true,
          skipReason: true,
          publicationKey: true,
          monitor: {
            select: {
              kind: true,
              watchlistEntry: { select: { ticker: true } },
            },
          },
        },
      },
    },
  });

  let processed = 0;
  let delivered = 0;
  let failed = 0;
  for (const notification of pending) {
    const claim = await client.notificationDelivery.updateMany({
      where: {
        id: notification.id,
        status: notification.status,
        ...(notification.status === "PROCESSING"
          ? { attemptedAt: notification.attemptedAt }
          : { attemptCount: { lt: MAX_DELIVERY_ATTEMPTS } }),
      },
      data: {
        status: "PROCESSING",
        attemptedAt: now,
        attemptCount: { increment: 1 },
      },
    });
    if (claim.count !== 1) continue;
    processed += 1;

    try {
      const payload = {
        ticker: notification.execution.monitor.watchlistEntry.ticker,
        kind: notification.execution.monitor.kind,
        status: notification.execution.status,
        skipReason: notification.execution.skipReason,
        publicationKey: notification.execution.publicationKey,
      };
      const wasDelivered =
        notification.channel === "IN_APP"
          ? true
          : Boolean(
              notification.user.email &&
                (await sendMonitorResultEmail(notification.user.email, payload)),
            );
      const finalized = await client.notificationDelivery.updateMany({
        where: {
          id: notification.id,
          status: "PROCESSING",
          attemptedAt: now,
        },
        data: wasDelivered
          ? { status: "DELIVERED", deliveredAt: now }
          : { status: "FAILED", errorReason: "Email delivery is not configured." },
      });
      if (finalized.count !== 1) continue;
      if (wasDelivered) delivered += 1;
      else failed += 1;
    } catch (error) {
      const finalized = await client.notificationDelivery.updateMany({
        where: {
          id: notification.id,
          status: "PROCESSING",
          attemptedAt: now,
        },
        data: {
          status: "FAILED",
          errorReason: error instanceof Error ? error.message.slice(0, 1000) : "UNKNOWN",
        },
      });
      if (finalized.count === 1) failed += 1;
    }
  }

  return { processed, delivered, failed };
}
