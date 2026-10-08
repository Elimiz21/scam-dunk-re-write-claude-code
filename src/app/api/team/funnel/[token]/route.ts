import { NextRequest, NextResponse } from "next/server";

import { getConversionFunnelReport } from "@/lib/admin/conversion-funnel";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const expectedToken = process.env.FUNNEL_DASHBOARD_SHARE_TOKEN;
  if (!expectedToken || params.token !== expectedToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    return NextResponse.json(await getConversionFunnelReport());
  } catch (error) {
    console.error("Team funnel report failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to load funnel metrics." }, { status: 500 });
  }
}
