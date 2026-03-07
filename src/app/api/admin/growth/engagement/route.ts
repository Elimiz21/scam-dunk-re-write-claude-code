/**
 * Growth Engagement API
 * GET - Fetch engagement history and trending posts
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const trendingOnly = searchParams.get("trending") === "true";
    const needsFollowUp = searchParams.get("followUp") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: any = {};
    if (trendingOnly) where.isTrending = true;
    if (needsFollowUp) where.needsFollowUp = true;

    const engagements = await prisma.growthEngagement.findMany({
      where,
      include: {
        draft: {
          include: {
            opportunity: {
              select: {
                id: true,
                platform: true,
                source: true,
                postUrl: true,
                postTitle: true,
                overallScore: true,
              },
            },
          },
        },
      },
      orderBy: { checkedAt: "desc" },
      take: limit,
    });

    // Summary stats
    const postedDrafts = await prisma.growthDraft.count({
      where: { status: "posted" },
    });

    const trendingCount = await prisma.growthEngagement.count({
      where: { isTrending: true },
    });

    const followUpCount = await prisma.growthEngagement.count({
      where: { needsFollowUp: true },
    });

    return NextResponse.json({
      engagements,
      stats: {
        totalPosted: postedDrafts,
        trending: trendingCount,
        needsFollowUp: followUpCount,
      },
    });
  } catch (error: any) {
    console.error("[Growth Engagement API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
