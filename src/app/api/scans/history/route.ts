import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getScanHistory, HISTORY_ORDERS } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  order: z.enum(HISTORY_ORDERS).default("MOST_RECENT"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      },
      { status: 401 },
    );
  }

  const parsed = querySchema.safeParse({
    order: request.nextUrl.searchParams.get("order") ?? undefined,
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    const invalidOrder = parsed.error.issues.some(
      (issue) => issue.path[0] === "order",
    );
    return NextResponse.json(
      {
        error: {
          code: invalidOrder ? "INVALID_ORDER" : "INVALID_REQUEST",
          message: invalidOrder
            ? "Order must be MOST_RECENT, HIGHEST_RISK, or DATE_ADDED."
            : "Pagination values are invalid.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const payload = await getScanHistory(session.user.id, {
      order: parsed.data.order ?? "MOST_RECENT",
      page: parsed.data.page ?? 1,
      limit: parsed.data.limit ?? 20,
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Scan history API error:", error);
    return NextResponse.json(
      {
        error: {
          code: "HISTORY_UNAVAILABLE",
          message: "Scan history is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
