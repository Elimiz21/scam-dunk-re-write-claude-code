-- CreateTable
CREATE TABLE "User" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
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

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminInvite" (
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

-- CreateTable
CREATE TABLE "ApiUsageLog" (
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

-- CreateTable
CREATE TABLE "ApiCostAlert" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggered" TIMESTAMP(3),
    "notifyEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCostAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanHistory" (
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
    "isOtc" BOOLEAN NOT NULL DEFAULT false,
    "isMicroCap" BOOLEAN NOT NULL DEFAULT false,
    "isHighVolume" BOOLEAN NOT NULL DEFAULT false,
    "usedAiBackend" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelMetrics" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedStock" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "sector" TEXT,
    "industry" TEXT,
    "isOTC" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDailySnapshot" (
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

-- CreateTable
CREATE TABLE "DailyScanSummary" (
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

-- CreateTable
CREATE TABLE "StockRiskAlert" (
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

-- CreateTable
CREATE TABLE "PromotedStock" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotedStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthErrorLog" (
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

-- CreateTable
CREATE TABLE "AuthErrorSummary" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthErrorSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanMessage" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subtext" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "generationId" TEXT,

    CONSTRAINT "ScanMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanMessageHistory" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subtext" TEXT NOT NULL,
    "archiveReason" TEXT,
    "originalCreatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationId" TEXT,

    CONSTRAINT "ScanMessageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanMessageGeneration" (
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

-- CreateTable
CREATE TABLE "BlogPost" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaMention" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketResponse" (
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

-- CreateTable
CREATE TABLE "SupportEmailRecipient" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "categories" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "SupportEmailRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
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

-- CreateTable
CREATE TABLE "RegulatoryFlag" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryDatabaseSync" (
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

-- CreateTable
CREATE TABLE "SocialScanRun" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMention" (
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

-- CreateTable
CREATE TABLE "HomepageHero" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subheadline" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "HomepageHero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserAgentSession" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserAgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserEvidence" (
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

-- CreateTable
CREATE TABLE "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "window" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserPlatformConfig" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserPlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promoter" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promoter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoterIdentity" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoterIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoterStockLink" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoterStockLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoterNetwork" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoterNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_pump_watchlist" (
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_email_idx" ON "EmailVerificationToken"("email");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "ScanUsage_userId_monthKey_idx" ON "ScanUsage"("userId", "monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScanUsage_userId_monthKey_key" ON "ScanUsage"("userId", "monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_email_idx" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_token_key" ON "AdminSession"("token");

-- CreateIndex
CREATE INDEX "AdminSession_token_idx" ON "AdminSession"("token");

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_idx" ON "AdminSession"("adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvite_token_key" ON "AdminInvite"("token");

-- CreateIndex
CREATE INDEX "AdminInvite_token_idx" ON "AdminInvite"("token");

-- CreateIndex
CREATE INDEX "AdminInvite_email_idx" ON "AdminInvite"("email");

-- CreateIndex
CREATE INDEX "ApiUsageLog_service_monthKey_idx" ON "ApiUsageLog"("service", "monthKey");

-- CreateIndex
CREATE INDEX "ApiUsageLog_service_dayKey_idx" ON "ApiUsageLog"("service", "dayKey");

-- CreateIndex
CREATE INDEX "ApiUsageLog_createdAt_idx" ON "ApiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiCostAlert_service_isActive_idx" ON "ApiCostAlert"("service", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_name_key" ON "IntegrationConfig"("name");

-- CreateIndex
CREATE INDEX "IntegrationConfig_category_idx" ON "IntegrationConfig"("category");

-- CreateIndex
CREATE INDEX "ScanHistory_createdAt_idx" ON "ScanHistory"("createdAt");

-- CreateIndex
CREATE INDEX "ScanHistory_riskLevel_idx" ON "ScanHistory"("riskLevel");

-- CreateIndex
CREATE INDEX "ScanHistory_ticker_idx" ON "ScanHistory"("ticker");

-- CreateIndex
CREATE INDEX "ScanHistory_userId_idx" ON "ScanHistory"("userId");

-- CreateIndex
CREATE INDEX "ScanHistory_isOtc_idx" ON "ScanHistory"("isOtc");

-- CreateIndex
CREATE INDEX "ScanHistory_isMicroCap_idx" ON "ScanHistory"("isMicroCap");

-- CreateIndex
CREATE UNIQUE INDEX "ModelMetrics_dateKey_key" ON "ModelMetrics"("dateKey");

-- CreateIndex
CREATE INDEX "ModelMetrics_dateKey_idx" ON "ModelMetrics"("dateKey");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminUserId_idx" ON "AdminAuditLog"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedStock_symbol_key" ON "TrackedStock"("symbol");

-- CreateIndex
CREATE INDEX "TrackedStock_exchange_idx" ON "TrackedStock"("exchange");

-- CreateIndex
CREATE INDEX "TrackedStock_sector_idx" ON "TrackedStock"("sector");

-- CreateIndex
CREATE INDEX "StockDailySnapshot_scanDate_idx" ON "StockDailySnapshot"("scanDate");

-- CreateIndex
CREATE INDEX "StockDailySnapshot_riskLevel_idx" ON "StockDailySnapshot"("riskLevel");

-- CreateIndex
CREATE INDEX "StockDailySnapshot_riskLevel_scanDate_idx" ON "StockDailySnapshot"("riskLevel", "scanDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockDailySnapshot_stockId_scanDate_key" ON "StockDailySnapshot"("stockId", "scanDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyScanSummary_scanDate_key" ON "DailyScanSummary"("scanDate");

-- CreateIndex
CREATE INDEX "DailyScanSummary_scanDate_idx" ON "DailyScanSummary"("scanDate");

-- CreateIndex
CREATE INDEX "StockRiskAlert_alertDate_idx" ON "StockRiskAlert"("alertDate");

-- CreateIndex
CREATE INDEX "StockRiskAlert_alertType_idx" ON "StockRiskAlert"("alertType");

-- CreateIndex
CREATE INDEX "StockRiskAlert_stockId_alertDate_idx" ON "StockRiskAlert"("stockId", "alertDate");

-- CreateIndex
CREATE INDEX "PromotedStock_promoterName_idx" ON "PromotedStock"("promoterName");

-- CreateIndex
CREATE INDEX "PromotedStock_isActive_idx" ON "PromotedStock"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromotedStock_symbol_addedDate_key" ON "PromotedStock"("symbol", "addedDate");

-- CreateIndex
CREATE INDEX "AuthErrorLog_errorType_idx" ON "AuthErrorLog"("errorType");

-- CreateIndex
CREATE INDEX "AuthErrorLog_errorCode_idx" ON "AuthErrorLog"("errorCode");

-- CreateIndex
CREATE INDEX "AuthErrorLog_email_idx" ON "AuthErrorLog"("email");

-- CreateIndex
CREATE INDEX "AuthErrorLog_createdAt_idx" ON "AuthErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuthErrorLog_isResolved_idx" ON "AuthErrorLog"("isResolved");

-- CreateIndex
CREATE UNIQUE INDEX "AuthErrorSummary_dateKey_key" ON "AuthErrorSummary"("dateKey");

-- CreateIndex
CREATE INDEX "AuthErrorSummary_dateKey_idx" ON "AuthErrorSummary"("dateKey");

-- CreateIndex
CREATE INDEX "ScanMessage_isActive_order_idx" ON "ScanMessage"("isActive", "order");

-- CreateIndex
CREATE INDEX "ScanMessage_generationId_idx" ON "ScanMessage"("generationId");

-- CreateIndex
CREATE INDEX "ScanMessageHistory_archivedAt_idx" ON "ScanMessageHistory"("archivedAt");

-- CreateIndex
CREATE INDEX "ScanMessageGeneration_createdAt_idx" ON "ScanMessageGeneration"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_isPublished_publishedAt_idx" ON "BlogPost"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "BlogPost_slug_idx" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_category_idx" ON "BlogPost"("category");

-- CreateIndex
CREATE INDEX "MediaMention_isPublished_isFeatured_idx" ON "MediaMention"("isPublished", "isFeatured");

-- CreateIndex
CREATE INDEX "MediaMention_sourceType_idx" ON "MediaMention"("sourceType");

-- CreateIndex
CREATE INDEX "MediaMention_mentionDate_idx" ON "MediaMention"("mentionDate");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_category_idx" ON "SupportTicket"("category");

-- CreateIndex
CREATE INDEX "SupportTicket_priority_idx" ON "SupportTicket"("priority");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedTo_idx" ON "SupportTicket"("assignedTo");

-- CreateIndex
CREATE INDEX "SupportTicketResponse_ticketId_idx" ON "SupportTicketResponse"("ticketId");

-- CreateIndex
CREATE INDEX "SupportTicketResponse_createdAt_idx" ON "SupportTicketResponse"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportEmailRecipient_email_key" ON "SupportEmailRecipient"("email");

-- CreateIndex
CREATE INDEX "SupportEmailRecipient_isActive_idx" ON "SupportEmailRecipient"("isActive");

-- CreateIndex
CREATE INDEX "SupportEmailRecipient_isPrimary_idx" ON "SupportEmailRecipient"("isPrimary");

-- CreateIndex
CREATE INDEX "EmailLog_emailType_idx" ON "EmailLog"("emailType");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_recipientEmail_idx" ON "EmailLog"("recipientEmail");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_relatedTicketId_idx" ON "EmailLog"("relatedTicketId");

-- CreateIndex
CREATE INDEX "RegulatoryFlag_ticker_idx" ON "RegulatoryFlag"("ticker");

-- CreateIndex
CREATE INDEX "RegulatoryFlag_source_idx" ON "RegulatoryFlag"("source");

-- CreateIndex
CREATE INDEX "RegulatoryFlag_isActive_idx" ON "RegulatoryFlag"("isActive");

-- CreateIndex
CREATE INDEX "RegulatoryFlag_flagDate_idx" ON "RegulatoryFlag"("flagDate");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryFlag_ticker_source_flagType_flagDate_key" ON "RegulatoryFlag"("ticker", "source", "flagType", "flagDate");

-- CreateIndex
CREATE INDEX "RegulatoryDatabaseSync_source_idx" ON "RegulatoryDatabaseSync"("source");

-- CreateIndex
CREATE INDEX "RegulatoryDatabaseSync_lastSyncAt_idx" ON "RegulatoryDatabaseSync"("lastSyncAt");

-- CreateIndex
CREATE INDEX "SocialScanRun_scanDate_idx" ON "SocialScanRun"("scanDate");

-- CreateIndex
CREATE INDEX "SocialScanRun_status_idx" ON "SocialScanRun"("status");

-- CreateIndex
CREATE INDEX "SocialMention_ticker_platform_idx" ON "SocialMention"("ticker", "platform");

-- CreateIndex
CREATE INDEX "SocialMention_scanRunId_idx" ON "SocialMention"("scanRunId");

-- CreateIndex
CREATE INDEX "SocialMention_createdAt_idx" ON "SocialMention"("createdAt");

-- CreateIndex
CREATE INDEX "SocialMention_ticker_createdAt_idx" ON "SocialMention"("ticker", "createdAt");

-- CreateIndex
CREATE INDEX "SocialMention_isPromotional_idx" ON "SocialMention"("isPromotional");

-- CreateIndex
CREATE INDEX "HomepageHero_isActive_idx" ON "HomepageHero"("isActive");

-- CreateIndex
CREATE INDEX "HomepageHero_createdAt_idx" ON "HomepageHero"("createdAt");

-- CreateIndex
CREATE INDEX "BrowserAgentSession_scanDate_idx" ON "BrowserAgentSession"("scanDate");

-- CreateIndex
CREATE INDEX "BrowserAgentSession_platform_idx" ON "BrowserAgentSession"("platform");

-- CreateIndex
CREATE INDEX "BrowserAgentSession_status_idx" ON "BrowserAgentSession"("status");

-- CreateIndex
CREATE INDEX "BrowserAgentSession_scanRunId_idx" ON "BrowserAgentSession"("scanRunId");

-- CreateIndex
CREATE INDEX "BrowserEvidence_ticker_platform_idx" ON "BrowserEvidence"("ticker", "platform");

-- CreateIndex
CREATE INDEX "BrowserEvidence_sessionId_idx" ON "BrowserEvidence"("sessionId");

-- CreateIndex
CREATE INDEX "BrowserEvidence_promotionScore_idx" ON "BrowserEvidence"("promotionScore");

-- CreateIndex
CREATE INDEX "BrowserEvidence_author_idx" ON "BrowserEvidence"("author");

-- CreateIndex
CREATE INDEX "RateLimitEntry_expiresAt_idx" ON "RateLimitEntry"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitEntry_identifier_tier_key" ON "RateLimitEntry"("identifier", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserPlatformConfig_platform_key" ON "BrowserPlatformConfig"("platform");

-- CreateIndex
CREATE INDEX "BrowserPlatformConfig_isEnabled_idx" ON "BrowserPlatformConfig"("isEnabled");

-- CreateIndex
CREATE INDEX "Promoter_displayName_idx" ON "Promoter"("displayName");

-- CreateIndex
CREATE INDEX "Promoter_repeatOffenderScore_idx" ON "Promoter"("repeatOffenderScore");

-- CreateIndex
CREATE INDEX "Promoter_riskLevel_idx" ON "Promoter"("riskLevel");

-- CreateIndex
CREATE INDEX "Promoter_isActive_idx" ON "Promoter"("isActive");

-- CreateIndex
CREATE INDEX "Promoter_networkId_idx" ON "Promoter"("networkId");

-- CreateIndex
CREATE INDEX "PromoterIdentity_promoterId_idx" ON "PromoterIdentity"("promoterId");

-- CreateIndex
CREATE INDEX "PromoterIdentity_platform_idx" ON "PromoterIdentity"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterIdentity_platform_username_key" ON "PromoterIdentity"("platform", "username");

-- CreateIndex
CREATE INDEX "PromoterStockLink_ticker_idx" ON "PromoterStockLink"("ticker");

-- CreateIndex
CREATE INDEX "PromoterStockLink_promoterId_idx" ON "PromoterStockLink"("promoterId");

-- CreateIndex
CREATE INDEX "PromoterStockLink_schemeId_idx" ON "PromoterStockLink"("schemeId");

-- CreateIndex
CREATE INDEX "PromoterStockLink_firstPromotionDate_idx" ON "PromoterStockLink"("firstPromotionDate");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterStockLink_promoterId_ticker_key" ON "PromoterStockLink"("promoterId", "ticker");

-- CreateIndex
CREATE INDEX "PromoterNetwork_isActive_idx" ON "PromoterNetwork"("isActive");

-- CreateIndex
CREATE INDEX "PromoterNetwork_confidenceScore_idx" ON "PromoterNetwork"("confidenceScore");

-- CreateIndex
CREATE INDEX "PromoterNetwork_dumpRate_idx" ON "PromoterNetwork"("dumpRate");

-- CreateIndex
CREATE INDEX "pre_pump_watchlist_isActive_ticker_idx" ON "pre_pump_watchlist"("isActive", "ticker");

-- CreateIndex
CREATE INDEX "pre_pump_watchlist_addedDate_idx" ON "pre_pump_watchlist"("addedDate");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanUsage" ADD CONSTRAINT "ScanUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDailySnapshot" ADD CONSTRAINT "StockDailySnapshot_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRiskAlert" ADD CONSTRAINT "StockRiskAlert_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanMessage" ADD CONSTRAINT "ScanMessage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ScanMessageGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketResponse" ADD CONSTRAINT "SupportTicketResponse_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMention" ADD CONSTRAINT "SocialMention_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "SocialScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserEvidence" ADD CONSTRAINT "BrowserEvidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserAgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promoter" ADD CONSTRAINT "Promoter_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "PromoterNetwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterIdentity" ADD CONSTRAINT "PromoterIdentity_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterStockLink" ADD CONSTRAINT "PromoterStockLink_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

