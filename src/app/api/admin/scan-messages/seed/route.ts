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

    // Check if there are already messages in the database
    const existingCount = await prisma.scanMessage.count();

    if (existingCount > 0) {
      return NextResponse.json(
        {
          error: "Database already has messages. Clear them first if you want to reseed.",
          existingCount,
        },
        { status: 400 }
      );
    }

    // Create a generation record for the seed
    const generation = await prisma.scanMessageGeneration.create({
      data: {
        prompt: "Initial seed from static taglines file",
        model: "static",
        generatedCount: taglines.length,
        acceptedCount: taglines.length,
        createdBy: session.id,
      },
    });

    // Insert all default taglines
    const createdMessages = await Promise.all(
      taglines.map((tagline, index) =>
        prisma.scanMessage.create({
          data: {
            headline: tagline.headline,
            subtext: tagline.subtext,
            order: index,
            isActive: true,
            generationId: generation.id,
          },
        })
      )
    );

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGES_SEEDED",
        resource: generation.id,
        details: JSON.stringify({ count: createdMessages.length }),
      },
    });

    return NextResponse.json({
      success: true,
      count: createdMessages.length,
      message: `Seeded ${createdMessages.length} default messages`,
    });
  } catch (error) {
    console.error("Seed scan messages error:", error);
    return NextResponse.json(
      { error: "Failed to seed scan messages" },
      { status: 500 }
    );
  }
}
