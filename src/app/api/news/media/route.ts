import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const featured = searchParams.get("featured");
        const limit = parseInt(searchParams.get("limit") || "10");

        const where: Record<string, unknown> = {
            isPublished: true,
        };

        if (type && type !== "all") {
            where.sourceType = type;
        }

        if (featured === "true") {
            where.isFeatured = true;
        }

        const mentions = await prisma.mediaMention.findMany({
            where,
            orderBy: [
                { isFeatured: "desc" },
                { mentionDate: "desc" },
            ],
            take: limit,
            select: {
                id: true,
                title: true,
                source: true,
                sourceType: true,
                sourceUrl: true,
                logoUrl: true,
                description: true,
                quoteText: true,
                mentionDate: true,
                isFeatured: true,
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
