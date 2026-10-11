-- Recover the free-scan entitlement column if the original rollout migration
-- was not applied before application code began selecting it.
--
-- The product policy changed at 2026-10-08T18:43:44Z: accounts that existed
-- before then retain five monthly free scans; accounts created afterwards keep
-- the one-scan default. This makes a delayed recovery safe for both groups.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "freeMonthlyScanCredits" INTEGER NOT NULL DEFAULT 1;

UPDATE "User"
SET "freeMonthlyScanCredits" = 5
WHERE "createdAt" < TIMESTAMPTZ '2026-10-08T18:43:44Z';
