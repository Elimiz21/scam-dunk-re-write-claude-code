import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/auth";

export async function GET() {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const mentions = await prisma.mediaMention.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                source: true,
                sourceType: true,
                sourceUrl: true,
                isPublished: true,
                isFeatured: true,
                mentionDate: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ mentions });
    } catch (error) {
        console.error("Error fetching media mentions:", error);
        return NextResponse.json(
            { error: "Failed to fetch media mentions" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            title,
            source,
            sourceType,
            sourceUrl,
            logoUrl,
            description,
            quoteText,
            mentionDate,
            isPublished,
            isFeatured,
        } = body;

        if (!title || !source) {
            return NextResponse.json(
                { error: "Title and source are required" },
                { status: 400 }
            );
        }

        const mention = await prisma.mediaMention.create({
            data: {
                title,
                source,
                sourceType: sourceType || "NEWS_OUTLET",
                sourceUrl: sourceUrl || null,
                logoUrl: logoUrl || null,
                description: description || null,
                quoteText: quoteText || null,
                mentionDate: mentionDate ? new Date(mentionDate) : null,
                isPublished: isPublished || false,
                isFeatured: isFeatured || false,
            },
        });

        return NextResponse.json({ mention }, { status: 201 });
    } catch (error) {
        console.error("Error creating media mention:", error);
        return NextResponse.json(
            { error: "Failed to create media mention" },
            { status: 500 }
        );
    }
}
