import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get("category");
        const limit = parseInt(searchParams.get("limit") || "10");

        const where: Record<string, unknown> = {
            isPublished: true,
        };

        if (category && category !== "all") {
            where.category = category;
        }

        const posts = await prisma.blogPost.findMany({
            where,
            orderBy: { publishedAt: "desc" },
            take: limit,
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                coverImage: true,
                author: true,
                category: true,
                tags: true,
                publishedAt: true,
            },
        });

        return NextResponse.json({ posts });
    } catch (error) {
        console.error("Error fetching blog posts:", error);
        return NextResponse.json(
            { error: "Failed to fetch blog posts" },
            { status: 500 }
        );
    }
}
