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
        const post = await prisma.blogPost.findUnique({
            where: { id },
        });

        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        return NextResponse.json({ post });
    } catch (error) {
        console.error("Error fetching blog post:", error);
        return NextResponse.json(
            { error: "Failed to fetch blog post" },
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

        // Check if post exists
        const existingPost = await prisma.blogPost.findUnique({
            where: { id },
        });

        if (!existingPost) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        // If slug is changing, check uniqueness
        if (body.slug && body.slug !== existingPost.slug) {
            const slugExists = await prisma.blogPost.findUnique({
                where: { slug: body.slug },
            });
            if (slugExists) {
                return NextResponse.json(
                    { error: "A post with this slug already exists" },
                    { status: 400 }
                );
            }
        }

        const updateData: Record<string, unknown> = {};

        if (body.title !== undefined) updateData.title = body.title;
        if (body.slug !== undefined) updateData.slug = body.slug;
        if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
        if (body.content !== undefined) updateData.content = body.content;
        if (body.coverImage !== undefined) updateData.coverImage = body.coverImage;
        if (body.author !== undefined) updateData.author = body.author;
        if (body.category !== undefined) updateData.category = body.category;
        if (body.tags !== undefined) updateData.tags = body.tags;
        if (body.isPublished !== undefined) {
            updateData.isPublished = body.isPublished;
            if (body.isPublished && !existingPost.publishedAt) {
                updateData.publishedAt = new Date();
            }
        }
        if (body.publishedAt !== undefined) {
            updateData.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
        }

        const post = await prisma.blogPost.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ post });
    } catch (error) {
        console.error("Error updating blog post:", error);
        return NextResponse.json(
            { error: "Failed to update blog post" },
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

        const post = await prisma.blogPost.findUnique({
            where: { id },
        });

        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        await prisma.blogPost.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting blog post:", error);
        return NextResponse.json(
            { error: "Failed to delete blog post" },
            { status: 500 }
        );
    }
}
