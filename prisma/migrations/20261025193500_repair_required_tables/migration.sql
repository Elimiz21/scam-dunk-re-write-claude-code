-- Repair additive schema drift observed in production; retain existing records and legacy columns.
CREATE TABLE IF NOT EXISTS "ConversionFunnelEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "plan" TEXT,
    "provider" TEXT,
    "transactionId" TEXT,
    "valueCents" INTEGER,
    "currency" TEXT,
    "clientId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionFunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConversionFunnelEvent_idempotencyKey_key"
    ON "ConversionFunnelEvent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ConversionFunnelEvent_eventType_occurredAt_idx"
    ON "ConversionFunnelEvent"("eventType", "occurredAt");
CREATE INDEX IF NOT EXISTS "ConversionFunnelEvent_userId_eventType_occurredAt_idx"
    ON "ConversionFunnelEvent"("userId", "eventType", "occurredAt");
CREATE INDEX IF NOT EXISTS "ConversionFunnelEvent_plan_occurredAt_idx"
    ON "ConversionFunnelEvent"("plan", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='"ConversionFunnelEvent"'::regclass AND conname = 'ConversionFunnelEvent_userId_fkey'
  ) THEN
    ALTER TABLE "ConversionFunnelEvent"
      ADD CONSTRAINT "ConversionFunnelEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ConversionFunnelEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ConversionFunnelEvent" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "ConversionFunnelEvent" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "ConversionFunnelEvent" FROM authenticated; END IF;
END $$;

CREATE TABLE IF NOT EXISTS "pre_pump_watchlist" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "addedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "mentionVelocity" DOUBLE PRECISION,
    "mentionCount24h" INTEGER,
    "uniqueAuthorsRatio" DOUBLE PRECISION,
    "signals" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedDate" TIMESTAMP(3),
    "deactivationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_pump_watchlist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pre_pump_watchlist_isActive_ticker_idx" ON "pre_pump_watchlist"("isActive", "ticker");
CREATE INDEX IF NOT EXISTS "pre_pump_watchlist_addedDate_idx" ON "pre_pump_watchlist"("addedDate");
ALTER TABLE "pre_pump_watchlist" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pre_pump_watchlist" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "pre_pump_watchlist" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "pre_pump_watchlist" FROM authenticated; END IF;
END $$;

CREATE TABLE IF NOT EXISTS "FeatureInterest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureInterest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeatureInterest_email_feature_key" ON "FeatureInterest"("email", "feature");
CREATE INDEX IF NOT EXISTS "FeatureInterest_feature_createdAt_idx" ON "FeatureInterest"("feature", "createdAt");

ALTER TABLE "FeatureInterest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FeatureInterest" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "FeatureInterest" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "FeatureInterest" FROM authenticated; END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='freeMonthlyScanCredits') THEN
  ALTER TABLE "User" ADD COLUMN "freeMonthlyScanCredits" INTEGER NOT NULL DEFAULT 1;
  UPDATE "User" SET "freeMonthlyScanCredits"=5 WHERE "createdAt"<'2026-10-08T00:00:00Z';
 END IF;
END $$;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstTouchSource" TEXT,
 ADD COLUMN IF NOT EXISTS "firstTouchMedium" TEXT,
 ADD COLUMN IF NOT EXISTS "firstTouchCampaign" TEXT,
 ADD COLUMN IF NOT EXISTS "firstTouchReferrerHost" TEXT,
 ADD COLUMN IF NOT EXISTS "firstTouchClientId" TEXT;
CREATE INDEX IF NOT EXISTS "User_firstTouchSource_firstTouchMedium_idx" ON "User"("firstTouchSource","firstTouchMedium");
