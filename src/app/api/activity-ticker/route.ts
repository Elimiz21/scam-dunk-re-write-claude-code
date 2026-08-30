import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getActivityTicker } from "@/lib/activity-ticker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    const payload = await getActivityTicker({
      excludeUserId: session?.user?.id,
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Activity ticker API error:", error);
    return NextResponse.json(
      {
        error: {
          code: "ACTIVITY_UNAVAILABLE",
          message: "Scan activity is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
