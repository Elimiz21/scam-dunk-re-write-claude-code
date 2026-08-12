/**
 * Promoted-stock outcome tracker
 *
 * PromotedStock rows are created by the daily ingest with outcome "MONITORING"
 * and never touched again. This module closes the loop: it fetches daily
 * closes from FMP since each row's addedDate, fills current/peak price and
 * gain %, and moves the outcome through a simple state machine:
 *
 *   MONITORING → PUMPING → PEAKED → DUMPED
 *              → STABLE   (never pumped after STABLE_DAYS)
 *              → DELISTED (instrument stopped trading — recorded as a total
 *                          loss: price → 0, currentGainPct −100)
 *              → NO_DATA  (no price coverage anywhere after NO_DATA_RETIRE_DAYS)
 *
 * Delisting is detected, not assumed: when a symbol's series is empty or
 * stale, we first try to resolve a SUCCESSOR TICKER (renames, OTC demotions
 * and bankruptcy re-tickers make price feeds 404 the old symbol while the
 * instrument keeps trading — e.g. SGMO→SGMOQ, MAXN→MAXNQ, GMGI→MRDN). Only
 * when no successor has fresh data and FMP's own profile says the symbol is
 * no longer actively trading do rows get retired as DELISTED.
 *
 * Used by the daily cron (/api/cron/track-promoted-stocks) and by the
 * one-time backfill script (scripts/backfill-promoted-outcomes.ts). One FMP
 * request serves every row that shares a symbol, and terminal rows are
 * deactivated so the daily workload stays bounded.
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const FETCH_TIMEOUT_MS = 15_000;

// State-machine thresholds (percentages relative to entry/peak price)
export const PUMP_GAIN_PCT = 25; // entry→peak gain that counts as a pump
export const PEAK_DROP_PCT = 20; // drop from peak that ends the pump
export const DUMP_DROP_PCT = 50; // drop from peak (or below entry) = dumped
export const STABLE_DAYS = 30; // no pump after this many days → STABLE
export const RETIRE_DAYS = 90; // stop tracking after this many days
export const NO_DATA_RETIRE_DAYS = 30; // no data coverage after this → NO_DATA
// A series whose last close is older than this is treated as "stopped
// trading" rather than merely between sessions (covers long weekends + halts).
export const STALE_SERIES_DAYS = 14;
// Series silence alone only confirms a delisting after this long — SEC
// trading suspensions run up to ~10 trading days and must not read as death.
export const DELIST_CONFIRM_DAYS = 21;

const DailyCloseSchema = z.array(
  z.object({
    date: z.string(),
    close: z.number(),
    high: z.number().optional(),
  }),
);

export interface DailyClose {
  date: string; // YYYY-MM-DD
  close: number;
  high: number;
}

/**
 * Daily closes for a symbol from `from` (YYYY-MM-DD) to today, ascending.
 * Best-effort: any failure returns [] so one bad symbol never aborts a run.
 */
export async function fetchDailyCloses(
  symbol: string,
  from: string,
): Promise<DailyClose[]> {
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&apikey=${config.fmpApiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.error(`[promo-tracker] FMP ${symbol} returned ${response.status}`);
      return [];
    }
    const parsed = DailyCloseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(`[promo-tracker] FMP ${symbol} response invalid`);
      return [];
    }
    // FMP returns newest-first; flip to ascending
    return parsed.data
      .map((d) => ({ date: d.date, close: d.close, high: d.high ?? d.close }))
      .reverse();
  } catch (error) {
    console.error(`[promo-tracker] FMP ${symbol} fetch failed:`, error);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/** True when a series is empty or its newest close is older than `days`. */
export function isSeriesStale(
  closes: DailyClose[],
  now: Date,
  days: number = STALE_SERIES_DAYS,
): boolean {
  if (closes.length === 0) return true;
  const last = new Date(closes[closes.length - 1].date + "T00:00:00Z");
  return now.getTime() - last.getTime() > days * 86_400_000;
}

/**
 * Resolve a renamed/re-tickered symbol to its successor via
 * stockanalysis.com's redirect (their stock pages 301 old slugs to the
 * current ticker). Best-effort: any failure returns null.
 */
export async function resolveSuccessorTicker(
  symbol: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://stockanalysis.com/stocks/${symbol.toLowerCase()}/`,
      { signal: controller.signal, redirect: "follow" },
    );
    if (!response.ok) return null;
    const match = response.url.match(/\/stocks\/([a-z0-9.-]+)\/?$/i);
    if (!match) return null;
    const resolved = match[1].toUpperCase();
    return resolved !== symbol.toUpperCase() ? resolved : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * FMP company profile — used only for its isActivelyTrading flag, the
 * signal that separates "delisted" from "FMP simply doesn't cover this".
 * Returns null when the profile is unavailable.
 */
export async function fetchIsActivelyTrading(
  symbol: string,
): Promise<boolean | null> {
  const url = `${FMP_BASE_URL}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${config.fmpApiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    const first = Array.isArray(data) ? data[0] : data;
    if (first && typeof first === "object" && "isActivelyTrading" in first) {
      return Boolean((first as { isActivelyTrading: unknown }).isActivelyTrading);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface OutcomeInput {
  entryPrice: number;
  currentPrice: number;
  peakPrice: number;
  daysSinceAdded: number;
}

export function computeOutcome({
  entryPrice,
  currentPrice,
  peakPrice,
  daysSinceAdded,
}: OutcomeInput): { outcome: string; isActive: boolean } {
  const maxGainPct = ((peakPrice - entryPrice) / entryPrice) * 100;
  const dropFromPeakPct =
    peakPrice > 0 ? ((peakPrice - currentPrice) / peakPrice) * 100 : 0;
  const belowHalfEntry = currentPrice < entryPrice * 0.5;

  let outcome: string;
  if (maxGainPct >= PUMP_GAIN_PCT) {
    if (dropFromPeakPct >= DUMP_DROP_PCT) outcome = "DUMPED";
    else if (dropFromPeakPct >= PEAK_DROP_PCT) outcome = "PEAKED";
    else outcome = "PUMPING";
  } else if (belowHalfEntry) {
    // Never pumped after we flagged it, but cratered anyway
    outcome = "DUMPED";
  } else if (daysSinceAdded >= STABLE_DAYS) {
    outcome = "STABLE";
  } else {
    outcome = "MONITORING";
  }

  const terminal = outcome === "DUMPED" || daysSinceAdded >= RETIRE_DAYS;
  return { outcome, isActive: !terminal };
}

export interface TrackResult {
  symbolsProcessed: number;
  rowsUpdated: number;
  rowsRetiredNoData: number;
  rowsRetiredDelisted: number;
  successorTickersResolved: number;
  entryPricesBackfilled: number;
  outcomes: Record<string, number>;
  errors: number;
}

interface TrackOptions {
  /** Max distinct symbols to process this run (API budget). */
  symbolLimit?: number;
  /** Stop starting new symbols after this many ms. */
  timeBudgetMs?: number;
}

/**
 * Track every active PromotedStock row. Rows are grouped by symbol so one
 * FMP request covers all rows of that symbol; symbols least-recently
 * updated go first so repeated runs make progress through the backlog.
 */
export async function trackPromotedStocks(
  options: TrackOptions = {},
): Promise<TrackResult> {
  const { symbolLimit = 300, timeBudgetMs } = options;
  const startTime = Date.now();
  const now = new Date();

  const rows = await prisma.promotedStock.findMany({
    where: { isActive: true },
    select: {
      id: true,
      symbol: true,
      addedDate: true,
      entryPrice: true,
      peakPrice: true,
      peakDate: true,
      lastUpdateDate: true,
    },
  });

  const bySymbol = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySymbol.get(row.symbol) ?? [];
    list.push(row);
    bySymbol.set(row.symbol, list);
  }

  // Least-recently-updated symbols first (never-updated before everything)
  const symbols = Array.from(bySymbol.entries())
    .sort(([, a], [, b]) => {
      const lastA = Math.min(...a.map((r) => r.lastUpdateDate?.getTime() ?? 0));
      const lastB = Math.min(...b.map((r) => r.lastUpdateDate?.getTime() ?? 0));
      return lastA - lastB;
    })
    .slice(0, symbolLimit);

  const result: TrackResult = {
    symbolsProcessed: 0,
    rowsUpdated: 0,
    rowsRetiredNoData: 0,
    rowsRetiredDelisted: 0,
    successorTickersResolved: 0,
    entryPricesBackfilled: 0,
    outcomes: {},
    errors: 0,
  };

  for (const [symbol, symbolRows] of symbols) {
    if (timeBudgetMs && Date.now() - startTime > timeBudgetMs) {
      console.log(
        `[promo-tracker] Time budget reached after ${result.symbolsProcessed} symbols — stopping early`,
      );
      break;
    }

    const earliest = symbolRows.reduce(
      (min, r) => (r.addedDate < min ? r.addedDate : min),
      symbolRows[0].addedDate,
    );
    const from = earliest.toISOString().slice(0, 10);
    let closes = await fetchDailyCloses(symbol, from);
    result.symbolsProcessed++;

    // Empty or stale series: the feed may have moved the history to a
    // successor ticker (rename / OTC demotion / bankruptcy re-ticker).
    // Prefer the successor's series when it is fresher than the original.
    let delistingConfirmed = false;
    if (isSeriesStale(closes, now)) {
      const successor = await resolveSuccessorTicker(symbol);
      if (successor) {
        const successorCloses = await fetchDailyCloses(successor, from);
        if (
          successorCloses.length > 0 &&
          (closes.length === 0 ||
            successorCloses[successorCloses.length - 1].date >
              closes[closes.length - 1].date)
        ) {
          console.log(
            `[promo-tracker] ${symbol}: using successor ticker ${successor}`,
          );
          closes = successorCloses;
          result.successorTickersResolved++;
        }
      }
      // Still stale after successor resolution → ask FMP whether the
      // instrument is actually done trading before declaring it dead.
      // Series silence alone is only trusted after DELIST_CONFIRM_DAYS so a
      // multi-week SEC suspension is never misread as a delisting.
      if (isSeriesStale(closes, now)) {
        delistingConfirmed =
          (await fetchIsActivelyTrading(symbol)) === false ||
          (closes.length > 0 && isSeriesStale(closes, now, DELIST_CONFIRM_DAYS));
      }
    }

    for (const row of symbolRows) {
      try {
        const added = row.addedDate.toISOString().slice(0, 10);
        const sinceAdded = closes.filter((c) => c.date >= added);
        const daysSinceAdded = Math.floor(
          (now.getTime() - row.addedDate.getTime()) / 86_400_000,
        );

        // Instrument stopped trading: record as a terminal loss. Peak/gain
        // fields keep whatever the series shows (the pump before the death);
        // the position itself is worth nothing.
        if (delistingConfirmed) {
          const entryPrice =
            row.entryPrice > 0 ? row.entryPrice : (sinceAdded[0]?.close ?? 0);
          const peak = sinceAdded.reduce(
            (best, c) => (c.high > best ? c.high : best),
            row.peakPrice ?? 0,
          );
          await prisma.promotedStock.update({
            where: { id: row.id },
            data: {
              outcome: "DELISTED",
              currentPrice: 0,
              currentGainPct: -100,
              ...(peak > 0 && entryPrice > 0
                ? {
                    peakPrice: peak,
                    maxGainPct: ((peak - entryPrice) / entryPrice) * 100,
                  }
                : {}),
              isActive: false,
              lastUpdateDate: now,
            },
          });
          result.rowsRetiredDelisted++;
          result.outcomes.DELISTED = (result.outcomes.DELISTED ?? 0) + 1;
          continue;
        }

        if (sinceAdded.length === 0) {
          // No coverage anywhere (thin OTC tier, warrant…) — keep waiting,
          // then retire as NO_DATA so the daily workload stays bounded.
          if (daysSinceAdded >= NO_DATA_RETIRE_DAYS) {
            await prisma.promotedStock.update({
              where: { id: row.id },
              data: { outcome: "NO_DATA", isActive: false, lastUpdateDate: now },
            });
            result.rowsRetiredNoData++;
          }
          continue;
        }

        // Repair rows saved with entryPrice 0 using the first close on record
        let entryPrice = row.entryPrice;
        let backfilledEntry = false;
        if (entryPrice <= 0) {
          entryPrice = sinceAdded[0].close;
          backfilledEntry = true;
          if (entryPrice <= 0) continue;
        }

        const peak = sinceAdded.reduce(
          (best, c) => (c.high > best.price ? { price: c.high, date: c.date } : best),
          { price: row.peakPrice ?? 0, date: row.peakDate?.toISOString().slice(0, 10) ?? sinceAdded[0].date },
        );
        const currentPrice = sinceAdded[sinceAdded.length - 1].close;

        const { outcome, isActive } = computeOutcome({
          entryPrice,
          currentPrice,
          peakPrice: peak.price,
          daysSinceAdded,
        });

        await prisma.promotedStock.update({
          where: { id: row.id },
          data: {
            ...(backfilledEntry ? { entryPrice } : {}),
            currentPrice,
            peakPrice: peak.price,
            peakDate: new Date(peak.date),
            currentGainPct: ((currentPrice - entryPrice) / entryPrice) * 100,
            maxGainPct: ((peak.price - entryPrice) / entryPrice) * 100,
            outcome,
            isActive,
            lastUpdateDate: now,
          },
        });

        result.rowsUpdated++;
        if (backfilledEntry) result.entryPricesBackfilled++;
        result.outcomes[outcome] = (result.outcomes[outcome] ?? 0) + 1;
      } catch (error) {
        result.errors++;
        console.error(`[promo-tracker] Failed to update ${symbol} row ${row.id}:`, error);
      }
    }
  }

  return result;
}
