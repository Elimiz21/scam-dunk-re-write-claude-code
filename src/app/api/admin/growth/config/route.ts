/**
 * Growth Config API
 * GET - Fetch current growth engine configuration
 * PUT - Update growth engine configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_CONFIG = {
  redditSubreddits: [
    "Scams", "stocks", "investing", "wallstreetbets", "pennystocks",
    "StockMarket", "personalfinance", "SecurityAnalysis", "InvestmentFraud",
    "pumpanddump",
  ],
  redditSearchTerms: [
    "is this a scam stock", "got scammed investing", "pump and dump",
    "stock due diligence", "how to check if stock is legit",
    "investment fraud", "penny stock scam", "stock promotion scam",
  ],
  xSearchTerms: [
    "stock scam", "pump and dump stock", "is this stock legit",
    "investment scam warning", "got scammed trading",
  ],
  xHashtags: [
    "#stockscam", "#pumpanddump", "#investmentfraud",
    "#scamalert", "#duediligence",
  ],
  discoveryIntervalHours: 4,
  monitoringIntervalHours: 12,
  maxDailyDiscoveries: 30,
  maxDailyPosts: 10,
  autoPostX: false,
  discoveryEnabled: true,
  draftingEnabled: true,
  monitoringEnabled: true,
};

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let config = await prisma.growthConfig.findUnique({
      where: { id: "singleton" },
    });

    if (!config) {
      config = await prisma.growthConfig.create({
        data: { id: "singleton", ...DEFAULT_CONFIG },
      });
    }

    return NextResponse.json({ config });
  } catch (error: any) {
    console.error("[Growth Config API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Only allow updating known fields
    const allowedFields = [
      "redditSubreddits", "redditSearchTerms", "xSearchTerms", "xHashtags",
      "discoveryIntervalHours", "monitoringIntervalHours",
      "maxDailyDiscoveries", "maxDailyPosts",
      "autoPostX", "discoveryEnabled", "draftingEnabled", "monitoringEnabled",
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    const config = await prisma.growthConfig.upsert({
      where: { id: "singleton" },
      update: updateData,
      create: { id: "singleton", ...DEFAULT_CONFIG, ...updateData },
    });

    return NextResponse.json({ config });
  } catch (error: any) {
    console.error("[Growth Config API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
