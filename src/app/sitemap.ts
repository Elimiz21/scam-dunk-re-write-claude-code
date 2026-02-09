import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

const routes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.7 },
  { path: "/news", changeFrequency: "weekly", priority: 0.6 },
  { path: "/help", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.4 },
  { path: "/disclaimer", changeFrequency: "yearly", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const staticRoutes = routes.map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    if (!process.env.DATABASE_URL) {
      console.warn("Skipping blog sitemap entries because DATABASE_URL is not set.");
      return staticRoutes;
    }

    const { prisma } = await import("@/lib/db");
    const posts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { slug: true, publishedAt: true, updatedAt: true },
    });

    const postRoutes = posts.map((post) => ({
      url: new URL(`/news/${post.slug}`, siteUrl).toString(),
      lastModified: post.updatedAt ?? post.publishedAt ?? lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));

    return [...staticRoutes, ...postRoutes];
  } catch (error) {
    console.error("Failed to generate blog sitemap entries:", error);
    return staticRoutes;
  }
}
