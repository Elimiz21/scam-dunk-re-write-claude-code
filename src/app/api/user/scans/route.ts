import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get limit from query params (default 10, max 50)
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "10", 10), 1), 50);

    // Fetch recent scans for this user
    const scans = await prisma.scanHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        ticker: true,
        assetType: true,
        riskLevel: true,
        totalScore: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ scans });
  } catch (error) {
    console.error("Fetch scans error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan history" },
      { status: 500 }
    );
  }
}
