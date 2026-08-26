import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isTrackedUsCommonStock } from "@/lib/dashboard-data";
import { prisma } from "@/lib/db";
import { normalizeSupportedTicker } from "@/lib/stock-universe";

export const dynamic = "force-dynamic";

const tickerSchema = z.object({
  ticker: z.string().trim().min(1).max(16),
});

function unauthorized() {
  return NextResponse.json(
    {
      error: { code: "UNAUTHORIZED", message: "Authentication required." },
    },
    { status: 401 },
  );
}

function unsupportedTicker() {
  return NextResponse.json(
    {
      error: {
        code: "UNSUPPORTED_TICKER",
        message: "Only supported US-listed common stocks can be saved.",
      },
    },
    { status: 400 },
  );
}

async function readBody(request: NextRequest) {
  try {
    return tickerSchema.safeParse(await request.json());
  } catch {
    return tickerSchema.safeParse(null);
  }
}

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  try {
    const entries = await prisma.watchlistEntry.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        monitors: { orderBy: { createdAt: "desc" } },
      },
    });
    return NextResponse.json(
      {
        entries: entries.map((entry) => ({
          id: entry.id,
          ticker: entry.ticker,
          addedAt: entry.createdAt.toISOString(),
          lastDataAt: entry.lastDataAt?.toISOString() ?? null,
          monitors: entry.monitors.map((monitor) => ({
            id: monitor.id,
            kind: monitor.kind,
            frequency: monitor.frequency,
            status: monitor.status,
            startsAt: monitor.startsAt.toISOString(),
            expiresAt: monitor.expiresAt.toISOString(),
            lastEvaluatedAt: monitor.lastEvaluatedAt?.toISOString() ?? null,
            nextEvaluationAt: monitor.nextEvaluationAt?.toISOString() ?? null,
          })),
        })),
        savedWatchlistLimit: null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Watchlist list error:", error);
    return NextResponse.json(
      {
        error: {
          code: "WATCHLIST_UNAVAILABLE",
          message: "Your watchlist is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const body = await readBody(request);
  if (!body.success) return unsupportedTicker();
  const normalized = normalizeSupportedTicker(body.data.ticker);
  if (!normalized.ok) return unsupportedTicker();

  try {
    const stock = await prisma.trackedStock.findUnique({
      where: { symbol: normalized.ticker },
      select: { symbol: true, name: true, exchange: true, isOTC: true },
    });
    if (!isTrackedUsCommonStock(stock)) return unsupportedTicker();

    const entry = await prisma.$transaction((transaction) =>
      transaction.watchlistEntry.upsert({
        where: {
          userId_ticker: {
            userId: session.user.id,
            ticker: normalized.ticker,
          },
        },
        create: { userId: session.user.id, ticker: normalized.ticker },
        update: {},
      }),
    );
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Watchlist add error:", error);
    return NextResponse.json(
      {
        error: {
          code: "WATCHLIST_UNAVAILABLE",
          message: "The ticker could not be saved.",
        },
      },
      { status: 503 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const body = await readBody(request);
  if (!body.success) return unsupportedTicker();
  const normalized = normalizeSupportedTicker(body.data.ticker);
  if (!normalized.ok) return unsupportedTicker();

  try {
    const result = await prisma.$transaction((transaction) =>
      transaction.watchlistEntry.deleteMany({
        where: { userId: session.user.id, ticker: normalized.ticker },
      }),
    );
    return NextResponse.json({ removed: result.count > 0 });
  } catch (error) {
    console.error("Watchlist remove error:", error);
    return NextResponse.json(
      {
        error: {
          code: "WATCHLIST_UNAVAILABLE",
          message: "The ticker could not be removed.",
        },
      },
      { status: 503 },
    );
  }
}
