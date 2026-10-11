-- Preserve the explicit historical promise (five scans per month) while
-- turning the later one-scan offer into a non-renewing lifetime allowance.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "freeScanAllowancePeriod" TEXT NOT NULL DEFAULT 'LIFETIME',
  ADD COLUMN IF NOT EXISTS "freeLifetimeScansUsed" INTEGER NOT NULL DEFAULT 0;

-- Only accounts created before the one-scan policy retain monthly credits.
UPDATE "User"
SET "freeScanAllowancePeriod" = 'MONTHLY'
WHERE "createdAt" < TIMESTAMPTZ '2026-10-08T18:43:44Z'
  AND "freeMonthlyScanCredits" >= 5;

-- One-scan accounts that already completed a scan do not receive a second
-- lifetime free scan after this migration. ScanHistory contains completed
-- scans only; a failed reservation is refunded and has no history row.
WITH completed AS (
  SELECT "userId", COUNT(*)::INTEGER AS "successfulScanCount"
  FROM "ScanHistory"
  WHERE "userId" IS NOT NULL
  GROUP BY "userId"
)
UPDATE "User" AS u
SET "freeLifetimeScansUsed" = LEAST(1, completed."successfulScanCount")
FROM completed
WHERE u.id = completed."userId"
  AND u."freeScanAllowancePeriod" = 'LIFETIME'
  AND u.plan = 'FREE';
