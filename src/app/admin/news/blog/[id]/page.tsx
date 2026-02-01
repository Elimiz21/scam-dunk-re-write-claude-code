"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/admin/AdminLayout";
import { ArrowLeft, Save, Trash2, Eye, EyeOff } from "lucide-react";

interface BlogPost {
    id?: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    coverImage: string;
    author: string;
    category: string;
    tags: string;
    isPublished: boolean;
    publishedAt: string | null;
}

const CATEGORIES = [
    "General",
    "Security Tips",
    "Industry News",
    "Product Updates",
    "Case Studies",
    "Guides",
];

export default function AdminBlogEditorPage() {
    const router = useRouter();
    const params = useParams();
    const isNew = params.id === "new";

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [post, setPost] = useState<BlogPost>({
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        coverImage: "",
        author: "Scam Dunk Team",
        category: "General",
        tags: "",
        isPublished: false,
        publishedAt: null,
    });

    useEffect(() => {
        if (!isNew) {
            fetchPost();
        }
    }, [isNew]);

    async function fetchPost() {
        try {
            const res = await fetch(`/api/admin/news/blog/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setPost(data.post);
            } else {
                router.push("/admin/news/blog");
            }
        } catch (error) {
            console.error("Failed to fetch post:", error);
            router.push("/admin/news/blog");
        } finally {
            setLoading(false);
        }
    }

    function generateSlug(title: string) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .trim();
    }

    function handleTitleChange(title: string) {
        setPost((prev) => ({
            ...prev,
            title,
            slug: isNew || prev.slug === generateSlug(prev.title) ? generateSlug(title) : prev.slug,
        }));
    }

    async function handleSave(publish: boolean = false) {
        if (!post.title.trim()) {
            alert("Please enter a title");
            return;
        }
        if (!post.content.trim()) {
            alert("Please enter content");
            return;
        }

        setSaving(true);
        try {
            const body = {
                ...post,
                isPublished: publish ? true : post.isPublished,
                publishedAt: publish && !post.publishedAt ? new Date().toISOString() : post.publishedAt,
            };

            const url = isNew ? "/api/admin/news/blog" : `/api/admin/news/blog/${params.id}`;
            const method = isNew ? "POST" : "PUT";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                router.push("/admin/news/blog");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to save post");
            }
        } catch (error) {
            console.error("Failed to save post:", error);
            alert("Failed to save post");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this post? This cannot be undone.")) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/news/blog/${params.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                router.push("/admin/news/blog");
            }
        } catch (error) {
            console.error("Failed to delete post:", error);
        }
    }

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <Link
                            href="/admin/news/blog"
                            className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">
                                {isNew ? "New Blog Post" : "Edit Blog Post"}
                            </h1>
                            <p className="mt-1 text-sm text-gray-500">
                                {isNew ? "Create a new blog post" : "Update your blog post"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isNew && (
                            <button
                                onClick={handleDelete}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </button>
                        )}
                        <button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            Save Draft
                        </button>
                        <button
                            onClick={() => handleSave(true)}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {post.isPublished ? (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Update
                                </>
                            ) : (
                                <>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Publish
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Editor Form */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={post.title}
                                        onChange={(e) => handleTitleChange(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter post title"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Slug
                                    </label>
                                    <div className="flex items-center">
                                        <span className="text-gray-500 mr-2">/news/</span>
                                        <input
                                            type="text"
                                            value={post.slug}
                                            onChange={(e) => setPost({ ...post, slug: e.target.value })}
                                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="post-url-slug"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Excerpt
                                    </label>
                                    <textarea
                                        value={post.excerpt}
                                        onChange={(e) => setPost({ ...post, excerpt: e.target.value })}
                                        rows={2}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Brief summary of the post (shown in previews)"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Content * (Markdown supported)
                                    </label>
                                    <textarea
                                        value={post.content}
                                        onChange={(e) => setPost({ ...post, content: e.target.value })}
                                        rows={15}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                                        placeholder="Write your blog post content here..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Status */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">Status</h3>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">
                                    {post.isPublished ? "Published" : "Draft"}
                                </span>
                                <button
                                    onClick={() => setPost({ ...post, isPublished: !post.isPublished })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${post.isPublished ? "bg-indigo-600" : "bg-gray-200"
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${post.isPublished ? "translate-x-6" : "translate-x-1"
                                            }`}
                                    />
                                </button>
                            </div>
                            {post.publishedAt && (
                                <p className="mt-2 text-xs text-gray-500">
                                    Published: {new Date(post.publishedAt).toLocaleDateString()}
                                </p>
                            )}
                        </div>

                        {/* Metadata */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">Metadata</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Author
                                    </label>
                                    <input
                                        type="text"
                                        value={post.author}
                                        onChange={(e) => setPost({ ...post, author: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Category
                                    </label>
                                    <select
                                        value={post.category}
                                        onChange={(e) => setPost({ ...post, category: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    >
                                        {CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {cat}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tags
                                    </label>
                                    <input
                                        type="text"
                                        value={post.tags}
                                        onChange={(e) => setPost({ ...post, tags: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                        placeholder="scam, security, tips (comma-separated)"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Featured Image */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">Cover Image</h3>
                            <div>
                                <input
                                    type="url"
                                    value={post.coverImage}
                                    onChange={(e) => setPost({ ...post, coverImage: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    placeholder="https://example.com/image.jpg"
                                />
                                {post.coverImage && (
                                    <img
                                        src={post.coverImage}
                                        alt="Cover preview"
                                        className="mt-3 w-full h-32 object-cover rounded-lg"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
