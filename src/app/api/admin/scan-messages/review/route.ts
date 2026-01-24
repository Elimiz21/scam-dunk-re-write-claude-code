/**
 * Admin Scan Messages Review API
 * Accept or reject generated messages with feedback
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

interface ReviewedMessage {
  headline: string;
  subtext: string;
  accepted: boolean;
  reason?: string; // Reason for rejection
}

// POST - Submit review of generated messages
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { generationId, messages, feedbackNotes } = body as {
      generationId: string;
      messages: ReviewedMessage[];
      feedbackNotes?: string;
    };

    if (!generationId || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "generationId and messages array are required" },
        { status: 400 }
      );
    }

    // Verify generation exists
    const generation = await prisma.scanMessageGeneration.findUnique({
      where: { id: generationId },
    });

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      );
    }

    const acceptedMessages = messages.filter((m) => m.accepted);
    const rejectedMessages = messages.filter((m) => !m.accepted);

    // Get current max order for new messages
    const maxOrderMessage = await prisma.scanMessage.findFirst({
      where: { isActive: true },
      orderBy: { order: "desc" },
    });
    let nextOrder = (maxOrderMessage?.order ?? -1) + 1;

    // Create accepted messages as active
    const createdMessages = [];
    for (const msg of acceptedMessages) {
      const created = await prisma.scanMessage.create({
        data: {
          headline: msg.headline,
          subtext: msg.subtext,
          order: nextOrder++,
          isActive: true,
        },
      });
      createdMessages.push(created);
    }

    // Archive rejected messages to history for future reference
    for (const msg of rejectedMessages) {
      try {
        await prisma.scanMessageHistory.create({
          data: {
            headline: msg.headline,
            subtext: msg.subtext,
            archiveReason: "DISCARDED",
            originalCreatedAt: generation.createdAt,
          },
        });
      } catch {
        // History is non-critical
      }
    }

    // Update generation record with feedback
    try {
      await prisma.scanMessageGeneration.update({
        where: { id: generationId },
        data: {
          acceptedCount: acceptedMessages.length,
          discardedCount: rejectedMessages.length,
          discardedMessages: JSON.stringify(
            rejectedMessages.map((m) => ({
              headline: m.headline,
              subtext: m.subtext,
              reason: m.reason || "Not specified",
            }))
          ),
          feedbackNotes: feedbackNotes || null,
        },
      });
    } catch {
      // Generation update is non-critical
    }

    // Log the action (non-critical)
    prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGES_REVIEWED",
        resource: generationId,
        details: JSON.stringify({
          accepted: acceptedMessages.length,
          rejected: rejectedMessages.length,
        }),
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      accepted: acceptedMessages.length,
      rejected: rejectedMessages.length,
      newMessages: createdMessages,
    });
  } catch (error) {
    console.error("Review scan messages error:", error);
    return NextResponse.json(
      { error: "Failed to review scan messages" },
      { status: 500 }
    );
  }
}
