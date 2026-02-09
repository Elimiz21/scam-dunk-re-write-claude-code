"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import {
  FileText,
  Calendar,
  Tag,
  ChevronRight,
  ExternalLink,
  Star,
  Quote,
  Newspaper,
  Users,
  MessageCircle,
  Eye,
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

const CATEGORY_COLORS: Record<string, string> = {
  General: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "Security Tips": "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  "Industry News": "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  "Product Updates": "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  "Case Studies": "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  Guides: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
};

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

export default function NewsClient({ blogPosts, mediaMentions }: NewsClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(blogPosts.map((post) => post.category)))],
    [blogPosts],
  );
  const filteredPosts =
    selectedCategory === "all"
      ? blogPosts
      : blogPosts.filter((post) => post.category === selectedCategory);

  const featuredMentions = mediaMentions.filter((mention) => mention.isFeatured);
  const regularMentions = mediaMentions.filter((mention) => !mention.isFeatured);

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

        <main className="flex-1 px-4 py-8 max-w-7xl mx-auto w-full">
          <div className="text-center mb-12 gradient-mesh rounded-2xl py-12 px-4 animate-fade-in">
            <div className="relative inline-flex items-center justify-center w-16 h-16 gradient-brand rounded-2xl mb-6 shadow-glow-sm">
              <Newspaper className="h-8 w-8 text-white" />
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
                <Eye className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-4 font-display italic">News & Updates</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Stay informed with the latest from{" "}
              <span className="font-display italic">ScamDunk</span>. Read our blog for security tips,
              product updates, and see what others are saying about us.
            </p>
          </div>

          <div className="space-y-16">
            <section className="animate-slide-up">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2 font-display italic">
                  <span className="inline-flex items-center justify-center w-10 h-10 gradient-brand rounded-2xl">
                    <FileText className="h-5 w-5 text-white" />
                  </span>
                  <span className="font-display italic">ScamDunk</span> Blog
                </h2>
              </div>

              {categories.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        selectedCategory === cat
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {cat === "all" ? "All Posts" : cat}
                    </button>
                  ))}
                </div>
              )}

              {filteredPosts.length === 0 ? (
                <div className="text-center py-12 card-elevated rounded-xl">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No blog posts yet. Check back soon!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/news/${post.slug}`}
                      className="group card-interactive rounded-xl overflow-hidden"
                    >
                      {post.coverImage && (
                        <div className="aspect-video w-full overflow-hidden">
                          <img
                            src={post.coverImage}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      )}

                      <div className="p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              CATEGORY_COLORS[post.category] ||
                              "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            }`}
                          >
                            {post.category}
                          </span>
                          {post.publishedAt && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(post.publishedAt)}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                          {post.title}
                        </h3>
                        {post.excerpt && (
                          <p className="text-muted-foreground text-sm line-clamp-3">{post.excerpt}</p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                          <span>By {post.author}</span>
                          <span className="inline-flex items-center gap-1 text-primary">
                            Read more <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="animate-slide-up delay-1">
              <div className="flex items-center gap-2 mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2 font-display italic">
                  <span className="inline-flex items-center justify-center w-10 h-10 gradient-brand rounded-2xl">
                    <Star className="h-5 w-5 text-white" />
                  </span>
                  Media Mentions
                </h2>
              </div>

              {featuredMentions.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {featuredMentions.map((mention) => (
                    <div key={mention.id} className="card-elevated rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        {mention.logoUrl ? (
                          <img
                            src={mention.logoUrl}
                            alt={mention.source}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                            {SOURCE_TYPE_ICONS[mention.sourceType]}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{mention.source}</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                              {SOURCE_TYPE_LABELS[mention.sourceType] || mention.sourceType}
                            </span>
                          </div>
                          {mention.mentionDate && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(mention.mentionDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-lg font-semibold mb-2">{mention.title}</h3>
                      {mention.quoteText && (
                        <blockquote className="border-l-2 border-primary pl-4 text-muted-foreground italic mb-3">
                          <Quote className="h-4 w-4 inline-block mr-2 text-primary" />
                          {mention.quoteText}
                        </blockquote>
                      )}
                      {mention.description && (
                        <p className="text-muted-foreground text-sm mb-4">{mention.description}</p>
                      )}
                      {mention.sourceUrl && (
                        <a
                          href={mention.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-primary hover:underline"
                        >
                          View source <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {regularMentions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {regularMentions.map((mention) => (
                    <div key={mention.id} className="card-elevated rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-3">
                        {mention.logoUrl ? (
                          <img
                            src={mention.logoUrl}
                            alt={mention.source}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                            {SOURCE_TYPE_ICONS[mention.sourceType]}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-sm">{mention.source}</p>
                          <p className="text-xs text-muted-foreground">
                            {SOURCE_TYPE_LABELS[mention.sourceType] || mention.sourceType}
                          </p>
                        </div>
                      </div>
                      <h3 className="font-semibold mb-2">{mention.title}</h3>
                      {mention.description && (
                        <p className="text-sm text-muted-foreground mb-3">{mention.description}</p>
                      )}
                      {mention.sourceUrl && (
                        <a
                          href={mention.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs text-primary hover:underline"
                        >
                          Read more <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 card-elevated rounded-xl">
                  <Quote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No media mentions yet. Check back soon!
                  </p>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
