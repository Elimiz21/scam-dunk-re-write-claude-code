import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  cronAuthorizationFailure,
  unsafeIngestionTargetResponse,
  verifyIngestionTarget,
} from "@/lib/server/ingestion-safety";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE_AFTER_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const authorizationFailure = cronAuthorizationFailure(request);
  if (authorizationFailure) return authorizationFailure;

  if (!verifyIngestionTarget().ok) return unsafeIngestionTargetResponse();

  const staleThreshold = new Date(Date.now() - STALE_AFTER_MS);
  try {
    const result = await prisma.socialScanRun.updateMany({
      where: {
        status: "RUNNING",
        updatedAt: { lt: staleThreshold },
      },
      data: {
        status: "TIMED_OUT",
        errors: JSON.stringify([
          "Scan timed out — no status update received within 10 minutes",
        ]),
      },
    });
    return NextResponse.json({ expired: result.count });
  } catch (error) {
    console.error("Social scan cleanup failed:", error);
    return NextResponse.json(
      {
        error: {
          code: "CLEANUP_FAILED",
          message: "Social scan cleanup failed.",
        },
      },
      { status: 500 },
    );
  }
}
