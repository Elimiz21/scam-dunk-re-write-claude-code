import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getMonitorCreditEstimate,
  getMonitorSlotKey,
  getPlanEntitlements,
} from "@/lib/entitlements";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  watchlistEntryId: z.string().trim().min(1).max(128),
  kind: z.enum(["FULL", "PRICE"]),
  frequency: z.enum(["DAILY", "WEEKLY"]),
  durationMonths: z.number().int().min(1).max(24),
});

const updateSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    frequency: z.enum(["DAILY", "WEEKLY"]).optional(),
    durationMonths: z.number().int().min(1).max(24).optional(),
    status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  })
  .refine(
    (value) =>
      value.frequency !== undefined ||
      value.durationMonths !== undefined ||
      value.status !== undefined,
    { message: "At least one monitor change is required." },
  );

const deleteSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

class MonitorApiError extends Error {
  constructor(
    readonly code: "PLAN_LIMIT" | "NOT_FOUND" | "MONITOR_EXISTS",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MonitorApiError";
  }
}

function unauthorized() {
  return NextResponse.json(
    {
      error: { code: "UNAUTHORIZED", message: "Authentication required." },
    },
    { status: 401 },
  );
}

function invalidRequest(message = "Monitor settings are invalid.") {
  return NextResponse.json(
    { error: { code: "INVALID_REQUEST", message } },
    { status: 400 },
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

function planLimitMessage(
  displayName: string,
  limit: number,
  kind: "FULL" | "PRICE",
) {
  const label = kind === "FULL" ? "full" : "price";
  const noun = limit === 1 ? "monitor" : "monitors";
  return `Your ${displayName} plan includes ${limit} active ${label} ${noun}.`;
}

async function parseBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function handleError(error: unknown) {
  if (error instanceof MonitorApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (isUniqueConstraint(error)) {
    return NextResponse.json(
      {
        error: {
          code: "MONITOR_EXISTS",
          message: "This ticker already has a monitor of that type.",
        },
      },
      { status: 409 },
    );
  }
  console.error("Monitor API error:", error);
  return NextResponse.json(
    {
      error: {
        code: "MONITORS_UNAVAILABLE",
        message: "Monitoring is temporarily unavailable.",
      },
    },
    { status: 503 },
  );
}

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  try {
    const [user, monitors] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { plan: true },
      }),
      prisma.activeMonitor.findMany({
        where: { watchlistEntry: { userId: session.user.id } },
        orderBy: [{ status: "asc" }, { nextEvaluationAt: "asc" }],
        include: {
          watchlistEntry: { select: { ticker: true } },
        },
      }),
    ]);
    if (!user) return unauthorized();
    const entitlements = getPlanEntitlements(user.plan);
    const activeFull = monitors.filter(
      (monitor) => monitor.status === "ACTIVE" && monitor.kind === "FULL",
    ).length;
    const activePrice = monitors.filter(
      (monitor) => monitor.status === "ACTIVE" && monitor.kind === "PRICE",
    ).length;
    return NextResponse.json(
      {
        monitors,
        slots: {
          full: { used: activeFull, limit: entitlements.fullMonitorSlots },
          price: { used: activePrice, limit: entitlements.priceMonitorSlots },
        },
        creditEstimate: getMonitorCreditEstimate(),
        notice: "Checked after the trading day closes — not live.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const parsed = createSchema.safeParse(await parseBody(request));
  if (!parsed.success) return invalidRequest();

  const now = new Date();
  const expiresAt = addCalendarMonths(now, parsed.data.durationMonths);
  try {
    const monitor = await prisma.$transaction(
      async (transaction) => {
        const [user, watchlistEntry] = await Promise.all([
          transaction.user.findUnique({
            where: { id: session.user.id },
            select: { plan: true },
          }),
          transaction.watchlistEntry.findFirst({
            where: {
              id: parsed.data.watchlistEntryId,
              userId: session.user.id,
            },
            select: { id: true, userId: true, ticker: true },
          }),
        ]);
        if (!user || !watchlistEntry) {
          throw new MonitorApiError(
            "NOT_FOUND",
            "Watchlist ticker was not found.",
            404,
          );
        }

        const entitlements = getPlanEntitlements(user.plan);
        const slotLimit = entitlements[getMonitorSlotKey(parsed.data.kind)];
        const activeCount = await transaction.activeMonitor.count({
          where: {
            kind: parsed.data.kind,
            status: "ACTIVE",
            watchlistEntry: { userId: session.user.id },
          },
        });
        if (activeCount >= slotLimit) {
          throw new MonitorApiError(
            "PLAN_LIMIT",
            planLimitMessage(
              entitlements.displayName,
              slotLimit,
              parsed.data.kind,
            ),
            409,
          );
        }

        const existing = await transaction.activeMonitor.findFirst({
          where: {
            watchlistEntryId: watchlistEntry.id,
            kind: parsed.data.kind,
            status: { in: ["ACTIVE", "PAUSED"] },
          },
          select: { id: true },
        });
        if (existing) {
          throw new MonitorApiError(
            "MONITOR_EXISTS",
            "This ticker already has a monitor of that type.",
            409,
          );
        }

        return transaction.activeMonitor.create({
          data: {
            watchlistEntryId: watchlistEntry.id,
            kind: parsed.data.kind,
            frequency: parsed.data.frequency,
            startsAt: now,
            expiresAt,
            status: "ACTIVE",
            lastEvaluatedAt: null,
            nextEvaluationAt: now,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json(monitor, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const parsed = updateSchema.safeParse(await parseBody(request));
  if (!parsed.success) return invalidRequest(parsed.error.issues[0]?.message);

  try {
    const monitor = await prisma.$transaction(
      async (transaction) => {
        const current = await transaction.activeMonitor.findFirst({
          where: {
            id: parsed.data.id,
            watchlistEntry: { userId: session.user.id },
          },
        });
        if (!current) {
          throw new MonitorApiError(
            "NOT_FOUND",
            "Monitor was not found.",
            404,
          );
        }

        if (parsed.data.status === "ACTIVE" && current.status !== "ACTIVE") {
          const user = await transaction.user.findUnique({
            where: { id: session.user.id },
            select: { plan: true },
          });
          if (!user) throw new MonitorApiError("NOT_FOUND", "User not found.", 404);
          const entitlements = getPlanEntitlements(user.plan);
          const slotLimit = entitlements[getMonitorSlotKey(current.kind as "FULL" | "PRICE")];
          const activeCount = await transaction.activeMonitor.count({
            where: {
              kind: current.kind,
              status: "ACTIVE",
              watchlistEntry: { userId: session.user.id },
            },
          });
          if (activeCount >= slotLimit) {
            throw new MonitorApiError(
              "PLAN_LIMIT",
              planLimitMessage(
                entitlements.displayName,
                slotLimit,
                current.kind as "FULL" | "PRICE",
              ),
              409,
            );
          }
        }

        const data: Record<string, unknown> = {};
        if (parsed.data.frequency) data.frequency = parsed.data.frequency;
        if (parsed.data.status) {
          data.status = parsed.data.status;
          data.nextEvaluationAt =
            parsed.data.status === "ACTIVE" ? new Date() : null;
        }
        if (parsed.data.durationMonths) {
          data.expiresAt = addCalendarMonths(
            new Date(),
            parsed.data.durationMonths,
          );
        }
        return transaction.activeMonitor.update({
          where: { id: current.id },
          data,
        });
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json(monitor);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const parsed = deleteSchema.safeParse(await parseBody(request));
  if (!parsed.success) return invalidRequest();

  try {
    const result = await prisma.activeMonitor.deleteMany({
      where: {
        id: parsed.data.id,
        watchlistEntry: { userId: session.user.id },
      },
    });
    return NextResponse.json({ removed: result.count > 0 });
  } catch (error) {
    return handleError(error);
  }
}
