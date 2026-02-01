/**
 * Admin Scan History API - Get recent scans for review
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const riskLevel = searchParams.get("riskLevel") || undefined;
    const ticker = searchParams.get("ticker") || undefined;

    const where: Record<string, unknown> = {};
    if (riskLevel) where.riskLevel = riskLevel;
    if (ticker) where.ticker = { contains: ticker, mode: "insensitive" };

    const [scans, total] = await Promise.all([
      prisma.scanHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scanHistory.count({ where }),
    ]);

    return NextResponse.json({
      scans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get scans error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scans" },
      { status: 500 }
    );
  }
}
