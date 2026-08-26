/**
 * One-time backfill: reconstruct outcomes for existing PromotedStock rows.
 *
 * The daily cron (track-promoted-stocks) only processes a bounded number of
 * symbols per run; this script loops the same tracker until every active row
 * has been visited, so six months of MONITORING rows get real outcomes in
 * one sitting. Safe to re-run — already-terminal rows are deactivated and
 * drop out of later batches.
 *
 * Usage: npx tsx scripts/backfill-promoted-outcomes.ts
 * Requires DATABASE_URL and FMP_API_KEY in the environment.
 */

import { trackPromotedStocks } from "../src/lib/promoted-stocks/tracker";
import { prisma } from "../src/lib/db";

const BATCH_SYMBOLS = 150;
const BATCH_PAUSE_MS = 5_000; // breathe between batches for FMP rate limits

async function main() {
  let batch = 1;
  for (;;) {
    console.log(`\n=== Batch ${batch} (up to ${BATCH_SYMBOLS} symbols) ===`);
    const result = await trackPromotedStocks({ symbolLimit: BATCH_SYMBOLS });
    console.log(
      `symbols: ${result.symbolsProcessed}, rows updated: ${result.rowsUpdated}, ` +
        `entry prices backfilled: ${result.entryPricesBackfilled}, ` +
        `retired no-data: ${result.rowsRetiredNoData}, errors: ${result.errors}`,
    );
    console.log("outcomes:", result.outcomes);

    // Done when a batch finds nothing left to update this calendar day
    const untouched = await prisma.promotedStock.count({
      where: {
        isActive: true,
        OR: [
          { lastUpdateDate: null },
          { lastUpdateDate: { lt: new Date(new Date().toDateString()) } },
        ],
      },
    });
    console.log(`${untouched} active rows still untouched today`);
    if (untouched === 0 || result.symbolsProcessed === 0) break;

    batch++;
    await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
  }

  const summary = await prisma.promotedStock.groupBy({
    by: ["outcome"],
    _count: { _all: true },
  });
  console.log("\n=== Final outcome distribution ===");
  for (const row of summary) {
    console.log(`${row.outcome ?? "(null)"}: ${row._count._all}`);
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
