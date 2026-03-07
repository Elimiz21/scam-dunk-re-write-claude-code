/**
 * Growth Opportunities API
 * GET - List opportunities with filters
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
    const status = searchParams.get("status") || "draft_ready";
    const platform = searchParams.get("platform");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: any = { status };
    if (platform) where.platform = platform;

    const [opportunities, total] = await Promise.all([
      prisma.growthOpportunity.findMany({
        where,
        include: {
          drafts: {
            where: { status: { in: ["pending", "edited"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { overallScore: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.growthOpportunity.count({ where }),
    ]);

    // Stats
    const stats = await prisma.growthOpportunity.groupBy({
      by: ["status"],
      _count: true,
    });

    return NextResponse.json({
      opportunities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: stats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
    });
  } catch (error: any) {
    console.error("[Growth API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
