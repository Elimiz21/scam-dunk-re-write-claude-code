"use client";

import { useState } from "react";
import Link from "next/link";
import DOMPurify from "isomorphic-dompurify";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { JsonLd } from "@/components/JsonLd";
import { ArrowLeft, Calendar, User, Tag, Share2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

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
        <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
          <div className="mb-6">
            <Link href="/news">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to News
              </Button>
            </Link>
          </div>

          <article className="card-elevated rounded-2xl p-6 md:p-10">
            {post.coverImage && (
              <div className="mb-6">
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-full h-auto rounded-xl"
                />
              </div>
            )}

            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
              <Link
                href={`/authors/${post.author.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span className="inline-flex items-center gap-1 hover:text-primary cursor-pointer">
                  <User className="h-4 w-4" />
                  {post.author}
                </span>
              </Link>
              {post.publishedAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(post.publishedAt)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {estimateReadTime(post.content)} min read
              </span>
              <span className="inline-flex items-center gap-1">
                <Tag className="h-4 w-4" />
                {post.category}
              </span>
            </div>

            {post.excerpt && (
              <p className="text-lg text-muted-foreground mb-6">
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
            <div className="mt-6 flex flex-wrap gap-2">
              {post.tags.split(",").map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 rounded-full bg-secondary"
                >
                  #{tag.trim()}
                </span>
              ))}
            </div>
          )}

          <div className="mt-8">
            <Button variant="outline" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share this post
            </Button>
          </div>

          {/* Related Articles Section */}
          {relatedPosts.length > 0 && (
            <section className="mt-16 pt-12 border-t border-border">
              <h2 className="text-2xl font-bold mb-8">Related Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <Link key={relatedPost.id} href={`/news/${relatedPost.slug}`}>
                    <div className="card-elevated rounded-xl p-5 h-full hover:shadow-lg transition-shadow cursor-pointer">
                      <h3 className="font-semibold text-lg mb-2 line-clamp-2 hover:text-primary">
                        {relatedPost.title}
                      </h3>
                      {relatedPost.excerpt && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
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
      </div>
    </div>
  );
}
