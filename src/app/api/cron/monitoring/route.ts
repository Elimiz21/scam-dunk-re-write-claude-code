import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  getLatestPublishedPublicationKey,
  runEligibleMonitorPublication,
} from "@/lib/monitoring/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hasValidCronSecret(request: NextRequest, expectedSecret: string) {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${expectedSecret}`;
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      {
        error: {
          code: "CRON_NOT_CONFIGURED",
          message: "Monitoring cron is not configured.",
        },
      },
      { status: 503 },
    );
  }
  if (!hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json(
      {
        error: { code: "UNAUTHORIZED", message: "Invalid cron credentials." },
      },
      { status: 401 },
    );
  }

  try {
    const publicationKey =
      request.nextUrl.searchParams.get("publicationKey") ??
      (await getLatestPublishedPublicationKey());
    if (!publicationKey) {
      return NextResponse.json(
        {
          error: {
            code: "STALE_DATA",
            message: "No published end-of-day market scan is available.",
          },
        },
        { status: 503 },
      );
    }
    const result = await runEligibleMonitorPublication(publicationKey);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PUBLICATION_KEY") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Publication key must use eod:YYYY-MM-DD.",
          },
        },
        { status: 400 },
      );
    }
    console.error("Monitoring cron error:", error);
    return NextResponse.json(
      {
        error: {
          code: "MONITORING_RUN_FAILED",
          message: "The monitoring run failed without charging failed items.",
        },
      },
      { status: 500 },
    );
  }
}

export const POST = GET;
