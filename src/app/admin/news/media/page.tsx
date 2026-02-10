"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/admin/AdminLayout";
import {
    Plus,
    Edit,
    Trash2,
    Eye,
    EyeOff,
    Star,
    Search,
    ArrowLeft,
    ExternalLink,
} from "lucide-react";

interface MediaMention {
    id: string;
    title: string;
    source: string;
    sourceType: string;
    sourceUrl: string | null;
    isPublished: boolean;
    isFeatured: boolean;
    mentionDate: string | null;
    createdAt: string;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
    NEWS_OUTLET: "News Outlet",
    PLATFORM: "Platform",
    USER_SHOUTOUT: "User Shoutout",
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
    NEWS_OUTLET: "bg-blue-100 text-blue-800",
    PLATFORM: "bg-purple-100 text-purple-800",
    USER_SHOUTOUT: "bg-green-100 text-green-800",
};

export default function AdminMediaListPage() {
    const [mentions, setMentions] = useState<MediaMention[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<string>("all");

    useEffect(() => {
        fetchMentions();
    }, []);

    async function fetchMentions() {
        try {
            const res = await fetch("/api/admin/news/media");
            if (res.ok) {
                const data = await res.json();
                setMentions(data.mentions || []);
            }
        } catch (error) {
            console.error("Failed to fetch mentions:", error);
        } finally {
            setLoading(false);
        }
    }

    async function togglePublish(id: string, currentStatus: boolean) {
        try {
            const res = await fetch(`/api/admin/news/media/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isPublished: !currentStatus }),
            });
            if (res.ok) {
                fetchMentions();
            }
        } catch (error) {
            console.error("Failed to toggle publish status:", error);
        }
    }

    async function toggleFeatured(id: string, currentStatus: boolean) {
        try {
            const res = await fetch(`/api/admin/news/media/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isFeatured: !currentStatus }),
            });
            if (res.ok) {
                fetchMentions();
            }
        } catch (error) {
            console.error("Failed to toggle featured status:", error);
        }
    }

    async function deleteMention(id: string) {
        if (!confirm("Are you sure you want to delete this mention?")) return;
        try {
            const res = await fetch(`/api/admin/news/media/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                fetchMentions();
            }
        } catch (error) {
            console.error("Failed to delete mention:", error);
        }
    }

    const filteredMentions = mentions.filter((mention) => {
        const matchesSearch =
            mention.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            mention.source.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter =
            filterType === "all" || mention.sourceType === filterType;
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
                            className="mr-4 p-2 text-muted-foreground hover:text-muted-foreground rounded-2xl hover:bg-secondary"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Media Mentions</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Track press coverage and community shoutouts
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/admin/news/media/new"
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-2xl hover:bg-purple-700 transition-colors"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Mention
                    </Link>
                </div>

                {/* Filters */}
                <div className="bg-card rounded-2xl shadow p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search mentions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            />
                        </div>
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="px-4 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        >
                            <option value="all">All Types</option>
                            <option value="NEWS_OUTLET">News Outlets</option>
                            <option value="PLATFORM">Platforms</option>
                            <option value="USER_SHOUTOUT">User Shoutouts</option>
                        </select>
                    </div>
                </div>

                {/* Mentions Table */}
                <div className="bg-card rounded-2xl shadow overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600 mx-auto"></div>
                        </div>
                    ) : filteredMentions.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>No media mentions found</p>
                            <Link
                                href="/admin/news/media/new"
                                className="mt-2 inline-flex items-center text-purple-600 hover:text-purple-700"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Add your first mention
                            </Link>
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-secondary/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Title / Source
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Type
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
                                {filteredMentions.map((mention) => (
                                    <tr key={mention.id} className="hover:bg-secondary">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                {mention.isFeatured && (
                                                    <Star className="h-4 w-4 text-yellow-500 mr-2 fill-yellow-500" />
                                                )}
                                                <div>
                                                    <p className="font-medium text-foreground">{mention.title}</p>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <span>{mention.source}</span>
                                                        {mention.sourceUrl && (
                                                            <a
                                                                href={mention.sourceUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-purple-600 hover:text-purple-700"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`px-2 py-1 text-xs font-medium rounded-full ${SOURCE_TYPE_COLORS[mention.sourceType] || "bg-secondary text-foreground"
                                                    }`}
                                            >
                                                {SOURCE_TYPE_LABELS[mention.sourceType] || mention.sourceType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${mention.isPublished
                                                        ? "bg-green-100 text-green-800"
                                                        : "bg-yellow-100 text-yellow-800"
                                                    }`}
                                            >
                                                {mention.isPublished ? (
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
                                            {mention.mentionDate
                                                ? formatDate(mention.mentionDate)
                                                : formatDate(mention.createdAt)}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button
                                                onClick={() => toggleFeatured(mention.id, mention.isFeatured)}
                                                className={`inline-flex items-center p-1.5 rounded-2xl ${mention.isFeatured
                                                        ? "text-yellow-500 hover:bg-yellow-50"
                                                        : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-50"
                                                    }`}
                                                title={mention.isFeatured ? "Remove from featured" : "Add to featured"}
                                            >
                                                <Star className={`h-4 w-4 ${mention.isFeatured ? "fill-yellow-500" : ""}`} />
                                            </button>
                                            <button
                                                onClick={() => togglePublish(mention.id, mention.isPublished)}
                                                className="inline-flex items-center p-1.5 text-muted-foreground hover:text-purple-600 rounded-2xl hover:bg-purple-50"
                                                title={mention.isPublished ? "Unpublish" : "Publish"}
                                            >
                                                {mention.isPublished ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </button>
                                            <Link
                                                href={`/admin/news/media/${mention.id}`}
                                                className="inline-flex items-center p-1.5 text-muted-foreground hover:text-purple-600 rounded-2xl hover:bg-purple-50"
                                                title="Edit"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Link>
                                            <button
                                                onClick={() => deleteMention(mention.id)}
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
