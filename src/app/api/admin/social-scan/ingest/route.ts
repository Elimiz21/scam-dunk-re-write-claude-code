import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import {
  CliIngestConflictError,
  ingestCliSocialScan,
  parseCliSocialIngestPayload,
} from "@/lib/social-scan/cli-ingest";
import {
  unsafeIngestionTargetResponse,
  verifyIngestionTarget,
} from "@/lib/server/ingestion-safety";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      const authHeader = request.headers.get("authorization");
      const apiKey = process.env.SOCIAL_SCAN_INGEST_KEY;
      if (!apiKey || !authHeader) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const expected = Buffer.from(`Bearer ${apiKey}`, "utf8");
      const provided = Buffer.from(authHeader, "utf8");
      if (
        expected.length !== provided.length ||
        !crypto.timingSafeEqual(expected, provided)
      ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!verifyIngestionTarget().ok) return unsafeIngestionTargetResponse();

    const rawText = await request.text();
    if (Buffer.byteLength(rawText, "utf8") > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = parseCliSocialIngestPayload(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await ingestCliSocialScan(prisma, parsed.data, {
      owner: session ? `cli:${session.id}` : "cli:api-key",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CliIngestConflictError) {
      return NextResponse.json(
        { error: error.message, code: "SCAN_RUN_CONFLICT" },
        { status: 409 },
      );
    }
    console.error("Social scan ingest error:", error);
    return NextResponse.json(
      { error: "Failed to ingest scan results" },
      { status: 500 },
    );
  }
}
