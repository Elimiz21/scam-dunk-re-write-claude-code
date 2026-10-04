import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin/auth";
import { getConversionFunnelReport } from "@/lib/admin/conversion-funnel";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getConversionFunnelReport());
  } catch (error) {
    console.error("Conversion funnel report failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to load funnel metrics." }, { status: 500 });
  }
}
