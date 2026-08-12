-- One alert per stock per day. Duplicate re-ingests before this constraint
-- created ~87k duplicate rows (285,526 raw vs 198,124 distinct stock-days);
-- duplicates were deleted in production on 2026-08-12 before this index.
-- (The old @@index([stockId, alertDate]) is superseded by the unique index.)
CREATE UNIQUE INDEX IF NOT EXISTS "StockRiskAlert_stockId_alertDate_key" ON "StockRiskAlert"("stockId", "alertDate");
DROP INDEX IF EXISTS "StockRiskAlert_stockId_alertDate_idx";
