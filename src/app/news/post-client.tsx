"use client";

import { useState } from "react";
import Link from "next/link";
import DOMPurify from "isomorphic-dompurify";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { ArrowLeft, Calendar, User, Tag, Share2, Clock } from "lucide-react";
import { formatDate, slugify } from "@/lib/utils";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  author: string;
  category: string;
  tags: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
}

type BlogPostClientProps = {
  post: BlogPost;
  articleSchema?: Record<string, unknown>;
  relatedPosts?: RelatedPost[];
};

export default function BlogPostClient({
  post,
  articleSchema,
  relatedPosts = [],
}: BlogPostClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function estimateReadTime(content: string): number {
    const wordsPerMinute = 200;
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / wordsPerMinute));
  }

  async function handleShare() {
    const shareText = `${post.title} - ScamDunk Blog`;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";

    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title,
          text: post.excerpt || shareText,
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        }
      }
    } else {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    }
  }

  const handleNewScan = () => {
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background">
      {articleSchema && <JsonLd data={articleSchema} />}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewScan={handleNewScan}
      />
      <div className="flex flex-col min-h-screen">
        <Header
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          usage={null}
          onShare={handleShare}
          showShare
        />
        <main className="flex-1 px-4 py-12 md:py-16 max-w-4xl mx-auto w-full">
          <div className="mb-8">
            <Link
              href="/news"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to News
            </Link>
          </div>

          <article>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
              {post.category}
            </p>

            <h1 className="font-editorial mt-4 text-[clamp(2rem,4.5vw,3rem)] leading-[1.12] text-foreground mb-5">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground mb-8 border-b border-border/70 pb-8">
              <Link href={`/authors/${slugify(post.author)}`}>
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80 transition-colors hover:text-foreground cursor-pointer">
                  <User className="h-3.5 w-3.5" />
                  {post.author}
                </span>
              </Link>
              {post.publishedAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(post.publishedAt)}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {estimateReadTime(post.content)} min read
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                {post.category}
              </span>
            </div>

            {post.coverImage && (
              <div className="mb-8 overflow-hidden rounded-2xl">
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-full h-auto"
                />
              </div>
            )}

            {post.excerpt && (
              <p className="text-[17px] leading-relaxed text-muted-foreground mb-8">
                {post.excerpt}
              </p>
            )}

            <div
              className="tiptap prose prose-neutral dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(post.content),
              }}
            />
          </article>

          {post.tags && (
            <div className="mt-8 flex flex-wrap gap-2">
              {post.tags.split(",").map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground"
                >
                  #{tag.trim()}
                </span>
              ))}
            </div>
          )}

          <div className="mt-8">
            <button
              onClick={handleShare}
              className="btn-pill btn-pill-ghost gap-2 text-sm"
            >
              <Share2 className="h-4 w-4" />
              Share this post
            </button>
          </div>

          {/* Related Articles Section */}
          {relatedPosts.length > 0 && (
            <section className="mt-16 pt-12 border-t border-border/70">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Keep Reading
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                Related articles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {relatedPosts.map((relatedPost) => (
                  <Link key={relatedPost.id} href={`/news/${relatedPost.slug}`}>
                    <div className="rounded-xl border border-border bg-card p-5 h-full transition-colors hover:border-foreground/30 cursor-pointer">
                      <h3 className="text-[15px] font-semibold leading-snug text-foreground mb-2 line-clamp-2">
                        {relatedPost.title}
                      </h3>
                      {relatedPost.excerpt && (
                        <p className="text-[13px] leading-relaxed text-muted-foreground mb-3 line-clamp-2">
                          {relatedPost.excerpt}
                        </p>
                      )}
                      {relatedPost.publishedAt && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(relatedPost.publishedAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}
