/**
 * Admin Scan Messages History API
 * Get archived/historical scan messages
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

// GET - List historical scan messages
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const [messages, totalCount] = await Promise.all([
      prisma.scanMessageHistory.findMany({
        orderBy: { archivedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.scanMessageHistory.count(),
    ]);

    return NextResponse.json({
      messages,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("Get scan message history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan message history" },
      { status: 500 }
    );
  }
}

// POST - Restore a message from history
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { historyId } = body;

    if (!historyId) {
      return NextResponse.json(
        { error: "historyId is required" },
        { status: 400 }
      );
    }

    const historyMessage = await prisma.scanMessageHistory.findUnique({
      where: { id: historyId },
    });

    if (!historyMessage) {
      return NextResponse.json(
        { error: "History message not found" },
        { status: 404 }
      );
    }

    // Get current max order
    const maxOrderMessage = await prisma.scanMessage.findFirst({
      where: { isActive: true },
      orderBy: { order: "desc" },
    });
    const newOrder = (maxOrderMessage?.order ?? -1) + 1;

    // Create new active message
    const restoredMessage = await prisma.scanMessage.create({
      data: {
        headline: historyMessage.headline,
        subtext: historyMessage.subtext,
        order: newOrder,
        isActive: true,
        generationId: historyMessage.generationId,
      },
    });

    // Remove from history
    await prisma.scanMessageHistory.delete({
      where: { id: historyId },
    });

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGE_RESTORED",
        resource: restoredMessage.id,
        details: JSON.stringify({ headline: restoredMessage.headline }),
      },
    });

    return NextResponse.json(restoredMessage);
  } catch (error) {
    console.error("Restore scan message error:", error);
    return NextResponse.json(
      { error: "Failed to restore scan message" },
      { status: 500 }
    );
  }
}
