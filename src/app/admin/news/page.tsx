"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/admin/AdminLayout";
import { FileText, Megaphone, Plus, ArrowRight } from "lucide-react";

interface NewsStats {
  blogPosts: {
    total: number;
    published: number;
    drafts: number;
  };
  mediaMentions: {
    total: number;
    published: number;
    featured: number;
  };
}

export default function AdminNewsPage() {
  const [stats, setStats] = useState<NewsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/admin/news/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch news stats:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">News Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage blog posts and media mentions
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Blog Posts Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <FileText className="h-6 w-6 text-indigo-600" />
                </div>
                <h2 className="ml-4 text-lg font-semibold text-gray-900">Blog Posts</h2>
              </div>
              <Link
                href="/admin/news/blog/new"
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100 transition-colors"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Post
              </Link>
            </div>
            {loading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats?.blogPosts.total || 0}
                  </p>
                  <p className="text-sm text-gray-500">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {stats?.blogPosts.published || 0}
                  </p>
                  <p className="text-sm text-gray-500">Published</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats?.blogPosts.drafts || 0}
                  </p>
                  <p className="text-sm text-gray-500">Drafts</p>
                </div>
              </div>
            )}
            <Link
              href="/admin/news/blog"
              className="mt-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700"
            >
              Manage Blog Posts
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>

          {/* Media Mentions Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Megaphone className="h-6 w-6 text-purple-600" />
                </div>
                <h2 className="ml-4 text-lg font-semibold text-gray-900">Media Mentions</h2>
              </div>
              <Link
                href="/admin/news/media/new"
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Mention
              </Link>
            </div>
            {loading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats?.mediaMentions.total || 0}
                  </p>
                  <p className="text-sm text-gray-500">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {stats?.mediaMentions.published || 0}
                  </p>
                  <p className="text-sm text-gray-500">Published</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats?.mediaMentions.featured || 0}
                  </p>
                  <p className="text-sm text-gray-500">Featured</p>
                </div>
              </div>
            )}
            <Link
              href="/admin/news/media"
              className="mt-4 inline-flex items-center text-sm text-purple-600 hover:text-purple-700"
            >
              Manage Media Mentions
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/admin/news/blog/new"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
            >
              <FileText className="h-5 w-5 text-indigo-600 mr-3" />
              <span className="font-medium text-gray-900">Write New Blog Post</span>
            </Link>
            <Link
              href="/admin/news/media/new"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
            >
              <Megaphone className="h-5 w-5 text-purple-600 mr-3" />
              <span className="font-medium text-gray-900">Add Media Mention</span>
            </Link>
            <Link
              href="/admin/news/blog"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-gray-500 hover:bg-gray-50 transition-colors"
            >
              <FileText className="h-5 w-5 text-gray-600 mr-3" />
              <span className="font-medium text-gray-900">View All Posts</span>
            </Link>
            <Link
              href="/admin/news/media"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-gray-500 hover:bg-gray-50 transition-colors"
            >
              <Megaphone className="h-5 w-5 text-gray-600 mr-3" />
              <span className="font-medium text-gray-900">View All Mentions</span>
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
