import { NextRequest, NextResponse } from "next/server";
import { cronAuthorizationFailure } from "@/lib/server/ingestion-safety";
import { recoverAbandonedScans } from "@/lib/scan-completion";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = cronAuthorizationFailure(request);
  if (denied) return denied;
  try { return NextResponse.json({ recovered: await recoverAbandonedScans() }); }
  catch (error) {
    console.error("Scan reservation recovery failed", error);
    return NextResponse.json({ error: "RECOVERY_FAILED" }, { status: 503 });
  }
}
