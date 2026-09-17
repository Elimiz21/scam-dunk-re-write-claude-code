import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getPumpRadar } from "@/lib/pump-radar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Limit must be an integer from 1 through 50.",
        },
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const session = await auth();
    const payload = await getPumpRadar({
      limit: parsed.data.limit,
      viewer: session?.user?.id ? "AUTHENTICATED" : "PUBLIC",
    });
    return NextResponse.json(payload, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Pump Radar API error:", error);
    return NextResponse.json(
      {
        status: "UNAVAILABLE",
        asOf: null,
        publishedAt: null,
        freshness: null,
        coverage: null,
        rows: [],
        notice: "Published end-of-day findings are temporarily unavailable.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
