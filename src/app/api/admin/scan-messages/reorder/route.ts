/**
 * Admin Scan Messages Reorder API
 * Handles drag-and-drop reordering of scan messages
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

// POST - Reorder messages
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messageIds } = body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { error: "messageIds array is required" },
        { status: 400 }
      );
    }

    // Update order for each message
    await prisma.$transaction(
      messageIds.map((id: string, index: number) =>
        prisma.scanMessage.update({
          where: { id },
          data: { order: index },
        })
      )
    );

    // Log the action (non-critical)
    prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGES_REORDERED",
        details: JSON.stringify({ newOrder: messageIds }),
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder scan messages error:", error);
    return NextResponse.json(
      { error: "Failed to reorder scan messages" },
      { status: 500 }
    );
  }
}
