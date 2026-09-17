-- An absent retained entry price is unknown, never a fabricated zero or later quote.
-- Existing rows and outcome evidence remain unchanged.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "PromotedStock" ALTER COLUMN "entryPrice" DROP NOT NULL;
