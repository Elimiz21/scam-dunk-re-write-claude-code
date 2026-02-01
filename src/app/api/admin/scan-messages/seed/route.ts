/**
 * Admin Scan Messages Seed API
 * Seeds the database with default taglines from the static file
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { taglines } from "@/lib/taglines";

// POST - Seed database with default taglines
export async function POST() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get existing messages to avoid duplicates
    const existingMessages = await prisma.scanMessage.findMany({
      where: { isActive: true },
      select: { headline: true, subtext: true },
    });
    const existingKeys = new Set(
      existingMessages.map((m) => `${m.headline}|||${m.subtext}`)
    );

    // Filter out taglines that already exist
    const newTaglines = taglines.filter(
      (t) => !existingKeys.has(`${t.headline}|||${t.subtext}`)
    );

    if (newTaglines.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "All default messages already exist",
        skipped: taglines.length,
      });
    }

    // Create a generation record for the seed
    let generationId: string | null = null;
    try {
      const generation = await prisma.scanMessageGeneration.create({
        data: {
          prompt: "Initial seed from static taglines file",
          model: "static",
          generatedCount: newTaglines.length,
          acceptedCount: newTaglines.length,
          createdBy: session.id,
        },
      });
      generationId = generation.id;
    } catch {
      // Generation table might have issues, continue without linking
    }

    // Get current max order
    const maxOrderMsg = await prisma.scanMessage.findFirst({
      where: { isActive: true },
      orderBy: { order: "desc" },
    });
    let nextOrder = (maxOrderMsg?.order ?? -1) + 1;

    // Insert only new taglines
    const createdMessages = await Promise.all(
      newTaglines.map((tagline) =>
        prisma.scanMessage.create({
          data: {
            headline: tagline.headline,
            subtext: tagline.subtext,
            order: nextOrder++,
            isActive: true,
            ...(generationId ? { generationId } : {}),
          },
        })
      )
    );

    // Log the action
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "SCAN_MESSAGES_SEEDED",
          details: JSON.stringify({ count: createdMessages.length }),
        },
      });
    } catch {
      // Audit log is non-critical
    }

    const skippedCount = taglines.length - newTaglines.length;
    return NextResponse.json({
      success: true,
      count: createdMessages.length,
      skipped: skippedCount,
      message: `Seeded ${createdMessages.length} default messages${skippedCount > 0 ? ` (${skippedCount} already existed)` : ""}`,
    });
  } catch (error) {
    console.error("Seed scan messages error:", error);
    return NextResponse.json(
      { error: "Failed to seed scan messages" },
      { status: 500 }
    );
  }
}
