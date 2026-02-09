import type { Metadata } from "next";
import { prisma } from "@/lib/db";
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
"use client";

import { useState, useEffect } from "react";
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
    publishedAt: string;
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

export default function NewsPage() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
    const [mediaMentions, setMediaMentions] = useState<MediaMention[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>("all");

    useEffect(() => {
        fetchContent();
    }, []);

    async function fetchContent() {
        try {
            const [postsRes, mentionsRes] = await Promise.all([
                fetch("/api/news/blog?limit=20"),
                fetch("/api/news/media?limit=20"),
            ]);

            if (postsRes.ok) {
                const postsData = await postsRes.json();
                setBlogPosts(postsData.posts || []);
            }

            if (mentionsRes.ok) {
                const mentionsData = await mentionsRes.json();
                setMediaMentions(mentionsData.mentions || []);
            }
        } catch (error) {
            console.error("Failed to fetch news content:", error);
        } finally {
            setLoading(false);
        }
    }

    const categories = ["all", ...Array.from(new Set(blogPosts.map((p) => p.category)))];
    const filteredPosts =
        selectedCategory === "all"
            ? blogPosts
            : blogPosts.filter((p) => p.category === selectedCategory);

    const featuredMentions = mediaMentions.filter((m) => m.isFeatured);
    const regularMentions = mediaMentions.filter((m) => !m.isFeatured);

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString("en-US", {
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
                    onShare={() => { }}
                    showShare={false}
                />

                <main className="flex-1 px-4 py-8 max-w-7xl mx-auto w-full">
                    {/* Hero Section */}
                    <div className="text-center mb-12 gradient-mesh rounded-2xl py-12 px-4 animate-fade-in">
                        <div className="relative inline-flex items-center justify-center w-16 h-16 gradient-brand rounded-2xl mb-6 shadow-glow-sm">
                            <Newspaper className="h-8 w-8 text-white" />
                            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
                                <Eye className="h-2.5 w-2.5 text-white" />
                            </div>
                        </div>
                        <h1 className="text-4xl font-bold mb-4 font-display italic">News & Updates</h1>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            Stay informed with the latest from <span className="font-display italic">ScamDunk</span>. Read our blog for security tips,
                            product updates, and see what others are saying about us.
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
                        </div>
                    ) : (
                        <div className="space-y-16">
                            {/* Blog Section */}
                            <section className="animate-slide-up">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold flex items-center gap-2 font-display italic">
                                        <span className="inline-flex items-center justify-center w-10 h-10 gradient-brand rounded-2xl"><FileText className="h-5 w-5 text-white" /></span>
                                        <span className="font-display italic">ScamDunk</span> Blog
                                    </h2>
                                </div>

                                {/* Category Filters */}
                                {categories.length > 1 && (
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {categories.map((cat) => (
                                            <button
                                                key={cat}
                                                onClick={() => setSelectedCategory(cat)}
                                                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedCategory === cat
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
                                                <div className="p-5">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span
                                                            className={`px-2 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS.General
                                                                }`}
                                                        >
                                                            {post.category}
                                                        </span>
                                                    </div>
                                                    <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                                                        {post.title}
                                                    </h3>
                                                    {post.excerpt && (
                                                        <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
                                                            {post.excerpt}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {formatDate(post.publishedAt)}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-primary group-hover:underline">
                                                            Read more
                                                            <ChevronRight className="h-3 w-3" />
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* Media Mentions Section */}
                            <section className="animate-slide-up delay-1">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold flex items-center gap-2 font-display italic">
                                        <span className="inline-flex items-center justify-center w-10 h-10 gradient-brand rounded-2xl"><Star className="h-5 w-5 text-white" /></span>
                                        <span className="font-display italic">ScamDunk</span> in the News
                                    </h2>
                                </div>

                                {mediaMentions.length === 0 ? (
                                    <div className="text-center py-12 card-elevated rounded-xl">
                                        <Newspaper className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                        <p className="text-muted-foreground">No media mentions yet. Stay tuned!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        {/* Featured Mentions */}
                                        {featuredMentions.length > 0 && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                {featuredMentions.map((mention) => (
                                                    <div
                                                        key={mention.id}
                                                        className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 p-6"
                                                    >
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="flex items-center gap-3">
                                                                {mention.logoUrl ? (
                                                                    <img
                                                                        src={mention.logoUrl}
                                                                        alt={mention.source}
                                                                        className="h-10 w-10 object-contain rounded"
                                                                    />
                                                                ) : (
                                                                    <div className="h-10 w-10 bg-yellow-100 dark:bg-yellow-800 rounded flex items-center justify-center">
                                                                        {SOURCE_TYPE_ICONS[mention.sourceType] || <Newspaper className="h-5 w-5" />}
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <p className="font-semibold">{mention.source}</p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {SOURCE_TYPE_LABELS[mention.sourceType] || mention.sourceType}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                                                        </div>
                                                        <h3 className="font-semibold text-lg mb-2">{mention.title}</h3>
                                                        {mention.quoteText && (
                                                            <blockquote className="border-l-4 border-yellow-400 pl-4 my-4 italic text-muted-foreground">
                                                                <Quote className="h-4 w-4 inline mr-2" />
                                                                {mention.quoteText}
                                                            </blockquote>
                                                        )}
                                                        {mention.description && (
                                                            <p className="text-muted-foreground text-sm mb-4">{mention.description}</p>
                                                        )}
                                                        <div className="flex items-center justify-between">
                                                            {mention.mentionDate && (
                                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3" />
                                                                    {formatDate(mention.mentionDate)}
                                                                </span>
                                                            )}
                                                            {mention.sourceUrl && (
                                                                <a
                                                                    href={mention.sourceUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-sm text-primary hover:underline flex items-center gap-1"
                                                                >
                                                                    View original
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Regular Mentions */}
                                        {regularMentions.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {regularMentions.map((mention) => (
                                                    <div
                                                        key={mention.id}
                                                        className="card-interactive rounded-xl p-5"
                                                    >
                                                        <div className="flex items-center gap-3 mb-3">
                                                            {mention.logoUrl ? (
                                                                <img
                                                                    src={mention.logoUrl}
                                                                    alt={mention.source}
                                                                    className="h-8 w-8 object-contain rounded"
                                                                />
                                                            ) : (
                                                                <div className="h-8 w-8 bg-secondary rounded flex items-center justify-center text-muted-foreground">
                                                                    {SOURCE_TYPE_ICONS[mention.sourceType] || <Newspaper className="h-4 w-4" />}
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="font-medium text-sm">{mention.source}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {SOURCE_TYPE_LABELS[mention.sourceType] || mention.sourceType}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <h3 className="font-medium mb-2 line-clamp-2">{mention.title}</h3>
                                                        {mention.quoteText && (
                                                            <p className="text-sm text-muted-foreground italic line-clamp-2 mb-3">
                                                                "{mention.quoteText}"
                                                            </p>
                                                        )}
                                                        <div className="flex items-center justify-between text-xs">
                                                            {mention.mentionDate && (
                                                                <span className="text-muted-foreground">
                                                                    {formatDate(mention.mentionDate)}
                                                                </span>
                                                            )}
                                                            {mention.sourceUrl && (
                                                                <a
                                                                    href={mention.sourceUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-primary hover:underline flex items-center gap-1"
                                                                >
                                                                    View
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
