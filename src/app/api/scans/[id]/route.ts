import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getScanDetail } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const idSchema = z.string().trim().min(1).max(128);

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const parsedId = idSchema.safeParse(params.id);
  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: { code: "INVALID_REQUEST", message: "Scan id is invalid." },
      },
      { status: 400 },
    );
  }

  try {
    const detail = await getScanDetail(session.user.id, parsedId.data);
    if (!detail) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Scan was not found." } },
        { status: 404 },
      );
    }
    return NextResponse.json(detail, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Scan detail API error:", error);
    return NextResponse.json(
      {
        error: {
          code: "SCAN_UNAVAILABLE",
          message: "Scan details are temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
