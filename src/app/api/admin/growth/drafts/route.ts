/**
 * Growth Drafts API
 * PATCH - Approve, skip, edit, or mark a draft as posted
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { draftId, action, editedText, postedUrl } = body;

    if (!draftId || !action) {
      return NextResponse.json(
        { error: "draftId and action are required" },
        { status: 400 }
      );
    }

    const draft = await prisma.growthDraft.findUnique({
      where: { id: draftId },
      include: { opportunity: true },
    });

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    switch (action) {
      case "approve": {
        // Mark draft as approved (for X: will be auto-posted)
        await prisma.growthDraft.update({
          where: { id: draftId },
          data: { status: "approved" },
        });
        await prisma.growthOpportunity.update({
          where: { id: draft.opportunityId },
          data: { status: "approved" },
        });
        return NextResponse.json({ success: true, status: "approved" });
      }

      case "posted": {
        // Mark as posted (after user copies to Reddit or X auto-posts)
        await prisma.growthDraft.update({
          where: { id: draftId },
          data: {
            status: "posted",
            postedAt: new Date(),
            postedUrl: postedUrl || null,
          },
        });
        await prisma.growthOpportunity.update({
          where: { id: draft.opportunityId },
          data: { status: "posted" },
        });
        return NextResponse.json({ success: true, status: "posted" });
      }

      case "edit": {
        if (!editedText) {
          return NextResponse.json(
            { error: "editedText is required for edit action" },
            { status: 400 }
          );
        }
        await prisma.growthDraft.update({
          where: { id: draftId },
          data: { status: "edited", editedText },
        });
        return NextResponse.json({ success: true, status: "edited" });
      }

      case "skip": {
        await prisma.growthDraft.update({
          where: { id: draftId },
          data: { status: "skipped" },
        });
        await prisma.growthOpportunity.update({
          where: { id: draft.opportunityId },
          data: { status: "skipped" },
        });
        return NextResponse.json({ success: true, status: "skipped" });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[Growth Drafts API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
