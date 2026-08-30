import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }

  const notifications = await prisma.notificationDelivery.findMany({
    where: { userId: session.user.id, channel: "IN_APP", status: "DELIVERED" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
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

  return NextResponse.json(
    {
      notifications: notifications.map((notification) => ({
        id: notification.id,
        ticker: notification.execution.monitor.watchlistEntry.ticker,
        kind: notification.execution.monitor.kind,
        status: notification.execution.status,
        skipReason: notification.execution.skipReason,
        publicationKey: notification.execution.publicationKey,
        createdAt: notification.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
