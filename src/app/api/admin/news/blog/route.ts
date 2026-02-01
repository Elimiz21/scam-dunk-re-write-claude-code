import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/auth";

export async function GET() {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const posts = await prisma.blogPost.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                slug: true,
                category: true,
                isPublished: true,
                publishedAt: true,
                createdAt: true,
                updatedAt: true,
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

export async function POST(request: Request) {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, slug, excerpt, content, coverImage, author, category, tags, isPublished, publishedAt } = body;

        if (!title || !content) {
            return NextResponse.json(
                { error: "Title and content are required" },
                { status: 400 }
            );
        }

        const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        // Check if slug is unique
        const existingPost = await prisma.blogPost.findUnique({
            where: { slug: finalSlug },
        });

        if (existingPost) {
            return NextResponse.json(
                { error: "A post with this slug already exists" },
                { status: 400 }
            );
        }

        const post = await prisma.blogPost.create({
            data: {
                title,
                slug: finalSlug,
                excerpt: excerpt || null,
                content,
                coverImage: coverImage || null,
                author: author || "Scam Dunk Team",
                category: category || "General",
                tags: tags || null,
                isPublished: isPublished || false,
                publishedAt: isPublished ? (publishedAt ? new Date(publishedAt) : new Date()) : null,
            },
        });

        return NextResponse.json({ post }, { status: 201 });
    } catch (error) {
        console.error("Error creating blog post:", error);
        return NextResponse.json(
            { error: "Failed to create blog post" },
            { status: 500 }
        );
    }
}
