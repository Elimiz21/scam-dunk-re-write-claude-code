import type { Metadata } from "next";
import Link from "next/link";
import { PageLayout } from "@/components/PageLayout";
import { ArrowLeft, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { slugify } from "@/lib/utils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

type PageParams = { author: string };

// Known author bios. Unknown authors still resolve to a resilient generic
// profile (see getAuthorBio) rather than 404ing, so bylines never produce
// crawlable 404s. Keys MUST be produced by the shared slugify() helper so they
// line up with the slugs generated for bylines.
const authorBios: Record<string, string> = {
  "scam-dunk-team":
    "Investment fraud researcher and analyst with a focus on detecting pump-and-dump schemes.",
  "security-analyst":
    "Senior security analyst specializing in investment fraud patterns and market manipulation.",
};

function authorNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getAuthorBio(slug: string, name: string): string {
  return (
    authorBios[slug] ??
    `${name} contributes to the ScamDunk blog, covering investment fraud detection, market manipulation, and how retail investors can spot scam red flags.`
  );
}

export async function generateStaticParams(): Promise<PageParams[]> {
  // Pre-render the known authors. Unknown authors are rendered on demand.
  return Object.keys(authorBios).map((author) => ({ author }));
}

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const authorSlug = slugify(decodeURIComponent(params.author));
  const authorName = authorNameFromSlug(authorSlug);

  const description = `Read articles by ${authorName} on stock fraud detection, investment scams, and market manipulation analysis.`;

  return {
    title: `${authorName} - Author | ScamDunk`,
    description,
    alternates: {
      canonical: `/authors/${authorSlug}`,
    },
    openGraph: {
      type: "profile",
      url: `${siteUrl}/authors/${authorSlug}`,
      title: `${authorName} - ScamDunk Author`,
      description,
      siteName: "ScamDunk",
    },
  };
}

export default async function AuthorPage({ params }: { params: PageParams }) {
  const authorSlug = slugify(decodeURIComponent(params.author));
  const authorName = authorNameFromSlug(authorSlug);
  const authorBio = getAuthorBio(authorSlug, authorName);

  // Fetch posts by this author
  let authorPosts: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    publishedAt: Date | null;
  }> = [];

  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import("@/lib/db");
      const rawPosts = await prisma.blogPost.findMany({
        where: {
          isPublished: true,
          author: { equals: authorName, mode: "insensitive" },
        },
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          publishedAt: true,
        },
      });

      authorPosts = rawPosts.map((post) => ({
        ...post,
        publishedAt: post.publishedAt,
      }));
    } catch (error) {
      console.error("Failed to load author posts:", error);
    }
  }

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: authorName,
    url: `${siteUrl}/authors/${authorSlug}`,
    description: authorBio,
    worksFor: {
      "@type": "Organization",
      name: "ScamDunk",
      url: siteUrl,
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={personSchema} />
      <PageLayout>
        <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
          <div className="mb-6">
            <Link href="/news">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to News
              </Button>
            </Link>
          </div>

          <div className="card-elevated rounded-2xl p-10 mb-8">
            <h1 className="text-4xl font-bold mb-4">{authorName}</h1>
            <p className="text-lg text-muted-foreground mb-6">{authorBio}</p>
            <p className="text-sm text-muted-foreground">
              Investment fraud researcher and analyst at ScamDunk. Helping
              retail investors identify market manipulation and pump-and-dump
              schemes.
            </p>
          </div>

          {/* Author's Articles */}
          {authorPosts.length > 0 ? (
            <section>
              <h2 className="text-2xl font-bold mb-6">
                Articles by {authorName}
              </h2>
              <div className="space-y-4">
                {authorPosts.map((post) => (
                  <Link key={post.id} href={`/news/${post.slug}`}>
                    <div className="card-elevated rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
                      <h3 className="text-xl font-semibold mb-2 hover:text-primary">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="text-muted-foreground mb-3">
                          {post.excerpt}
                        </p>
                      )}
                      {post.publishedAt && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {new Date(post.publishedAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            },
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No articles found for this author yet.
              </p>
            </div>
          )}
        </main>
      </PageLayout>
    </div>
  );
}
