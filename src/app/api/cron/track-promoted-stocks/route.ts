/**
 * Cron: Track promoted-stock price outcomes
 *
 * Triggered by Vercel Cron (see vercel.json) Mon-Fri at 21:30 UTC, after US
 * market close. Secured with CRON_SECRET. Fetches daily closes for every
 * active PromotedStock symbol and advances the outcome state machine
 * (MONITORING → PUMPING → PEAKED → DUMPED / STABLE / NO_DATA).
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { trackPromotedStocks } from "@/lib/promoted-stocks/tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // 13 min max (Vercel Pro)

const TIME_BUDGET_MS = 9 * 60 * 1000;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !token || expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });

  const startTime = Date.now();
  try {
    const result = await trackPromotedStocks({ timeBudgetMs: TIME_BUDGET_MS });
    console.log(
      `[cron-promo-tracker] ${result.symbolsProcessed} symbols, ${result.rowsUpdated} rows updated, ` +
        `${result.entryPricesBackfilled} entry prices backfilled, ${result.rowsRetiredNoData} retired (no data), ` +
        `${result.errors} errors (${Math.round((Date.now() - startTime) / 1000)}s)`,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron-promo-tracker] Run failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
