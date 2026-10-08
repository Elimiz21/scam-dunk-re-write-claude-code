-- Preserve the five-scan promise made to every account that existed before
-- the free-plan default changed. Future users receive the schema default of
-- one, while this stored value remains stable through future product changes.
ALTER TABLE "User"
  ADD COLUMN "freeMonthlyScanCredits" INTEGER NOT NULL DEFAULT 1;

UPDATE "User"
SET "freeMonthlyScanCredits" = 5;
