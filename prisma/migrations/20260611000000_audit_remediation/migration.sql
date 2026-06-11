-- DropIndex
DROP INDEX "ScanUsage_userId_monthKey_idx";

-- DropIndex
DROP INDEX "AdminUser_email_idx";

-- DropIndex
DROP INDEX "ScanHistory_userId_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appleOriginalTransactionId" TEXT,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStore" TEXT;

-- AlterTable
ALTER TABLE "SocialMention" ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_appleOriginalTransactionId_key" ON "User"("appleOriginalTransactionId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "ApiUsageLog_dayKey_idx" ON "ApiUsageLog"("dayKey");

-- CreateIndex
CREATE INDEX "ApiUsageLog_hourKey_idx" ON "ApiUsageLog"("hourKey");

-- CreateIndex
CREATE INDEX "ScanHistory_userId_createdAt_idx" ON "ScanHistory"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ScanHistory_createdAt_ticker_idx" ON "ScanHistory"("createdAt", "ticker");

-- CreateIndex
CREATE INDEX "SocialMention_ticker_contentHash_idx" ON "SocialMention"("ticker", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMention_scanRunId_ticker_contentHash_key" ON "SocialMention"("scanRunId", "ticker", "contentHash");

