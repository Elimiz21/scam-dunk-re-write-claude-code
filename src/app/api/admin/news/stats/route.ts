import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/auth";

export async function GET() {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const [totalBlogPosts, publishedBlogPosts, totalMediaMentions, publishedMediaMentions, featuredMediaMentions] = await Promise.all([
            prisma.blogPost.count(),
            prisma.blogPost.count({ where: { isPublished: true } }),
            prisma.mediaMention.count(),
            prisma.mediaMention.count({ where: { isPublished: true } }),
            prisma.mediaMention.count({ where: { isFeatured: true, isPublished: true } }),
        ]);

        return NextResponse.json({
            blogPosts: {
                total: totalBlogPosts,
                published: publishedBlogPosts,
                drafts: totalBlogPosts - publishedBlogPosts,
            },
            mediaMentions: {
                total: totalMediaMentions,
                published: publishedMediaMentions,
                featured: featuredMediaMentions,
            },
        });
    } catch (error) {
        console.error("Error fetching news stats:", error);
        return NextResponse.json(
            { error: "Failed to fetch news stats" },
            { status: 500 }
        );
    }
}
