"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/admin/AdminLayout";
import { ArrowLeft, Save, Trash2, Eye, Star } from "lucide-react";

interface MediaMention {
    id?: string;
    title: string;
    source: string;
    sourceType: string;
    sourceUrl: string;
    logoUrl: string;
    description: string;
    quoteText: string;
    mentionDate: string;
    isPublished: boolean;
    isFeatured: boolean;
}

const SOURCE_TYPES = [
    { value: "NEWS_OUTLET", label: "News Outlet" },
    { value: "PLATFORM", label: "Platform" },
    { value: "USER_SHOUTOUT", label: "User Shoutout" },
];

export default function AdminMediaEditorPage() {
    const router = useRouter();
    const params = useParams();
    const isNew = params.id === "new";

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [mention, setMention] = useState<MediaMention>({
        title: "",
        source: "",
        sourceType: "NEWS_OUTLET",
        sourceUrl: "",
        logoUrl: "",
        description: "",
        quoteText: "",
        mentionDate: "",
        isPublished: false,
        isFeatured: false,
    });

    useEffect(() => {
        if (!isNew) {
            fetchMention();
        }
    }, [isNew]);

    async function fetchMention() {
        try {
            const res = await fetch(`/api/admin/news/media/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setMention({
                    ...data.mention,
                    mentionDate: data.mention.mentionDate
                        ? new Date(data.mention.mentionDate).toISOString().split("T")[0]
                        : "",
                });
            } else {
                router.push("/admin/news/media");
            }
        } catch (error) {
            console.error("Failed to fetch mention:", error);
            router.push("/admin/news/media");
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(publish: boolean = false) {
        if (!mention.title.trim()) {
            alert("Please enter a title");
            return;
        }
        if (!mention.source.trim()) {
            alert("Please enter a source");
            return;
        }

        setSaving(true);
        try {
            const body = {
                ...mention,
                isPublished: publish ? true : mention.isPublished,
                mentionDate: mention.mentionDate || null,
            };

            const url = isNew ? "/api/admin/news/media" : `/api/admin/news/media/${params.id}`;
            const method = isNew ? "POST" : "PUT";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                router.push("/admin/news/media");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to save mention");
            }
        } catch (error) {
            console.error("Failed to save mention:", error);
            alert("Failed to save mention");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this mention? This cannot be undone.")) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/news/media/${params.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                router.push("/admin/news/media");
            }
        } catch (error) {
            console.error("Failed to delete mention:", error);
        }
    }

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
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
                            href="/admin/news/media"
                            className="mr-4 p-2 text-muted-foreground hover:text-muted-foreground rounded-2xl hover:bg-secondary"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                {isNew ? "New Media Mention" : "Edit Media Mention"}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {isNew ? "Add a new media mention" : "Update media mention details"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isNew && (
                            <button
                                onClick={handleDelete}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </button>
                        )}
                        <button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-2xl hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            Save Draft
                        </button>
                        <button
                            onClick={() => handleSave(true)}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-2xl hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                            {mention.isPublished ? (
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
                        <div className="bg-card rounded-2xl shadow p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={mention.title}
                                        onChange={(e) => setMention({ ...mention, title: e.target.value })}
                                        className="w-full px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        placeholder="e.g., ScamDunk Featured in TechCrunch"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-1">
                                            Source *
                                        </label>
                                        <input
                                            type="text"
                                            value={mention.source}
                                            onChange={(e) => setMention({ ...mention, source: e.target.value })}
                                            className="w-full px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                            placeholder="e.g., TechCrunch, @user123"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-1">
                                            Source Type
                                        </label>
                                        <select
                                            value={mention.sourceType}
                                            onChange={(e) => setMention({ ...mention, sourceType: e.target.value })}
                                            className="w-full px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        >
                                            {SOURCE_TYPES.map((type) => (
                                                <option key={type.value} value={type.value}>
                                                    {type.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Source URL
                                    </label>
                                    <input
                                        type="url"
                                        value={mention.sourceUrl}
                                        onChange={(e) => setMention({ ...mention, sourceUrl: e.target.value })}
                                        className="w-full px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        placeholder="https://example.com/article"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={mention.description}
                                        onChange={(e) => setMention({ ...mention, description: e.target.value })}
                                        rows={3}
                                        className="w-full px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        placeholder="Brief description of what the mention is about"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Quote Text
                                    </label>
                                    <textarea
                                        value={mention.quoteText}
                                        onChange={(e) => setMention({ ...mention, quoteText: e.target.value })}
                                        rows={2}
                                        className="w-full px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        placeholder="Featured quote from the mention (if applicable)"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Status */}
                        <div className="bg-card rounded-2xl shadow p-6">
                            <h3 className="text-sm font-medium text-foreground mb-4">Status</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">
                                        {mention.isPublished ? "Published" : "Draft"}
                                    </span>
                                    <button
                                        onClick={() => setMention({ ...mention, isPublished: !mention.isPublished })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${mention.isPublished ? "bg-purple-600" : "bg-secondary"
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mention.isPublished ? "translate-x-6" : "translate-x-1"
                                                }`}
                                        />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between border-t pt-4">
                                    <div className="flex items-center">
                                        <Star className={`h-4 w-4 mr-2 ${mention.isFeatured ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                                        <span className="text-sm text-muted-foreground">Featured</span>
                                    </div>
                                    <button
                                        onClick={() => setMention({ ...mention, isFeatured: !mention.isFeatured })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${mention.isFeatured ? "bg-yellow-500" : "bg-secondary"
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mention.isFeatured ? "translate-x-6" : "translate-x-1"
                                                }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Metadata */}
                        <div className="bg-card rounded-2xl shadow p-6">
                            <h3 className="text-sm font-medium text-foreground mb-4">Details</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Mention Date
                                    </label>
                                    <input
                                        type="date"
                                        value={mention.mentionDate}
                                        onChange={(e) => setMention({ ...mention, mentionDate: e.target.value })}
                                        className="w-full px-3 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Logo URL
                                    </label>
                                    <input
                                        type="url"
                                        value={mention.logoUrl}
                                        onChange={(e) => setMention({ ...mention, logoUrl: e.target.value })}
                                        className="w-full px-3 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                                        placeholder="https://example.com/logo.png"
                                    />
                                    {mention.logoUrl && (
                                        <img
                                            src={mention.logoUrl}
                                            alt="Logo preview"
                                            className="mt-3 w-24 h-24 object-contain rounded-2xl border"
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
            </div>
        </AdminLayout>
    );
}
