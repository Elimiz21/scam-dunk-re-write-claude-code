import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getDashboardPayload } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    const payload = await getDashboardPayload(session.user.id);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      {
        error: {
          code: "DASHBOARD_UNAVAILABLE",
          message: "Dashboard data is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
