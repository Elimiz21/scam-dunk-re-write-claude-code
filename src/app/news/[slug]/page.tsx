import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BlogPostClient from "../post-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const revalidate = 300;

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  try {
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
  const post = await prisma.blogPost.findFirst({
    where: { slug: params.slug, isPublished: true },
    select: {
      title: true,
      excerpt: true,
      coverImage: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

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
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
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
  const post = await prisma.blogPost.findFirst({
    where: { slug: params.slug, isPublished: true },
  });

  if (!post) {
    notFound();
  }

  const serializedPost = {
    ...post,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    updatedAt: post.updatedAt.toISOString(),
  };

  return <BlogPostClient post={serializedPost} />;
}
