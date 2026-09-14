import { NextResponse } from "next/server";

import { getActivityTicker } from "@/lib/activity-ticker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getActivityTicker();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
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
