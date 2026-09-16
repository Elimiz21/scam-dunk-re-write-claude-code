import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  cronAuthorizationFailure,
  unsafeIngestionTargetResponse,
  verifyIngestionTarget,
} from "@/lib/server/ingestion-safety";
import { reconcileStaleSocialRuns } from "@/lib/social-scan/stale-run-cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorizationFailure = cronAuthorizationFailure(request);
  if (authorizationFailure) return authorizationFailure;

  if (!verifyIngestionTarget().ok) return unsafeIngestionTargetResponse();

  try {
    return NextResponse.json(await reconcileStaleSocialRuns(prisma));
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
