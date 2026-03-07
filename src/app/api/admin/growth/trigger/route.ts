/**
 * Growth Engine Trigger API
 * POST - Trigger discovery or monitoring runs on the Railway growth engine service
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = await request.json();

    const growthEngineUrl = process.env.GROWTH_ENGINE_URL;
    const growthApiKey = process.env.GROWTH_ENGINE_API_KEY;

    if (!growthEngineUrl) {
      return NextResponse.json(
        { error: "GROWTH_ENGINE_URL not configured" },
        { status: 503 }
      );
    }

    const endpoint =
      action === "monitoring"
        ? `${growthEngineUrl}/api/trigger/monitoring`
        : `${growthEngineUrl}/api/trigger/discovery`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (growthApiKey) {
      headers["X-Growth-API-Key"] = growthApiKey;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Growth engine responded with ${res.status}: ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Growth Trigger API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
