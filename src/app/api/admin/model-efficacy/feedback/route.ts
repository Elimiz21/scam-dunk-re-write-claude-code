/**
 * Admin Model Feedback API - Mark false positives/negatives
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const feedbackSchema = z.object({
  scanId: z.string(),
  feedbackType: z.enum(["FALSE_POSITIVE", "FALSE_NEGATIVE", "CORRECT"]),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasRole(session, ["OWNER", "ADMIN"])) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const validation = feedbackSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { scanId, feedbackType } = validation.data;

    // Get the scan to find its date
    const scan = await prisma.scanHistory.findUnique({
      where: { id: scanId },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const dateKey = scan.createdAt.toISOString().split("T")[0];

    // Update daily metrics
    if (feedbackType === "FALSE_POSITIVE") {
      await prisma.modelMetrics.updateMany({
        where: { dateKey },
        data: { falsePositives: { increment: 1 } },
      });
    } else if (feedbackType === "FALSE_NEGATIVE") {
      await prisma.modelMetrics.updateMany({
        where: { dateKey },
        data: { falseNegatives: { increment: 1 } },
      });
    }

    // Log the feedback
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "MODEL_FEEDBACK",
        resource: scanId,
        details: JSON.stringify(validation.data),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Model feedback error:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}
