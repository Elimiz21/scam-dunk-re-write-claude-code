import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlogPostClient from "../post-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const revalidate = 300;

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn(
        "Skipping blog static params because DATABASE_URL is not set.",
      );
      return [];
    }

    const { prisma } = await import("@/lib/db");
    const posts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { slug: true },
    });
    return posts.map((post) => ({ slug: post.slug }));
  } catch (error) {
    console.error("Failed to generate blog static params:", error);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  if (!process.env.DATABASE_URL) {
    return {
      title: "ScamDunk Blog | ScamDunk",
      description: "Read the latest ScamDunk news and updates.",
      robots: { index: false, follow: false },
    };
  }

  const { prisma } = await import("@/lib/db");
  let post: {
    title: string;
    excerpt: string | null;
    coverImage: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
  } | null = null;

  try {
    post = await prisma.blogPost.findFirst({
      where: { slug: params.slug, isPublished: true },
      select: {
        title: true,
        excerpt: true,
        coverImage: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    console.error("Failed to load blog metadata:", error);
  }

  if (!post) {
    return {
      title: "Post Not Found | ScamDunk",
      robots: { index: false, follow: false },
    };
  }

  const description = post.excerpt || "Read the latest ScamDunk blog update.";
  const canonical = `/news/${params.slug}`;

  return {
    title: `${post.title} | ScamDunk`,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "article",
      url: `${siteUrl}${canonical}`,
      title: post.title,
      description,
      images: post.coverImage
        ? [{ url: post.coverImage }]
        : [{ url: `${siteUrl}/news/${params.slug}/opengraph-image` }],
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt?.toISOString(),
      siteName: "ScamDunk",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: PageParams }) {
  if (!process.env.DATABASE_URL) {
    notFound();
  }

  const { prisma } = await import("@/lib/db");
  let post: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    category: string;
    slug: string;
    title: string;
    excerpt: string | null;
    content: string;
    coverImage: string | null;
    author: string;
    tags: string | null;
    isPublished: boolean;
    publishedAt: Date | null;
  } | null = null;

  try {
    post = await prisma.blogPost.findFirst({
      where: { slug: params.slug, isPublished: true },
    });
  } catch (error) {
    console.error("Failed to load blog post:", error);
  }

  if (!post) {
    notFound();
  }

  // Fetch related posts (same category, excluding current, most recent first)
  let relatedPosts: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    publishedAt: string | null;
  }> = [];

  try {
    const rawRelatedPosts = await prisma.blogPost.findMany({
      where: {
        isPublished: true,
        category: post.category,
        NOT: { id: post.id },
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true,
      },
    });

    relatedPosts = rawRelatedPosts.map((p) => ({
      ...p,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    }));
  } catch (error) {
    console.error("Failed to fetch related posts:", error);
  }

  const serializedPost = {
    ...post,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    updatedAt: post.updatedAt.toISOString(),
  };

  // Extract plain text from HTML content for articleBody
  const stripHtmlTags = (html: string) => {
    return html.replace(/<[^>]*>/g, "").trim();
  };

  const articleBody = stripHtmlTags(post.content);

  // Generate Article schema
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || post.title,
    image: post.coverImage || undefined,
    datePublished: post.publishedAt?.toISOString() || undefined,
    dateModified: post.updatedAt?.toISOString(),
    author: {
      "@type": "Person",
      name: post.author,
    },
    articleBody: articleBody.substring(0, 5000), // Limit to 5000 chars for schema
  };

  return (
    <BlogPostClient
      post={serializedPost}
      articleSchema={articleSchema}
      relatedPosts={relatedPosts}
    />
  );
}
