"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ArrowLeft, Calendar, User, Tag, Share2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    publishedAt: string;
}

export default function BlogPostPage() {
    const params = useParams();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [post, setPost] = useState<BlogPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (params.slug) {
            fetchPost();
        }
    }, [params.slug]);

    async function fetchPost() {
        try {
            const res = await fetch(`/api/news/blog/${params.slug}`);
            if (res.ok) {
                const data = await res.json();
                setPost(data.post);
            } else if (res.status === 404) {
                setNotFound(true);
            }
        } catch (error) {
            console.error("Failed to fetch blog post:", error);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }

    function estimateReadTime(content: string): number {
        const wordsPerMinute = 200;
        const words = content.trim().split(/\s+/).length;
        return Math.max(1, Math.ceil(words / wordsPerMinute));
    }

    async function handleShare() {
        if (post) {
            const shareText = `${post.title} - Scam Dunk Blog`;
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
    }

    const handleNewScan = () => {
        window.location.href = "/";
    };

    // Simple markdown-like rendering for content
    function renderContent(content: string) {
        // Split by double newlines for paragraphs
        const paragraphs = content.split(/\n\n+/);

        return paragraphs.map((paragraph, index) => {
            // Check for headers
            if (paragraph.startsWith("# ")) {
                return (
                    <h1 key={index} className="text-3xl font-bold mt-8 mb-4">
                        {paragraph.slice(2)}
                    </h1>
                );
            }
            if (paragraph.startsWith("## ")) {
                return (
                    <h2 key={index} className="text-2xl font-bold mt-6 mb-3">
                        {paragraph.slice(3)}
                    </h2>
                );
            }
            if (paragraph.startsWith("### ")) {
                return (
                    <h3 key={index} className="text-xl font-semibold mt-5 mb-2">
                        {paragraph.slice(4)}
                    </h3>
                );
            }

            // Check for lists
            if (paragraph.match(/^[-*] /m)) {
                const items = paragraph.split(/\n/).filter(line => line.match(/^[-*] /));
                return (
                    <ul key={index} className="list-disc list-inside my-4 space-y-2">
                        {items.map((item, i) => (
                            <li key={i} className="text-muted-foreground">
                                {item.slice(2)}
                            </li>
                        ))}
                    </ul>
                );
            }

            // Check for blockquotes
            if (paragraph.startsWith("> ")) {
                return (
                    <blockquote
                        key={index}
                        className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground"
                    >
                        {paragraph.slice(2)}
                    </blockquote>
                );
            }

            // Regular paragraph
            return (
                <p key={index} className="text-muted-foreground leading-relaxed mb-4">
                    {paragraph}
                </p>
            );
        });
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (notFound) {
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
                    <main className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <h1 className="text-2xl font-bold mb-4">Post Not Found</h1>
                            <p className="text-muted-foreground mb-6">
                                The blog post you're looking for doesn't exist.
                            </p>
                            <Link href="/news">
                                <Button variant="outline">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Back to News
                                </Button>
                            </Link>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    if (!post) return null;

    const tags = post.tags ? post.tags.split(",").map((t) => t.trim()) : [];

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
                    onShare={handleShare}
                    showShare={true}
                />

                <main className="flex-1 px-4 py-8">
                    <article className="max-w-3xl mx-auto">
                        {/* Back Link */}
                        <Link
                            href="/news"
                            className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8 transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to News
                        </Link>

                        {/* Cover Image */}
                        {post.coverImage && (
                            <div className="aspect-video w-full overflow-hidden rounded-xl mb-8">
                                <img
                                    src={post.coverImage}
                                    alt={post.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}

                        {/* Category Badge */}
                        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary mb-4">
                            {post.category}
                        </span>

                        {/* Title */}
                        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>

                        {/* Meta Info */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b">
                            <span className="flex items-center gap-1">
                                <User className="h-4 w-4" />
                                {post.author}
                            </span>
                            <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {formatDate(post.publishedAt)}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {estimateReadTime(post.content)} min read
                            </span>
                        </div>

                        {/* Content */}
                        <div className="prose prose-lg dark:prose-invert max-w-none">
                            {renderContent(post.content)}
                        </div>

                        {/* Tags */}
                        {tags.length > 0 && (
                            <div className="mt-8 pt-8 border-t">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Tag className="h-4 w-4 text-muted-foreground" />
                                    {tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Share */}
                        <div className="mt-8 pt-8 border-t flex items-center justify-between">
                            <p className="text-muted-foreground">Enjoyed this article?</p>
                            <Button variant="outline" onClick={handleShare}>
                                <Share2 className="h-4 w-4 mr-2" />
                                Share
                            </Button>
                        </div>
                    </article>
                </main>
            </div>
        </div>
    );
}
