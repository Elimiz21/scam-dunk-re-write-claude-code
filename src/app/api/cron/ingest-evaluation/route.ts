/**
 * Cron: Auto-ingest daily evaluation files
 *
 * Triggered by Vercel Cron (see vercel.json) Mon-Fri at 7am UTC.
 * Secured with CRON_SECRET environment variable.
 *
 * Processes all pending evaluation dates oldest-first, stopping after 9 minutes
 * to stay well within the 13-minute maxDuration limit.
 */

import { NextResponse } from "next/server";
import { getPendingDates, ingestDate, IngestResult } from "@/lib/admin/ingest-evaluation-core";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // 13 min max (Vercel Pro)

// Time budget: stop processing new dates after this many ms (9 minutes)
const TIME_BUDGET_MS = 9 * 60 * 1000;

export async function GET(request: Request) {
  // 1. Verify CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron-ingest] CRON_SECRET environment variable is not set");
    return NextResponse.json(
      { error: "Server misconfiguration: CRON_SECRET is not set" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronStart = Date.now();

  // 2. Get all pending dates
  let pendingDates: string[];
  try {
    pendingDates = await getPendingDates();
  } catch (err) {
    console.error("[cron-ingest] Failed to get pending dates:", err);
    return NextResponse.json(
      {
        error: "Failed to list pending dates",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const totalPending = pendingDates.length;

  if (totalPending === 0) {
    console.log("[cron-ingest] Nothing to ingest — all dates are up to date");
    return NextResponse.json({
      processed: [],
      results: [],
      remaining: 0,
      totalPending: 0,
      message: "Nothing to ingest",
    });
  }

  console.log(`[cron-ingest] ${totalPending} pending dates to process`);

  // 3. Process pending dates oldest-first, respecting time budget
  const processed: string[] = [];
  const results: IngestResult[] = [];

  for (let i = 0; i < pendingDates.length; i++) {
    const date = pendingDates[i];
    const elapsed = Date.now() - cronStart;

    if (elapsed > TIME_BUDGET_MS) {
      console.log(
        `[cron-ingest] Time budget (9m) reached after ${Math.round(elapsed / 1000)}s — stopping early`,
      );
      break;
    }

    console.log(
      `[cron-ingest] Processing date ${date} (${i + 1} of ${totalPending} pending)...`,
    );

    // Don't abort on single failure — continue processing other dates
    const result = await ingestDate(date);
    results.push(result);

    if (result.success) {
      processed.push(date);
      console.log(
        `[cron-ingest] ${date} done — ${result.stocksCreated} created, ${result.snapshotsCreated} snapshots, ${result.alertsCreated} alerts (${Math.round(result.durationMs / 1000)}s)`,
      );
    } else {
      console.error(
        `[cron-ingest] ${date} FAILED — ${result.error} — continuing with next date`,
      );
    }
  }

  const remaining = totalPending - processed.length - results.filter((r) => !r.success).length;

  console.log(
    `[cron-ingest] Session complete — ${processed.length} ingested, ${results.filter((r) => !r.success).length} failed, ${remaining} remaining`,
  );

  return NextResponse.json({
    processed,
    results,
    remaining: Math.max(0, remaining),
    totalPending,
  });
}
