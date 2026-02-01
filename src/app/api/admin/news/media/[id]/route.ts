import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const mention = await prisma.mediaMention.findUnique({
            where: { id },
        });

        if (!mention) {
            return NextResponse.json({ error: "Mention not found" }, { status: 404 });
        }

        return NextResponse.json({ mention });
    } catch (error) {
        console.error("Error fetching media mention:", error);
        return NextResponse.json(
            { error: "Failed to fetch media mention" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const body = await request.json();

        const existingMention = await prisma.mediaMention.findUnique({
            where: { id },
        });

        if (!existingMention) {
            return NextResponse.json({ error: "Mention not found" }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {};

        if (body.title !== undefined) updateData.title = body.title;
        if (body.source !== undefined) updateData.source = body.source;
        if (body.sourceType !== undefined) updateData.sourceType = body.sourceType;
        if (body.sourceUrl !== undefined) updateData.sourceUrl = body.sourceUrl;
        if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.quoteText !== undefined) updateData.quoteText = body.quoteText;
        if (body.mentionDate !== undefined) {
            updateData.mentionDate = body.mentionDate ? new Date(body.mentionDate) : null;
        }
        if (body.isPublished !== undefined) updateData.isPublished = body.isPublished;
        if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured;

        const mention = await prisma.mediaMention.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ mention });
    } catch (error) {
        console.error("Error updating media mention:", error);
        return NextResponse.json(
            { error: "Failed to update media mention" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        const mention = await prisma.mediaMention.findUnique({
            where: { id },
        });

        if (!mention) {
            return NextResponse.json({ error: "Mention not found" }, { status: 404 });
        }

        await prisma.mediaMention.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting media mention:", error);
        return NextResponse.json(
            { error: "Failed to delete media mention" },
            { status: 500 }
        );
    }
}
