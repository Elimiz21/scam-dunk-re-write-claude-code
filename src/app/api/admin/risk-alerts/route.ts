/**
 * Admin Risk Alerts API - Get and manage risk alerts
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "7");
    const type = searchParams.get("type");
    const acknowledged = searchParams.get("acknowledged");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const whereClause: {
      alertDate: { gte: Date };
      alertType?: string;
      isAcknowledged?: boolean;
    } = {
      alertDate: { gte: startDate },
    };

    if (type) {
      whereClause.alertType = type;
    }

    if (acknowledged !== null && acknowledged !== undefined) {
      whereClause.isAcknowledged = acknowledged === "true";
    }

    const alerts = await prisma.stockRiskAlert.findMany({
      where: whereClause,
      include: {
        stock: true,
      },
      orderBy: { alertDate: "desc" },
      take: 100,
    });

    // Get alert counts by type
    const alertCounts = await prisma.stockRiskAlert.groupBy({
      by: ["alertType"],
      where: { alertDate: { gte: startDate } },
      _count: true,
    });

    const countsByType = alertCounts.reduce((acc, curr) => {
      acc[curr.alertType] = curr._count;
      return acc;
    }, {} as Record<string, number>);

    // Get unacknowledged count
    const unacknowledgedCount = await prisma.stockRiskAlert.count({
      where: {
        alertDate: { gte: startDate },
        isAcknowledged: false,
      },
    });

    return NextResponse.json({
      alerts: alerts.map((a) => ({
        id: a.id,
        symbol: a.stock.symbol,
        stockName: a.stock.name,
        alertType: a.alertType,
        alertDate: a.alertDate,
        previousRiskLevel: a.previousRiskLevel,
        newRiskLevel: a.newRiskLevel,
        previousScore: a.previousScore,
        newScore: a.newScore,
        priceAtAlert: a.priceAtAlert,
        triggeringSignals: a.triggeringSignals,
        isAcknowledged: a.isAcknowledged,
        notes: a.notes,
      })),
      countsByType,
      unacknowledgedCount,
      totalCount: alerts.length,
    });
  } catch (error) {
    console.error("Risk alerts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch risk alerts" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { alertId, isAcknowledged, notes } = body;

    if (!alertId) {
      return NextResponse.json({ error: "Alert ID required" }, { status: 400 });
    }

    const updated = await prisma.stockRiskAlert.update({
      where: { id: alertId },
      data: {
        isAcknowledged: isAcknowledged ?? undefined,
        notes: notes ?? undefined,
      },
    });

    return NextResponse.json({ success: true, alert: updated });
  } catch (error) {
    console.error("Update alert error:", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 }
    );
  }
}
