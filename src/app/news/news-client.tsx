"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Footer } from "@/components/Footer";
import {
  FileText,
  Calendar,
  ChevronRight,
  ExternalLink,
  Quote,
  Newspaper,
  Users,
  MessageCircle,
} from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  author: string;
  category: string;
  tags: string | null;
  publishedAt: string | null;
}

interface MediaMention {
  id: string;
  title: string;
  source: string;
  sourceType: string;
  sourceUrl: string | null;
  logoUrl: string | null;
  description: string | null;
  quoteText: string | null;
  mentionDate: string | null;
  isFeatured: boolean;
}

const SOURCE_TYPE_ICONS: Record<string, React.ReactNode> = {
  NEWS_OUTLET: <Newspaper className="h-4 w-4" />,
  PLATFORM: <MessageCircle className="h-4 w-4" />,
  USER_SHOUTOUT: <Users className="h-4 w-4" />,
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  NEWS_OUTLET: "News",
  PLATFORM: "Platform",
  USER_SHOUTOUT: "Community",
};

type NewsClientProps = {
  blogPosts: BlogPost[];
  mediaMentions: MediaMention[];
};

export default function NewsClient({
  blogPosts,
  mediaMentions,
}: NewsClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(
    () => [
      "all",
      ...Array.from(new Set(blogPosts.map((post) => post.category))),
    ],
    [blogPosts],
  );
  const filteredPosts =
    selectedCategory === "all"
      ? blogPosts
      : blogPosts.filter((post) => post.category === selectedCategory);

  const featuredMentions = mediaMentions.filter(
    (mention) => mention.isFeatured,
  );
  const regularMentions = mediaMentions.filter(
    (mention) => !mention.isFeatured,
  );

  function formatDate(dateValue: string | null) {
    if (!dateValue) {
      return "Unscheduled";
    }
    return new Date(dateValue).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const handleNewScan = () => {
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewScan={handleNewScan}
      />

      <div className="flex flex-col min-h-screen">
        <Header
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          usage={null}
          onShare={() => {}}
          showShare={false}
        />

        <main className="flex-1 px-4 py-12 md:py-16 max-w-6xl mx-auto w-full">
          <div className="mb-12 md:mb-16">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Newsroom
            </p>
            <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
              News &amp; <span className="text-brand-blue">updates.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Stay informed with the latest from ScamDunk. Read our blog for
              security tips, product updates, and see what others are saying
              about us.
            </p>
          </div>

          <div className="space-y-16">
            <section>
              <div className="mb-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                  From the Blog
                </p>
                <h2 className="font-editorial mt-3 text-2xl md:text-3xl leading-tight text-foreground">
                  ScamDunk blog
                </h2>
              </div>

              {categories.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-colors ${
                        selectedCategory === cat
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      }`}
                    >
                      {cat === "all" ? "All Posts" : cat}
                    </button>
                  ))}
                </div>
              )}

              {filteredPosts.length === 0 ? (
                <div className="text-center py-12 rounded-xl border border-border bg-card">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/60 mb-4" />
                  <p className="text-sm text-muted-foreground">
                    No blog posts yet. Check back soon!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/news/${post.slug}`}
                      className="group rounded-2xl border border-border bg-card overflow-hidden transition-colors hover:border-foreground/30"
                    >
                      {post.coverImage && (
                        <div className="aspect-video w-full overflow-hidden">
                          <img
                            src={post.coverImage}
                            alt={post.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        </div>
                      )}

                      <div className="p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-teal">
                            {post.category}
                          </span>
                          {post.publishedAt && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(post.publishedAt)}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold leading-snug text-foreground">
                          {post.title}
                        </h3>
                        {post.excerpt && (
                          <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-3">
                            {post.excerpt}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                          <span>By {post.author}</span>
                          <span className="inline-flex items-center gap-1 font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                            Read more <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-border/70 pt-12">
              <div className="mb-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                  Press
                </p>
                <h2 className="font-editorial mt-3 text-2xl md:text-3xl leading-tight text-foreground">
                  Media mentions
                </h2>
              </div>

              {featuredMentions.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
                  {featuredMentions.map((mention) => (
                    <div
                      key={mention.id}
                      className="rounded-2xl border border-border bg-card p-6"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        {mention.logoUrl ? (
                          <img
                            src={mention.logoUrl}
                            alt={mention.source}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full border border-border bg-secondary flex items-center justify-center text-muted-foreground">
                            {SOURCE_TYPE_ICONS[mention.sourceType]}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-semibold text-foreground">
                              {mention.source}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                              {SOURCE_TYPE_LABELS[mention.sourceType] ||
                                mention.sourceType}
                            </span>
                          </div>
                          {mention.mentionDate && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(mention.mentionDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-lg font-semibold leading-snug text-foreground mb-2">
                        {mention.title}
                      </h3>
                      {mention.quoteText && (
                        <blockquote className="border-l-2 border-teal pl-4 text-sm leading-relaxed text-muted-foreground mb-3">
                          <Quote className="h-3.5 w-3.5 inline-block mr-2 text-teal" />
                          {mention.quoteText}
                        </blockquote>
                      )}
                      {mention.description && (
                        <p className="text-[13px] leading-relaxed text-muted-foreground mb-4">
                          {mention.description}
                        </p>
                      )}
                      {mention.sourceUrl && (
                        <a
                          href={mention.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                        >
                          View source <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {regularMentions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {regularMentions.map((mention) => (
                    <div
                      key={mention.id}
                      className="rounded-2xl border border-border bg-card p-5"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        {mention.logoUrl ? (
                          <img
                            src={mention.logoUrl}
                            alt={mention.source}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full border border-border bg-secondary flex items-center justify-center text-muted-foreground">
                            {SOURCE_TYPE_ICONS[mention.sourceType]}
                          </div>
                        )}
                        <div>
                          <p className="text-[13px] font-semibold text-foreground">
                            {mention.source}
                          </p>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {SOURCE_TYPE_LABELS[mention.sourceType] ||
                              mention.sourceType}
                          </p>
                        </div>
                      </div>
                      <h3 className="text-[15px] font-semibold leading-snug text-foreground mb-2">
                        {mention.title}
                      </h3>
                      {mention.description && (
                        <p className="text-[13px] leading-relaxed text-muted-foreground mb-3">
                          {mention.description}
                        </p>
                      )}
                      {mention.sourceUrl && (
                        <a
                          href={mention.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs font-medium text-foreground/80 transition-colors hover:text-foreground"
                        >
                          Read more <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 rounded-xl border border-border bg-card">
                  <Quote className="h-10 w-10 mx-auto text-muted-foreground/60 mb-4" />
                  <p className="text-sm text-muted-foreground">
                    No media mentions yet. Check back soon!
                  </p>
                </div>
              )}
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
