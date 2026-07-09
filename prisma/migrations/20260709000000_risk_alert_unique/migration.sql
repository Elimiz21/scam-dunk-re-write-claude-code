-- Add a uniqueness guarantee to StockRiskAlert so createMany({skipDuplicates})
-- actually dedupes and a stock can't be alerted twice for the same (date, type).
--
-- IMPORTANT: this migration DELETES pre-existing exact-duplicate alert rows
-- (same stockId + alertDate + alertType), keeping the earliest one per group,
-- because the UNIQUE index cannot be created while duplicates exist. This is a
-- lossless dedupe (the removed rows are byte-for-byte redundant), but it is
-- still a destructive statement — take a backup / run in a maintenance window.
-- See docs/review-2026-07/IMPLEMENTATION-PLAN.md Phase 3.4/3.7.

-- 1) Remove exact-duplicate alerts, keeping the earliest per group.
DELETE FROM "StockRiskAlert"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "stockId", "alertDate", "alertType"
             ORDER BY "createdAt" ASC, "id" ASC
           ) AS rn
    FROM "StockRiskAlert"
  ) t
  WHERE t.rn > 1
);

-- 2) Drop the redundant composite index (the new unique index covers the
--    [stockId, alertDate] prefix).
DROP INDEX IF EXISTS "StockRiskAlert_stockId_alertDate_idx";

-- 3) Add the unique constraint.
CREATE UNIQUE INDEX "StockRiskAlert_stockId_alertDate_alertType_key"
  ON "StockRiskAlert"("stockId", "alertDate", "alertType");
