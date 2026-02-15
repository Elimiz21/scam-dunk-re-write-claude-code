/**
 * Admin Single User API - Get detailed user information
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        scanUsages: {
          orderBy: { monthKey: "desc" },
          take: 12, // Last 12 months
        },
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get scan history for this user
    const scanHistory = await prisma.scanHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        ticker: true,
        riskLevel: true,
        totalScore: true,
        createdAt: true,
      },
    });

    // Calculate stats
    const totalScans = user.scanUsages.reduce((sum, u) => sum + u.scanCount, 0);
    const avgScansPerMonth = user.scanUsages.length > 0
      ? Math.round(totalScans / user.scanUsages.length)
      : 0;

    // Get current month usage
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthUsage = user.scanUsages.find((u) => u.monthKey === currentMonthKey);

    // Determine scan limit based on plan
    const scanLimit = user.plan === "PAID" ? 200 : 5;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        formerPro: user.formerPro,
        billingCustomerId: user.billingCustomerId,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        authProviders: user.accounts.map((a) => a.provider),
      },
      usage: {
        currentMonth: {
          monthKey: currentMonthKey,
          scansUsed: currentMonthUsage?.scanCount || 0,
          scanLimit,
          remaining: scanLimit - (currentMonthUsage?.scanCount || 0),
        },
        history: user.scanUsages,
        totalAllTime: totalScans,
        avgPerMonth: avgScansPerMonth,
      },
      recentScans: scanHistory,
    });
  } catch (error) {
    console.error("Get user details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user details" },
      { status: 500 }
    );
  }
}
