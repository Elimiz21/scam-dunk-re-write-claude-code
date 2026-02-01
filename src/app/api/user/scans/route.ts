import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Support both session (web) and JWT (mobile) auth
    let userId: string | null = null;

    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get pagination params from query
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    // Fetch scans with pagination
    const [scans, total] = await Promise.all([
      prisma.scanHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          ticker: true,
          assetType: true,
          riskLevel: true,
          totalScore: true,
          createdAt: true,
        },
      }),
      prisma.scanHistory.count({ where: { userId } }),
    ]);

    // Map to mobile-friendly format
    const history = scans.map((scan) => ({
      id: scan.id,
      ticker: scan.ticker,
      companyName: scan.ticker, // Will be populated from scan details
      riskScore: scan.totalScore,
      riskLevel: scan.riskLevel,
      analyzedAt: scan.createdAt.toISOString(),
    }));

    return NextResponse.json({
      history,
      scans, // Keep for backwards compatibility
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error("Fetch scans error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan history" },
      { status: 500 }
    );
  }
}
