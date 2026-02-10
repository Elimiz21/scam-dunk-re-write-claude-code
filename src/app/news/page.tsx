import type { Metadata } from "next";
import NewsClient from "./news-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "ScamDunk News & Blog",
  description:
    "Read ScamDunk news, updates, and security tips. Stay current on product updates and industry insights.",
  alternates: {
    canonical: "/news",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/news`,
    title: "ScamDunk News & Blog",
    description:
      "Read ScamDunk news, updates, and security tips. Stay current on product updates and industry insights.",
    siteName: "ScamDunk",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScamDunk News & Blog",
    description:
      "Read ScamDunk news, updates, and security tips. Stay current on product updates and industry insights.",
  },
};

export default async function NewsPage() {
  if (!process.env.DATABASE_URL) {
    console.warn("Skipping news data fetch because DATABASE_URL is not set.");
    return <NewsClient blogPosts={[]} mediaMentions={[]} />;
  }

  const { prisma } = await import("@/lib/db");
  try {
    const [blogPosts, mediaMentions] = await Promise.all([
      prisma.blogPost.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: "desc" },
        take: 50,
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
      }),
      prisma.mediaMention.findMany({
        where: { isPublished: true },
        orderBy: [{ isFeatured: "desc" }, { mentionDate: "desc" }],
        take: 50,
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
      }),
    ]);

    const serializedPosts = blogPosts.map((post) => ({
      ...post,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    }));
    const serializedMentions = mediaMentions.map((mention) => ({
      ...mention,
      mentionDate: mention.mentionDate ? mention.mentionDate.toISOString() : null,
    }));

    return <NewsClient blogPosts={serializedPosts} mediaMentions={serializedMentions} />;
  } catch (error) {
    console.error("Failed to load news content:", error);
    return <NewsClient blogPosts={[]} mediaMentions={[]} />;
  }
}
