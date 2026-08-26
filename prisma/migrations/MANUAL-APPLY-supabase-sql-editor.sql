-- ============================================================================
-- ScamDunk — audit remediation database update
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- What it does: ADDS new columns and indexes the new app code needs, and removes
-- 3 redundant indexes. It does NOT delete or modify any of your data.
-- It is safe to run more than once (every statement is guarded with IF [NOT] EXISTS).
--
-- Equivalent to prisma/migrations/20260611000000_audit_remediation, hardened for
-- manual execution. (Prisma's migration-history table can be initialized later
-- once a dev/CI environment with DB access exists; nothing auto-runs migrations.)
-- ============================================================================

-- Remove 3 redundant indexes (each duplicates an existing unique constraint)
DROP INDEX IF EXISTS "ScanUsage_userId_monthKey_idx";
DROP INDEX IF EXISTS "AdminUser_email_idx";
DROP INDEX IF EXISTS "ScanHistory_userId_idx";

-- New columns on User: subscription entitlement + session versioning
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleOriginalTransactionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionStore" TEXT;

-- New column on SocialMention: dedup hash
ALTER TABLE "SocialMention" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- New indexes (performance + the constraints the new code relies on)
CREATE UNIQUE INDEX IF NOT EXISTS "User_appleOriginalTransactionId_key" ON "User"("appleOriginalTransactionId");
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "ApiUsageLog_dayKey_idx" ON "ApiUsageLog"("dayKey");
CREATE INDEX IF NOT EXISTS "ApiUsageLog_hourKey_idx" ON "ApiUsageLog"("hourKey");
CREATE INDEX IF NOT EXISTS "ScanHistory_userId_createdAt_idx" ON "ScanHistory"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ScanHistory_createdAt_ticker_idx" ON "ScanHistory"("createdAt", "ticker");
CREATE INDEX IF NOT EXISTS "SocialMention_ticker_contentHash_idx" ON "SocialMention"("ticker", "contentHash");
CREATE UNIQUE INDEX IF NOT EXISTS "SocialMention_scanRunId_ticker_contentHash_key" ON "SocialMention"("scanRunId", "ticker", "contentHash");
