/**
 * Admin Database Status API - Check if history tables exist and their status
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

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

    for (const sql of createStatements) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ statement: sql.substring(0, 50) + "...", success: true });
      } catch (e) {
        results.push({ statement: sql.substring(0, 50) + "...", success: false, error: String(e) });
      }
    }

    // Add foreign key constraints
    const fkStatements = [
      `ALTER TABLE "StockDailySnapshot" ADD CONSTRAINT IF NOT EXISTS "StockDailySnapshot_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "StockRiskAlert" ADD CONSTRAINT IF NOT EXISTS "StockRiskAlert_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "TrackedStock"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    ];

    for (const sql of fkStatements) {
      try {
        await prisma.$executeRawUnsafe(sql);
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
