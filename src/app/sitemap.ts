import type { MetadataRoute } from "next";

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
  { path: "/investment-scams", changeFrequency: "monthly", priority: 0.8 },
  { path: "/social-media-scams", changeFrequency: "monthly", priority: 0.8 },
  {
    path: "/how-to-detect-stock-scams",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  { path: "/help", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.4 },
  { path: "/disclaimer", changeFrequency: "yearly", priority: 0.4 },
];

// Slugs of authors that have pre-rendered /authors/* pages. Keep in sync with
// authorBios in src/app/authors/[author]/page.tsx.
const authorSlugs = ["scam-dunk-team", "security-analyst"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes intentionally omit `lastModified`: stamping every one with
  // `new Date()` on each build falsely signals constant change to crawlers.
  const staticRoutes: MetadataRoute.Sitemap = routes.map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const authorRoutes: MetadataRoute.Sitemap = authorSlugs.map((slug) => ({
    url: new URL(`/authors/${slug}`, siteUrl).toString(),
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  try {
    if (!process.env.DATABASE_URL) {
      console.warn(
        "Skipping blog sitemap entries because DATABASE_URL is not set.",
      );
      return [...staticRoutes, ...authorRoutes];
    }

    const { prisma } = await import("@/lib/db");
    const posts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { slug: true, publishedAt: true, updatedAt: true },
    });

    // Blog posts keep a real lastModified — they genuinely change.
    const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
      url: new URL(`/news/${post.slug}`, siteUrl).toString(),
      lastModified: post.updatedAt ?? post.publishedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));

    return [...staticRoutes, ...authorRoutes, ...postRoutes];
  } catch (error) {
    console.error("Failed to generate blog sitemap entries:", error);
    return [...staticRoutes, ...authorRoutes];
  }
}
