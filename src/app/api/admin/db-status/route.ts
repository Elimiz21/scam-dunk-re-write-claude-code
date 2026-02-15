/**
 * Admin Database Status API - Check if history tables exist and their status
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tables: Record<string, { exists: boolean; count?: number; error?: string }> = {};

    // Check TrackedStock table
    try {
      const count = await prisma.trackedStock.count();
      tables.TrackedStock = { exists: true, count };
    } catch (e) {
      tables.TrackedStock = { exists: false, error: String(e) };
    }

    // Check StockDailySnapshot table
    try {
      const count = await prisma.stockDailySnapshot.count();
      tables.StockDailySnapshot = { exists: true, count };
    } catch (e) {
      tables.StockDailySnapshot = { exists: false, error: String(e) };
    }

    // Check DailyScanSummary table
    try {
      const count = await prisma.dailyScanSummary.count();
      tables.DailyScanSummary = { exists: true, count };
    } catch (e) {
      tables.DailyScanSummary = { exists: false, error: String(e) };
    }

    // Check StockRiskAlert table
    try {
      const count = await prisma.stockRiskAlert.count();
      tables.StockRiskAlert = { exists: true, count };
    } catch (e) {
      tables.StockRiskAlert = { exists: false, error: String(e) };
    }

    // Check PromotedStock table
    try {
      const count = await prisma.promotedStock.count();
      tables.PromotedStock = { exists: true, count };
    } catch (e) {
      tables.PromotedStock = { exists: false, error: String(e) };
    }

    // Check SocialScanRun table
    try {
      const count = await prisma.socialScanRun.count();
      tables.SocialScanRun = { exists: true, count };
    } catch (e) {
      tables.SocialScanRun = { exists: false, error: String(e) };
    }

    // Check SocialMention table
    try {
      const count = await prisma.socialMention.count();
      tables.SocialMention = { exists: true, count };
    } catch (e) {
      tables.SocialMention = { exists: false, error: String(e) };
    }

    // Check BrowserAgentSession table
    try {
      const count = await prisma.browserAgentSession.count();
      tables.BrowserAgentSession = { exists: true, count };
    } catch (e) {
      tables.BrowserAgentSession = { exists: false, error: String(e) };
    }

    // Check BrowserEvidence table
    try {
      const count = await prisma.browserEvidence.count();
      tables.BrowserEvidence = { exists: true, count };
    } catch (e) {
      tables.BrowserEvidence = { exists: false, error: String(e) };
    }

    // Check BrowserPlatformConfig table
    try {
      const count = await prisma.browserPlatformConfig.count();
      tables.BrowserPlatformConfig = { exists: true, count };
    } catch (e) {
      tables.BrowserPlatformConfig = { exists: false, error: String(e) };
    }

    const allExist = Object.values(tables).every((t) => t.exists);
    const hasData = Object.values(tables).some((t) => t.exists && (t.count || 0) > 0);

    return NextResponse.json({
      status: allExist ? (hasData ? "ready" : "empty") : "missing_tables",
      tables,
      message: !allExist
        ? "Some tables are missing. Run 'npx prisma db push' to create them."
        : hasData
        ? "Database is ready with data."
        : "Tables exist but no data. Use Data Ingestion to import evaluation data.",
    });
  } catch (error) {
    console.error("DB status error:", error);
    return NextResponse.json(
      { error: "Failed to check database status", details: String(error) },
      { status: 500 }
    );
  }
}

// POST to attempt table creation via raw SQL (fallback)
export async function POST() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to create tables using raw SQL if they don't exist
    // This is a fallback - prisma db push is preferred
    const createStatements = [
      `CREATE TABLE IF NOT EXISTS "TrackedStock" (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "TrackedStock_symbol_key" ON "TrackedStock"("symbol")`,
      `CREATE INDEX IF NOT EXISTS "TrackedStock_exchange_idx" ON "TrackedStock"("exchange")`,
      `CREATE INDEX IF NOT EXISTS "TrackedStock_sector_idx" ON "TrackedStock"("sector")`,

      `CREATE TABLE IF NOT EXISTS "StockDailySnapshot" (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "StockDailySnapshot_stockId_scanDate_key" ON "StockDailySnapshot"("stockId", "scanDate")`,
      `CREATE INDEX IF NOT EXISTS "StockDailySnapshot_scanDate_idx" ON "StockDailySnapshot"("scanDate")`,
      `CREATE INDEX IF NOT EXISTS "StockDailySnapshot_riskLevel_idx" ON "StockDailySnapshot"("riskLevel")`,
      `CREATE INDEX IF NOT EXISTS "StockDailySnapshot_riskLevel_scanDate_idx" ON "StockDailySnapshot"("riskLevel", "scanDate")`,

      `CREATE TABLE IF NOT EXISTS "DailyScanSummary" (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "DailyScanSummary_scanDate_key" ON "DailyScanSummary"("scanDate")`,
      `CREATE INDEX IF NOT EXISTS "DailyScanSummary_scanDate_idx" ON "DailyScanSummary"("scanDate")`,

      `CREATE TABLE IF NOT EXISTS "StockRiskAlert" (
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
      )`,
      `CREATE INDEX IF NOT EXISTS "StockRiskAlert_alertDate_idx" ON "StockRiskAlert"("alertDate")`,
      `CREATE INDEX IF NOT EXISTS "StockRiskAlert_alertType_idx" ON "StockRiskAlert"("alertType")`,
      `CREATE INDEX IF NOT EXISTS "StockRiskAlert_stockId_alertDate_idx" ON "StockRiskAlert"("stockId", "alertDate")`,

      `CREATE TABLE IF NOT EXISTS "PromotedStock" (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "PromotedStock_symbol_addedDate_key" ON "PromotedStock"("symbol", "addedDate")`,
      `CREATE INDEX IF NOT EXISTS "PromotedStock_promoterName_idx" ON "PromotedStock"("promoterName")`,
      `CREATE INDEX IF NOT EXISTS "PromotedStock_isActive_idx" ON "PromotedStock"("isActive")`,
    ];

    const results: { statement: string; success: boolean; error?: string }[] = [];

    // Note: these are hardcoded DDL statements (no user input); Prisma.raw() is used
    // instead of $executeRawUnsafe to avoid the "unsafe" API pattern in the codebase.
    for (const sql of createStatements) {
      try {
        await prisma.$executeRaw(Prisma.raw(sql));
        results.push({ statement: sql.substring(0, 50) + "...", success: true });
      } catch (e) {
        results.push({ statement: sql.substring(0, 50) + "...", success: false, error: String(e) });
      }
    }

    // Social Scan tables
    const socialScanStatements = [
      `CREATE TABLE IF NOT EXISTS "SocialScanRun" (
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
      )`,
      `CREATE INDEX IF NOT EXISTS "SocialScanRun_scanDate_idx" ON "SocialScanRun"("scanDate")`,
      `CREATE INDEX IF NOT EXISTS "SocialScanRun_status_idx" ON "SocialScanRun"("status")`,

      `CREATE TABLE IF NOT EXISTS "SocialMention" (
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
      )`,
      `CREATE INDEX IF NOT EXISTS "SocialMention_ticker_platform_idx" ON "SocialMention"("ticker", "platform")`,
      `CREATE INDEX IF NOT EXISTS "SocialMention_scanRunId_idx" ON "SocialMention"("scanRunId")`,
      `CREATE INDEX IF NOT EXISTS "SocialMention_createdAt_idx" ON "SocialMention"("createdAt")`,
      `CREATE INDEX IF NOT EXISTS "SocialMention_ticker_createdAt_idx" ON "SocialMention"("ticker", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "SocialMention_isPromotional_idx" ON "SocialMention"("isPromotional")`,
    ];

    // Browser Agent tables
    const browserAgentStatements = [
      `CREATE TABLE IF NOT EXISTS "BrowserAgentSession" (
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
      )`,
      `CREATE INDEX IF NOT EXISTS "BrowserAgentSession_scanDate_idx" ON "BrowserAgentSession"("scanDate")`,
      `CREATE INDEX IF NOT EXISTS "BrowserAgentSession_platform_idx" ON "BrowserAgentSession"("platform")`,
      `CREATE INDEX IF NOT EXISTS "BrowserAgentSession_status_idx" ON "BrowserAgentSession"("status")`,
      `CREATE INDEX IF NOT EXISTS "BrowserAgentSession_scanRunId_idx" ON "BrowserAgentSession"("scanRunId")`,

      `CREATE TABLE IF NOT EXISTS "BrowserEvidence" (
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
      )`,
      `CREATE INDEX IF NOT EXISTS "BrowserEvidence_ticker_platform_idx" ON "BrowserEvidence"("ticker", "platform")`,
      `CREATE INDEX IF NOT EXISTS "BrowserEvidence_sessionId_idx" ON "BrowserEvidence"("sessionId")`,
      `CREATE INDEX IF NOT EXISTS "BrowserEvidence_promotionScore_idx" ON "BrowserEvidence"("promotionScore")`,
      `CREATE INDEX IF NOT EXISTS "BrowserEvidence_author_idx" ON "BrowserEvidence"("author")`,

      `CREATE TABLE IF NOT EXISTS "BrowserPlatformConfig" (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "BrowserPlatformConfig_platform_key" ON "BrowserPlatformConfig"("platform")`,
      `CREATE INDEX IF NOT EXISTS "BrowserPlatformConfig_isEnabled_idx" ON "BrowserPlatformConfig"("isEnabled")`,
    ];

    // Promoter Matrix tables (PromoterNetwork first since Promoter references it)
    const promoterStatements = [
      `CREATE TABLE IF NOT EXISTS "PromoterNetwork" (
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
      )`,
      `CREATE INDEX IF NOT EXISTS "PromoterNetwork_isActive_idx" ON "PromoterNetwork"("isActive")`,
      `CREATE INDEX IF NOT EXISTS "PromoterNetwork_confidenceScore_idx" ON "PromoterNetwork"("confidenceScore")`,
      `CREATE INDEX IF NOT EXISTS "PromoterNetwork_dumpRate_idx" ON "PromoterNetwork"("dumpRate")`,

      `CREATE TABLE IF NOT EXISTS "Promoter" (
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
      )`,
      `CREATE INDEX IF NOT EXISTS "Promoter_displayName_idx" ON "Promoter"("displayName")`,
      `CREATE INDEX IF NOT EXISTS "Promoter_repeatOffenderScore_idx" ON "Promoter"("repeatOffenderScore")`,
      `CREATE INDEX IF NOT EXISTS "Promoter_riskLevel_idx" ON "Promoter"("riskLevel")`,
      `CREATE INDEX IF NOT EXISTS "Promoter_isActive_idx" ON "Promoter"("isActive")`,
      `CREATE INDEX IF NOT EXISTS "Promoter_networkId_idx" ON "Promoter"("networkId")`,

      `CREATE TABLE IF NOT EXISTS "PromoterIdentity" (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "PromoterIdentity_platform_username_key" ON "PromoterIdentity"("platform", "username")`,
      `CREATE INDEX IF NOT EXISTS "PromoterIdentity_promoterId_idx" ON "PromoterIdentity"("promoterId")`,
      `CREATE INDEX IF NOT EXISTS "PromoterIdentity_platform_idx" ON "PromoterIdentity"("platform")`,

      `CREATE TABLE IF NOT EXISTS "PromoterStockLink" (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "PromoterStockLink_promoterId_ticker_key" ON "PromoterStockLink"("promoterId", "ticker")`,
      `CREATE INDEX IF NOT EXISTS "PromoterStockLink_ticker_idx" ON "PromoterStockLink"("ticker")`,
      `CREATE INDEX IF NOT EXISTS "PromoterStockLink_promoterId_idx" ON "PromoterStockLink"("promoterId")`,
      `CREATE INDEX IF NOT EXISTS "PromoterStockLink_schemeId_idx" ON "PromoterStockLink"("schemeId")`,
      `CREATE INDEX IF NOT EXISTS "PromoterStockLink_firstPromotionDate_idx" ON "PromoterStockLink"("firstPromotionDate")`,
    ];

    // Homepage Hero table
    const homepageStatements = [
      `CREATE TABLE IF NOT EXISTS "HomepageHero" (
        "id" TEXT NOT NULL,
        "headline" TEXT NOT NULL,
        "subheadline" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT,
        CONSTRAINT "HomepageHero_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX IF NOT EXISTS "HomepageHero_isActive_idx" ON "HomepageHero"("isActive")`,
      `CREATE INDEX IF NOT EXISTS "HomepageHero_createdAt_idx" ON "HomepageHero"("createdAt")`,
    ];

    // Run all statement groups
    for (const sql of [...socialScanStatements, ...browserAgentStatements, ...promoterStatements, ...homepageStatements]) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ statement: sql.substring(0, 60) + "...", success: true });
      } catch (e) {
        results.push({ statement: sql.substring(0, 60) + "...", success: false, error: String(e) });
      }
    }

    // Add foreign key constraints
    const fkStatements = [
      `ALTER TABLE "StockDailySnapshot" ADD CONSTRAINT IF NOT EXISTS "StockDailySnapshot_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "StockRiskAlert" ADD CONSTRAINT IF NOT EXISTS "StockRiskAlert_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `DO $$ BEGIN ALTER TABLE "SocialMention" ADD CONSTRAINT "SocialMention_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "SocialScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN ALTER TABLE "BrowserEvidence" ADD CONSTRAINT "BrowserEvidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserAgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN ALTER TABLE "Promoter" ADD CONSTRAINT "Promoter_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "PromoterNetwork"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN ALTER TABLE "PromoterIdentity" ADD CONSTRAINT "PromoterIdentity_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN ALTER TABLE "PromoterStockLink" ADD CONSTRAINT "PromoterStockLink_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    ];

    for (const sql of fkStatements) {
      try {
        await prisma.$executeRaw(Prisma.raw(sql));
        results.push({ statement: sql.substring(0, 50) + "...", success: true });
      } catch (e) {
        // FK might already exist, that's OK
        results.push({ statement: sql.substring(0, 50) + "...", success: false, error: String(e) });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Table creation attempted. Check GET /api/admin/db-status for current status.",
      results,
    });
  } catch (error) {
    console.error("DB setup error:", error);
    return NextResponse.json(
      { error: "Failed to create tables", details: String(error) },
      { status: 500 }
    );
  }
}
