/**
 * Admin Scan Messages API - CRUD operations for scan messages
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

// GET - List all active scan messages
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messages = await prisma.scanMessage.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });

    // Get the last generation date
    let lastGeneration = null;
    try {
      lastGeneration = await prisma.scanMessageGeneration.findFirst({
        orderBy: { createdAt: "desc" },
      });
    } catch {
      // Table might not exist yet, ignore
    }

    // Calculate days since last regeneration
    const daysSinceRegeneration = lastGeneration
      ? Math.floor(
          (Date.now() - lastGeneration.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      : null;

    return NextResponse.json({
      messages,
      lastGenerationDate: lastGeneration?.createdAt || null,
      daysSinceRegeneration,
      totalCount: messages.length,
    });
  } catch (error) {
    console.error("Get scan messages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan messages" },
      { status: 500 }
    );
  }
}

// POST - Create a new scan message manually
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { headline, subtext } = body;

    if (!headline || !subtext) {
      return NextResponse.json(
        { error: "Headline and subtext are required" },
        { status: 400 }
      );
    }

    // Get current max order
    const maxOrderMessage = await prisma.scanMessage.findFirst({
      where: { isActive: true },
      orderBy: { order: "desc" },
    });
    const newOrder = (maxOrderMessage?.order ?? -1) + 1;

    const message = await prisma.scanMessage.create({
      data: {
        headline,
        subtext,
        order: newOrder,
        isActive: true,
      },
    });

    // Log the action (non-critical)
    prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGE_CREATED",
        resource: message.id,
        details: JSON.stringify({ headline, subtext }),
      },
    }).catch(() => {});

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Create scan message error:", error);
    return NextResponse.json(
      { error: "Failed to create scan message" },
      { status: 500 }
    );
  }
}

// PUT - Update a scan message
export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, headline, subtext } = body;

    if (!id) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    const message = await prisma.scanMessage.update({
      where: { id },
      data: {
        ...(headline && { headline }),
        ...(subtext && { subtext }),
      },
    });

    // Log the action (non-critical)
    prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGE_UPDATED",
        resource: message.id,
        details: JSON.stringify({ headline, subtext }),
      },
    }).catch(() => {});

    return NextResponse.json(message);
  } catch (error) {
    console.error("Update scan message error:", error);
    return NextResponse.json(
      { error: "Failed to update scan message" },
      { status: 500 }
    );
  }
}

// DELETE - Archive a scan message
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    const message = await prisma.scanMessage.findUnique({
      where: { id },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Archive the message to history (non-critical)
    try {
      await prisma.scanMessageHistory.create({
        data: {
          headline: message.headline,
          subtext: message.subtext,
          archiveReason: "MANUAL_REMOVE",
          originalCreatedAt: message.createdAt,
          ...(message.generationId ? { generationId: message.generationId } : {}),
        },
      });
    } catch {
      // History archiving is non-critical
    }

    // Delete the active message
    await prisma.scanMessage.delete({
      where: { id },
    });

    // Reorder remaining messages
    const remainingMessages = await prisma.scanMessage.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });

    for (let i = 0; i < remainingMessages.length; i++) {
      await prisma.scanMessage.update({
        where: { id: remainingMessages[i].id },
        data: { order: i },
      });
    }

    // Log the action (non-critical)
    prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGE_DELETED",
        resource: id,
        details: JSON.stringify({ headline: message.headline }),
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete scan message error:", error);
    return NextResponse.json(
      { error: "Failed to delete scan message" },
      { status: 500 }
    );
  }
}
