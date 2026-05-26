-- =====================================================
-- FULL SCHEMA SYNC: Prisma → Supabase
-- Run this entire script in the Supabase SQL Editor
-- It is idempotent (safe to run multiple times)
-- =====================================================

-- =====================================================
-- 1. ADD MISSING COLUMNS TO EXISTING TABLES
-- =====================================================

-- User table: add columns that may be missing
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "formerPro" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "billingCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "image" TEXT;

-- =====================================================
-- 2. CREATE ALL TABLES (IF NOT EXISTS)
-- =====================================================

-- Core Auth Tables (NextAuth)
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "hashedPassword" TEXT,
  "name" TEXT,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'FREE',
  "formerPro" BOOLEAN NOT NULL DEFAULT false,
  "billingCustomerId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScanUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "monthKey" TEXT NOT NULL,
  "scanCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScanUsage_pkey" PRIMARY KEY ("id")
);

-- Admin Workspace
CREATE TABLE IF NOT EXISTS "AdminUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "hashedPassword" TEXT NOT NULL,
  "name" TEXT,
  "role" TEXT NOT NULL DEFAULT 'ADMIN',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminSession" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminInvite" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'ADMIN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invitedBy" TEXT NOT NULL,
  CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApiUsageLog" (
  "id" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "endpoint" TEXT,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "tokensUsed" INTEGER,
  "estimatedCost" DOUBLE PRECISION,
  "responseTime" INTEGER,
  "statusCode" INTEGER,
  "errorMessage" TEXT,
  "monthKey" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "hourKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApiCostAlert" (
  "id" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "alertType" TEXT NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "currentValue" DOUBLE PRECISION,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastTriggered" TIMESTAMP(3),
  "notifyEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiCostAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IntegrationConfig" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "config" TEXT,
  "apiKeyMasked" TEXT,
  "rateLimit" INTEGER,
  "monthlyBudget" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "lastCheckedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScanHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "ticker" TEXT NOT NULL,
  "assetType" TEXT NOT NULL DEFAULT 'stock',
  "riskLevel" TEXT NOT NULL,
  "totalScore" INTEGER NOT NULL,
  "signalsCount" INTEGER NOT NULL,
  "processingTime" INTEGER,
  "openaiTokens" INTEGER,
  "alphaVantageHit" BOOLEAN NOT NULL DEFAULT false,
  "isLegitimate" BOOLEAN,
  "pitchProvided" BOOLEAN NOT NULL DEFAULT false,
  "contextProvided" BOOLEAN NOT NULL DEFAULT false,
  "ipAddress" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScanHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ModelMetrics" (
  "id" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "totalScans" INTEGER NOT NULL DEFAULT 0,
  "lowRiskCount" INTEGER NOT NULL DEFAULT 0,
  "mediumRiskCount" INTEGER NOT NULL DEFAULT 0,
  "highRiskCount" INTEGER NOT NULL DEFAULT 0,
  "insufficientCount" INTEGER NOT NULL DEFAULT 0,
  "legitDetected" INTEGER NOT NULL DEFAULT 0,
  "avgProcessingTime" DOUBLE PRECISION,
  "avgScore" DOUBLE PRECISION,
  "uniqueTickers" INTEGER NOT NULL DEFAULT 0,
  "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
  "falsePositives" INTEGER NOT NULL DEFAULT 0,
  "falseNegatives" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelMetrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- Stock Tracking
CREATE TABLE IF NOT EXISTS "TrackedStock" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "exchange" TEXT NOT NULL,
  "sector" TEXT,
  "industry" TEXT,
  "isOTC" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackedStock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockDailySnapshot" (
  "id" TEXT NOT NULL,
  "stockId" TEXT NOT NULL,
  "scanDate" TIMESTAMP(3) NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "totalScore" INTEGER NOT NULL,
  "isLegitimate" BOOLEAN NOT NULL,
  "isInsufficient" BOOLEAN NOT NULL DEFAULT false,
  "lastPrice" DOUBLE PRECISION,
  "previousClose" DOUBLE PRECISION,
  "priceChangePct" DOUBLE PRECISION,
  "volume" INTEGER,
  "avgVolume" INTEGER,
  "volumeRatio" DOUBLE PRECISION,
  "marketCap" DOUBLE PRECISION,
  "signals" TEXT NOT NULL DEFAULT '[]',
  "signalSummary" TEXT,
  "signalCount" INTEGER NOT NULL DEFAULT 0,
  "dataSource" TEXT NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockDailySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DailyScanSummary" (
  "id" TEXT NOT NULL,
  "scanDate" TIMESTAMP(3) NOT NULL,
  "totalStocks" INTEGER NOT NULL,
  "evaluated" INTEGER NOT NULL,
  "skippedNoData" INTEGER NOT NULL,
  "lowRiskCount" INTEGER NOT NULL,
  "mediumRiskCount" INTEGER NOT NULL,
  "highRiskCount" INTEGER NOT NULL,
  "insufficientCount" INTEGER NOT NULL,
  "byExchange" TEXT NOT NULL,
  "bySector" TEXT,
  "scanDurationMins" INTEGER,
  "apiCallsMade" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyScanSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockRiskAlert" (
  "id" TEXT NOT NULL,
  "stockId" TEXT NOT NULL,
  "alertDate" TIMESTAMP(3) NOT NULL,
  "alertType" TEXT NOT NULL,
  "previousRiskLevel" TEXT,
  "newRiskLevel" TEXT NOT NULL,
  "previousScore" INTEGER,
  "newScore" INTEGER NOT NULL,
  "triggeringSignals" TEXT,
  "priceAtAlert" DOUBLE PRECISION,
  "volumeAtAlert" INTEGER,
  "isAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockRiskAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PromotedStock" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "addedDate" TIMESTAMP(3) NOT NULL,
  "promoterName" TEXT NOT NULL,
  "promotionPlatform" TEXT NOT NULL,
  "promotionGroup" TEXT,
  "entryPrice" DOUBLE PRECISION NOT NULL,
  "entryMarketCap" DOUBLE PRECISION,
  "entryRiskScore" INTEGER NOT NULL,
  "peakPrice" DOUBLE PRECISION,
  "peakDate" TIMESTAMP(3),
  "currentPrice" DOUBLE PRECISION,
  "lastUpdateDate" TIMESTAMP(3),
  "outcome" TEXT,
  "maxGainPct" DOUBLE PRECISION,
  "currentGainPct" DOUBLE PRECISION,
  "evidenceLinks" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotedStock_pkey" PRIMARY KEY ("id")
);

-- Auth Error Tracking
CREATE TABLE IF NOT EXISTS "AuthErrorLog" (
  "id" TEXT NOT NULL,
  "errorType" TEXT NOT NULL,
  "errorCode" TEXT,
  "email" TEXT,
  "userId" TEXT,
  "endpoint" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" TEXT,
  "stackTrace" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuthErrorSummary" (
  "id" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "signupErrors" INTEGER NOT NULL DEFAULT 0,
  "loginErrors" INTEGER NOT NULL DEFAULT 0,
  "verificationErrors" INTEGER NOT NULL DEFAULT 0,
  "passwordResetErrors" INTEGER NOT NULL DEFAULT 0,
  "emailSendErrors" INTEGER NOT NULL DEFAULT 0,
  "topErrorCodes" TEXT,
  "uniqueEmailsAffected" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthErrorSummary_pkey" PRIMARY KEY ("id")
);

-- Scan Messages
CREATE TABLE IF NOT EXISTS "ScanMessage" (
  "id" TEXT NOT NULL,
  "headline" TEXT NOT NULL,
  "subtext" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generationId" TEXT,
  CONSTRAINT "ScanMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScanMessageHistory" (
  "id" TEXT NOT NULL,
  "headline" TEXT NOT NULL,
  "subtext" TEXT NOT NULL,
  "archiveReason" TEXT,
  "originalCreatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generationId" TEXT,
  CONSTRAINT "ScanMessageHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScanMessageGeneration" (
  "id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "generatedCount" INTEGER NOT NULL,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "discardedCount" INTEGER NOT NULL DEFAULT 0,
  "discardedMessages" TEXT,
  "feedbackNotes" TEXT,
  "tokensUsed" INTEGER,
  "estimatedCost" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "ScanMessageGeneration_pkey" PRIMARY KEY ("id")
);

-- Blog & Media
CREATE TABLE IF NOT EXISTS "BlogPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT,
  "content" TEXT NOT NULL,
  "coverImage" TEXT,
  "author" TEXT NOT NULL DEFAULT 'Scam Dunk Team',
  "category" TEXT NOT NULL DEFAULT 'General',
  "tags" TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MediaMention" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "logoUrl" TEXT,
  "description" TEXT,
  "quoteText" TEXT,
  "mentionDate" TIMESTAMP(3),
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaMention_pkey" PRIMARY KEY ("id")
);

-- Support Tickets
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "userId" TEXT,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "assignedTo" TEXT,
  "internalNotes" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportTicketResponse" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isFromAdmin" BOOLEAN NOT NULL DEFAULT true,
  "responderId" TEXT,
  "responderName" TEXT,
  "responderEmail" TEXT,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportEmailRecipient" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "categories" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "SupportEmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "emailType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "fromEmail" TEXT,
  "resendId" TEXT,
  "errorMessage" TEXT,
  "relatedTicketId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- Regulatory
CREATE TABLE IF NOT EXISTS "RegulatoryFlag" (
  "id" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "flagType" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "flagDate" TIMESTAMP(3) NOT NULL,
  "expiryDate" TIMESTAMP(3),
  "sourceUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "severity" TEXT NOT NULL DEFAULT 'HIGH',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegulatoryFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RegulatoryDatabaseSync" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "lastSyncAt" TIMESTAMP(3) NOT NULL,
  "recordsAdded" INTEGER NOT NULL DEFAULT 0,
  "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegulatoryDatabaseSync_pkey" PRIMARY KEY ("id")
);

-- Social Scanning
CREATE TABLE IF NOT EXISTS "SocialScanRun" (
  "id" TEXT NOT NULL,
  "scanDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "tickersScanned" INTEGER NOT NULL DEFAULT 0,
  "tickersWithMentions" INTEGER NOT NULL DEFAULT 0,
  "totalMentions" INTEGER NOT NULL DEFAULT 0,
  "platformsUsed" TEXT,
  "duration" INTEGER,
  "errors" TEXT,
  "triggeredBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialScanRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialMention" (
  "id" TEXT NOT NULL,
  "scanRunId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "stockName" TEXT,
  "platform" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "discoveredVia" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT,
  "url" TEXT,
  "author" TEXT,
  "postDate" TIMESTAMP(3),
  "engagement" TEXT,
  "sentiment" TEXT,
  "isPromotional" BOOLEAN NOT NULL DEFAULT false,
  "promotionScore" INTEGER NOT NULL DEFAULT 0,
  "redFlags" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialMention_pkey" PRIMARY KEY ("id")
);

-- Homepage
CREATE TABLE IF NOT EXISTS "HomepageHero" (
  "id" TEXT NOT NULL,
  "headline" TEXT NOT NULL,
  "subheadline" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "HomepageHero_pkey" PRIMARY KEY ("id")
);

-- Browser Agent
CREATE TABLE IF NOT EXISTS "BrowserAgentSession" (
  "id" TEXT NOT NULL,
  "scanDate" TIMESTAMP(3) NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "tickersSearched" TEXT NOT NULL,
  "pagesVisited" INTEGER NOT NULL DEFAULT 0,
  "mentionsFound" INTEGER NOT NULL DEFAULT 0,
  "screenshotsTaken" INTEGER NOT NULL DEFAULT 0,
  "browserMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "memoryPeakMb" DOUBLE PRECISION,
  "errors" TEXT,
  "suspensionCount" INTEGER NOT NULL DEFAULT 0,
  "resumedFrom" TEXT,
  "scanRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrowserAgentSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrowserEvidence" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "url" TEXT,
  "textContent" TEXT,
  "author" TEXT,
  "authorProfileUrl" TEXT,
  "postDate" TIMESTAMP(3),
  "engagement" TEXT,
  "promotionScore" INTEGER NOT NULL DEFAULT 0,
  "redFlags" TEXT,
  "screenshotPath" TEXT,
  "screenshotUrl" TEXT,
  "rawHtml" TEXT,
  "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrowserEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrowserPlatformConfig" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt" TIMESTAMP(3),
  "lastLoginStatus" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "autoDisabled" BOOLEAN NOT NULL DEFAULT false,
  "autoDisabledAt" TIMESTAMP(3),
  "dailyPageLimit" INTEGER NOT NULL DEFAULT 100,
  "dailyPagesUsed" INTEGER NOT NULL DEFAULT 0,
  "dailyResetDate" TEXT,
  "monitorTargets" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrowserPlatformConfig_pkey" PRIMARY KEY ("id")
);

-- Promoter Matrix
CREATE TABLE IF NOT EXISTS "PromoterNetwork" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "coPromotionCount" INTEGER NOT NULL DEFAULT 0,
  "avgTimingGapHours" DOUBLE PRECISION,
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "totalSchemes" INTEGER NOT NULL DEFAULT 0,
  "confirmedDumps" INTEGER NOT NULL DEFAULT 0,
  "dumpRate" DOUBLE PRECISION,
  "firstDetected" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoterNetwork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Promoter" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalStocksPromoted" INTEGER NOT NULL DEFAULT 0,
  "confirmedDumps" INTEGER NOT NULL DEFAULT 0,
  "repeatOffenderScore" INTEGER NOT NULL DEFAULT 0,
  "avgVictimLoss" DOUBLE PRECISION,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
  "notes" TEXT,
  "networkId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Promoter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PromoterIdentity" (
  "id" TEXT NOT NULL,
  "promoterId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "profileUrl" TEXT,
  "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "followerCount" INTEGER,
  "accountAge" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoterIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PromoterStockLink" (
  "id" TEXT NOT NULL,
  "promoterId" TEXT NOT NULL,
  "schemeId" TEXT,
  "ticker" TEXT NOT NULL,
  "firstPromotionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPromotionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalPosts" INTEGER NOT NULL DEFAULT 1,
  "platforms" TEXT,
  "avgPromotionScore" INTEGER NOT NULL DEFAULT 0,
  "evidenceLinks" TEXT,
  "screenshotUrls" TEXT,
  "priceAtFirstPromotion" DOUBLE PRECISION,
  "peakPrice" DOUBLE PRECISION,
  "priceAfterDump" DOUBLE PRECISION,
  "gainForPromoter" DOUBLE PRECISION,
  "lossForVictims" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoterStockLink_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- 3. UNIQUE CONSTRAINTS (skip if already exist)
-- =====================================================

DO $$ BEGIN ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Account" ADD CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Session" ADD CONSTRAINT "Session_sessionToken_key" UNIQUE ("sessionToken"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_token_key" UNIQUE ("token"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_token_key" UNIQUE ("token"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_token_key" UNIQUE ("token"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ScanUsage" ADD CONSTRAINT "ScanUsage_userId_monthKey_key" UNIQUE ("userId", "monthKey"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_email_key" UNIQUE ("email"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_token_key" UNIQUE ("token"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_token_key" UNIQUE ("token"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_name_key" UNIQUE ("name"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ModelMetrics" ADD CONSTRAINT "ModelMetrics_dateKey_key" UNIQUE ("dateKey"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrackedStock" ADD CONSTRAINT "TrackedStock_symbol_key" UNIQUE ("symbol"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StockDailySnapshot" ADD CONSTRAINT "StockDailySnapshot_stockId_scanDate_key" UNIQUE ("stockId", "scanDate"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DailyScanSummary" ADD CONSTRAINT "DailyScanSummary_scanDate_key" UNIQUE ("scanDate"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PromotedStock" ADD CONSTRAINT "PromotedStock_symbol_addedDate_key" UNIQUE ("symbol", "addedDate"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AuthErrorSummary" ADD CONSTRAINT "AuthErrorSummary_dateKey_key" UNIQUE ("dateKey"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_slug_key" UNIQUE ("slug"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SupportEmailRecipient" ADD CONSTRAINT "SupportEmailRecipient_email_key" UNIQUE ("email"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RegulatoryFlag" ADD CONSTRAINT "RegulatoryFlag_ticker_source_flagType_flagDate_key" UNIQUE ("ticker", "source", "flagType", "flagDate"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "BrowserPlatformConfig" ADD CONSTRAINT "BrowserPlatformConfig_platform_key" UNIQUE ("platform"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PromoterIdentity" ADD CONSTRAINT "PromoterIdentity_platform_username_key" UNIQUE ("platform", "username"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PromoterStockLink" ADD CONSTRAINT "PromoterStockLink_promoterId_ticker_key" UNIQUE ("promoterId", "ticker"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- =====================================================
-- 4. FOREIGN KEYS (skip if already exist)
-- =====================================================

DO $$ BEGIN ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ScanUsage" ADD CONSTRAINT "ScanUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StockDailySnapshot" ADD CONSTRAINT "StockDailySnapshot_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StockRiskAlert" ADD CONSTRAINT "StockRiskAlert_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ScanMessage" ADD CONSTRAINT "ScanMessage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ScanMessageGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SupportTicketResponse" ADD CONSTRAINT "SupportTicketResponse_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SocialMention" ADD CONSTRAINT "SocialMention_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "SocialScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "BrowserEvidence" ADD CONSTRAINT "BrowserEvidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserAgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Promoter" ADD CONSTRAINT "Promoter_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "PromoterNetwork"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PromoterIdentity" ADD CONSTRAINT "PromoterIdentity_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PromoterStockLink" ADD CONSTRAINT "PromoterStockLink_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- 5. INDEXES (skip if already exist)
-- =====================================================

CREATE INDEX IF NOT EXISTS "EmailVerificationToken_email_idx" ON "EmailVerificationToken"("email");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");
CREATE INDEX IF NOT EXISTS "ScanUsage_userId_monthKey_idx" ON "ScanUsage"("userId", "monthKey");
CREATE INDEX IF NOT EXISTS "AdminUser_email_idx" ON "AdminUser"("email");
CREATE INDEX IF NOT EXISTS "AdminSession_token_idx" ON "AdminSession"("token");
CREATE INDEX IF NOT EXISTS "AdminSession_adminUserId_idx" ON "AdminSession"("adminUserId");
CREATE INDEX IF NOT EXISTS "AdminInvite_token_idx" ON "AdminInvite"("token");
CREATE INDEX IF NOT EXISTS "AdminInvite_email_idx" ON "AdminInvite"("email");
CREATE INDEX IF NOT EXISTS "ApiUsageLog_service_monthKey_idx" ON "ApiUsageLog"("service", "monthKey");
CREATE INDEX IF NOT EXISTS "ApiUsageLog_service_dayKey_idx" ON "ApiUsageLog"("service", "dayKey");
CREATE INDEX IF NOT EXISTS "ApiUsageLog_createdAt_idx" ON "ApiUsageLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ApiCostAlert_service_isActive_idx" ON "ApiCostAlert"("service", "isActive");
CREATE INDEX IF NOT EXISTS "IntegrationConfig_category_idx" ON "IntegrationConfig"("category");
CREATE INDEX IF NOT EXISTS "ScanHistory_createdAt_idx" ON "ScanHistory"("createdAt");
CREATE INDEX IF NOT EXISTS "ScanHistory_riskLevel_idx" ON "ScanHistory"("riskLevel");
CREATE INDEX IF NOT EXISTS "ScanHistory_ticker_idx" ON "ScanHistory"("ticker");
CREATE INDEX IF NOT EXISTS "ScanHistory_userId_idx" ON "ScanHistory"("userId");
CREATE INDEX IF NOT EXISTS "ModelMetrics_dateKey_idx" ON "ModelMetrics"("dateKey");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_adminUserId_idx" ON "AdminAuditLog"("adminUserId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "TrackedStock_exchange_idx" ON "TrackedStock"("exchange");
CREATE INDEX IF NOT EXISTS "TrackedStock_sector_idx" ON "TrackedStock"("sector");
CREATE INDEX IF NOT EXISTS "StockDailySnapshot_scanDate_idx" ON "StockDailySnapshot"("scanDate");
CREATE INDEX IF NOT EXISTS "StockDailySnapshot_riskLevel_idx" ON "StockDailySnapshot"("riskLevel");
CREATE INDEX IF NOT EXISTS "StockDailySnapshot_riskLevel_scanDate_idx" ON "StockDailySnapshot"("riskLevel", "scanDate");
CREATE INDEX IF NOT EXISTS "DailyScanSummary_scanDate_idx" ON "DailyScanSummary"("scanDate");
CREATE INDEX IF NOT EXISTS "StockRiskAlert_alertDate_idx" ON "StockRiskAlert"("alertDate");
CREATE INDEX IF NOT EXISTS "StockRiskAlert_alertType_idx" ON "StockRiskAlert"("alertType");
CREATE INDEX IF NOT EXISTS "StockRiskAlert_stockId_alertDate_idx" ON "StockRiskAlert"("stockId", "alertDate");
CREATE INDEX IF NOT EXISTS "PromotedStock_promoterName_idx" ON "PromotedStock"("promoterName");
CREATE INDEX IF NOT EXISTS "PromotedStock_isActive_idx" ON "PromotedStock"("isActive");
CREATE INDEX IF NOT EXISTS "AuthErrorLog_errorType_idx" ON "AuthErrorLog"("errorType");
CREATE INDEX IF NOT EXISTS "AuthErrorLog_errorCode_idx" ON "AuthErrorLog"("errorCode");
CREATE INDEX IF NOT EXISTS "AuthErrorLog_email_idx" ON "AuthErrorLog"("email");
CREATE INDEX IF NOT EXISTS "AuthErrorLog_createdAt_idx" ON "AuthErrorLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuthErrorLog_isResolved_idx" ON "AuthErrorLog"("isResolved");
CREATE INDEX IF NOT EXISTS "AuthErrorSummary_dateKey_idx" ON "AuthErrorSummary"("dateKey");
CREATE INDEX IF NOT EXISTS "ScanMessage_isActive_order_idx" ON "ScanMessage"("isActive", "order");
CREATE INDEX IF NOT EXISTS "ScanMessage_generationId_idx" ON "ScanMessage"("generationId");
CREATE INDEX IF NOT EXISTS "ScanMessageHistory_archivedAt_idx" ON "ScanMessageHistory"("archivedAt");
CREATE INDEX IF NOT EXISTS "ScanMessageGeneration_createdAt_idx" ON "ScanMessageGeneration"("createdAt");
CREATE INDEX IF NOT EXISTS "BlogPost_isPublished_publishedAt_idx" ON "BlogPost"("isPublished", "publishedAt");
CREATE INDEX IF NOT EXISTS "BlogPost_slug_idx" ON "BlogPost"("slug");
CREATE INDEX IF NOT EXISTS "BlogPost_category_idx" ON "BlogPost"("category");
CREATE INDEX IF NOT EXISTS "MediaMention_isPublished_isFeatured_idx" ON "MediaMention"("isPublished", "isFeatured");
CREATE INDEX IF NOT EXISTS "MediaMention_sourceType_idx" ON "MediaMention"("sourceType");
CREATE INDEX IF NOT EXISTS "MediaMention_mentionDate_idx" ON "MediaMention"("mentionDate");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_category_idx" ON "SupportTicket"("category");
CREATE INDEX IF NOT EXISTS "SupportTicket_priority_idx" ON "SupportTicket"("priority");
CREATE INDEX IF NOT EXISTS "SupportTicket_email_idx" ON "SupportTicket"("email");
CREATE INDEX IF NOT EXISTS "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_assignedTo_idx" ON "SupportTicket"("assignedTo");
CREATE INDEX IF NOT EXISTS "SupportTicketResponse_ticketId_idx" ON "SupportTicketResponse"("ticketId");
CREATE INDEX IF NOT EXISTS "SupportTicketResponse_createdAt_idx" ON "SupportTicketResponse"("createdAt");
CREATE INDEX IF NOT EXISTS "SupportEmailRecipient_isActive_idx" ON "SupportEmailRecipient"("isActive");
CREATE INDEX IF NOT EXISTS "SupportEmailRecipient_isPrimary_idx" ON "SupportEmailRecipient"("isPrimary");
CREATE INDEX IF NOT EXISTS "EmailLog_emailType_idx" ON "EmailLog"("emailType");
CREATE INDEX IF NOT EXISTS "EmailLog_status_idx" ON "EmailLog"("status");
CREATE INDEX IF NOT EXISTS "EmailLog_recipientEmail_idx" ON "EmailLog"("recipientEmail");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_relatedTicketId_idx" ON "EmailLog"("relatedTicketId");
CREATE INDEX IF NOT EXISTS "RegulatoryFlag_ticker_idx" ON "RegulatoryFlag"("ticker");
CREATE INDEX IF NOT EXISTS "RegulatoryFlag_source_idx" ON "RegulatoryFlag"("source");
CREATE INDEX IF NOT EXISTS "RegulatoryFlag_isActive_idx" ON "RegulatoryFlag"("isActive");
CREATE INDEX IF NOT EXISTS "RegulatoryFlag_flagDate_idx" ON "RegulatoryFlag"("flagDate");
CREATE INDEX IF NOT EXISTS "RegulatoryDatabaseSync_source_idx" ON "RegulatoryDatabaseSync"("source");
CREATE INDEX IF NOT EXISTS "RegulatoryDatabaseSync_lastSyncAt_idx" ON "RegulatoryDatabaseSync"("lastSyncAt");
CREATE INDEX IF NOT EXISTS "SocialScanRun_scanDate_idx" ON "SocialScanRun"("scanDate");
CREATE INDEX IF NOT EXISTS "SocialScanRun_status_idx" ON "SocialScanRun"("status");
CREATE INDEX IF NOT EXISTS "SocialMention_ticker_platform_idx" ON "SocialMention"("ticker", "platform");
CREATE INDEX IF NOT EXISTS "SocialMention_scanRunId_idx" ON "SocialMention"("scanRunId");
CREATE INDEX IF NOT EXISTS "SocialMention_createdAt_idx" ON "SocialMention"("createdAt");
CREATE INDEX IF NOT EXISTS "SocialMention_ticker_createdAt_idx" ON "SocialMention"("ticker", "createdAt");
CREATE INDEX IF NOT EXISTS "SocialMention_isPromotional_idx" ON "SocialMention"("isPromotional");
CREATE INDEX IF NOT EXISTS "HomepageHero_isActive_idx" ON "HomepageHero"("isActive");
CREATE INDEX IF NOT EXISTS "HomepageHero_createdAt_idx" ON "HomepageHero"("createdAt");
CREATE INDEX IF NOT EXISTS "BrowserAgentSession_scanDate_idx" ON "BrowserAgentSession"("scanDate");
CREATE INDEX IF NOT EXISTS "BrowserAgentSession_platform_idx" ON "BrowserAgentSession"("platform");
CREATE INDEX IF NOT EXISTS "BrowserAgentSession_status_idx" ON "BrowserAgentSession"("status");
CREATE INDEX IF NOT EXISTS "BrowserAgentSession_scanRunId_idx" ON "BrowserAgentSession"("scanRunId");
CREATE INDEX IF NOT EXISTS "BrowserEvidence_ticker_platform_idx" ON "BrowserEvidence"("ticker", "platform");
CREATE INDEX IF NOT EXISTS "BrowserEvidence_sessionId_idx" ON "BrowserEvidence"("sessionId");
CREATE INDEX IF NOT EXISTS "BrowserEvidence_promotionScore_idx" ON "BrowserEvidence"("promotionScore");
CREATE INDEX IF NOT EXISTS "BrowserEvidence_author_idx" ON "BrowserEvidence"("author");
CREATE INDEX IF NOT EXISTS "BrowserPlatformConfig_isEnabled_idx" ON "BrowserPlatformConfig"("isEnabled");
CREATE INDEX IF NOT EXISTS "Promoter_displayName_idx" ON "Promoter"("displayName");
CREATE INDEX IF NOT EXISTS "Promoter_repeatOffenderScore_idx" ON "Promoter"("repeatOffenderScore");
CREATE INDEX IF NOT EXISTS "Promoter_riskLevel_idx" ON "Promoter"("riskLevel");
CREATE INDEX IF NOT EXISTS "Promoter_isActive_idx" ON "Promoter"("isActive");
CREATE INDEX IF NOT EXISTS "Promoter_networkId_idx" ON "Promoter"("networkId");
CREATE INDEX IF NOT EXISTS "PromoterIdentity_promoterId_idx" ON "PromoterIdentity"("promoterId");
CREATE INDEX IF NOT EXISTS "PromoterIdentity_platform_idx" ON "PromoterIdentity"("platform");
CREATE INDEX IF NOT EXISTS "PromoterStockLink_ticker_idx" ON "PromoterStockLink"("ticker");
CREATE INDEX IF NOT EXISTS "PromoterStockLink_promoterId_idx" ON "PromoterStockLink"("promoterId");
CREATE INDEX IF NOT EXISTS "PromoterStockLink_schemeId_idx" ON "PromoterStockLink"("schemeId");
CREATE INDEX IF NOT EXISTS "PromoterStockLink_firstPromotionDate_idx" ON "PromoterStockLink"("firstPromotionDate");
CREATE INDEX IF NOT EXISTS "PromoterNetwork_isActive_idx" ON "PromoterNetwork"("isActive");
CREATE INDEX IF NOT EXISTS "PromoterNetwork_confidenceScore_idx" ON "PromoterNetwork"("confidenceScore");
CREATE INDEX IF NOT EXISTS "PromoterNetwork_dumpRate_idx" ON "PromoterNetwork"("dumpRate");

-- =====================================================
-- DONE! Your database schema is now fully synced.
-- =====================================================
