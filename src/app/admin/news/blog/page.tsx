"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/admin/AdminLayout";
import {
    Plus,
    Edit,
    Trash2,
    Eye,
    EyeOff,
    Search,
    ArrowLeft,
} from "lucide-react";

interface BlogPost {
    id: string;
    title: string;
    slug: string;
    category: string;
    isPublished: boolean;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export default function AdminBlogListPage() {
    const router = useRouter();
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "published" | "drafts">("all");

    useEffect(() => {
        fetchPosts();
    }, []);

    async function fetchPosts() {
        try {
            const res = await fetch("/api/admin/news/blog");
            if (res.ok) {
                const data = await res.json();
                setPosts(data.posts || []);
            }
        } catch (error) {
            console.error("Failed to fetch posts:", error);
        } finally {
            setLoading(false);
        }
    }

    async function togglePublish(id: string, currentStatus: boolean) {
        try {
            const res = await fetch(`/api/admin/news/blog/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    isPublished: !currentStatus,
                    publishedAt: !currentStatus ? new Date().toISOString() : null,
                }),
            });
            if (res.ok) {
                fetchPosts();
            }
        } catch (error) {
            console.error("Failed to toggle publish status:", error);
        }
    }

    async function deletePost(id: string) {
        if (!confirm("Are you sure you want to delete this post?")) return;
        try {
            const res = await fetch(`/api/admin/news/blog/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                fetchPosts();
            }
        } catch (error) {
            console.error("Failed to delete post:", error);
        }
    }

    const filteredPosts = posts.filter((post) => {
        const matchesSearch =
            post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            post.slug.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter =
            filterStatus === "all" ||
            (filterStatus === "published" && post.isPublished) ||
            (filterStatus === "drafts" && !post.isPublished);
        return matchesSearch && matchesFilter;
    });

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <Link
                            href="/admin/news"
                            className="mr-4 p-2 text-muted-foreground hover:text-foreground rounded-2xl hover:bg-secondary"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Blog Posts</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Manage your blog content
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/admin/news/blog/new"
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white gradient-brand rounded-2xl hover:opacity-90 transition-colors"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Post
                    </Link>
                </div>

                {/* Filters */}
                <div className="bg-card rounded-2xl shadow p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search posts..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary/50"
                            />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                            className="px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary/50"
                        >
                            <option value="all">All Posts</option>
                            <option value="published">Published</option>
                            <option value="drafts">Drafts</option>
                        </select>
                    </div>
                </div>

                {/* Posts Table */}
                <div className="bg-card rounded-2xl shadow overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                        </div>
                    ) : filteredPosts.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>No blog posts found</p>
                            <Link
                                href="/admin/news/blog/new"
                                className="mt-2 inline-flex items-center text-primary hover:text-primary/80"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Create your first post
                            </Link>
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-secondary/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Title
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Category
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-border">
                                {filteredPosts.map((post) => (
                                    <tr key={post.id} className="hover:bg-secondary/50">
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="font-medium text-foreground">{post.title}</p>
                                                <p className="text-sm text-muted-foreground">/{post.slug}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 text-xs font-medium bg-secondary text-foreground rounded-full">
                                                {post.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${post.isPublished
                                                        ? "bg-green-100 text-green-800"
                                                        : "bg-yellow-100 text-yellow-800"
                                                    }`}
                                            >
                                                {post.isPublished ? (
                                                    <>
                                                        <Eye className="h-3 w-3 mr-1" />
                                                        Published
                                                    </>
                                                ) : (
                                                    <>
                                                        <EyeOff className="h-3 w-3 mr-1" />
                                                        Draft
                                                    </>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">
                                            {post.publishedAt
                                                ? formatDate(post.publishedAt)
                                                : formatDate(post.createdAt)}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button
                                                onClick={() => togglePublish(post.id, post.isPublished)}
                                                className="inline-flex items-center p-1.5 text-muted-foreground hover:text-primary rounded-2xl hover:bg-primary/5"
                                                title={post.isPublished ? "Unpublish" : "Publish"}
                                            >
                                                {post.isPublished ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </button>
                                            <Link
                                                href={`/admin/news/blog/${post.id}`}
                                                className="inline-flex items-center p-1.5 text-muted-foreground hover:text-primary rounded-2xl hover:bg-primary/5"
                                                title="Edit"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Link>
                                            <button
                                                onClick={() => deletePost(post.id)}
                                                className="inline-flex items-center p-1.5 text-muted-foreground hover:text-red-600 rounded-2xl hover:bg-red-50"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
