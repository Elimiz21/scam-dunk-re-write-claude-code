"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  TrendingUp,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  ArrowUp,
  Heart,
  Repeat,
  Eye,
} from "lucide-react";

interface EngagementItem {
  id: string;
  checkedAt: string;
  upvotes: number | null;
  comments: number | null;
  likes: number | null;
  retweets: number | null;
  replies: number | null;
  views: number | null;
  isTrending: boolean;
  needsFollowUp: boolean;
  draft: {
    id: string;
    replyText: string;
    postedAt: string | null;
    opportunity: {
      id: string;
      platform: string;
      source: string;
      postUrl: string;
      postTitle: string | null;
      overallScore: number;
    };
  };
}

interface EngagementStats {
  totalPosted: number;
  trending: number;
  needsFollowUp: number;
}

export default function GrowthHistory() {
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "trending" | "followUp">("all");

  useEffect(() => {
    loadData();
  }, [filter]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter === "trending") params.set("trending", "true");
      if (filter === "followUp") params.set("followUp", "true");

      const res = await fetch(`/api/admin/growth/engagement?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEngagements(data.engagements || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error("Failed to load engagement data:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              Engagement History
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track performance of your posted replies
            </p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-foreground">{stats.totalPosted}</div>
              <div className="text-xs text-muted-foreground">Total Posted</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-green-500">{stats.trending}</div>
              <div className="text-xs text-muted-foreground">Trending</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-500">{stats.needsFollowUp}</div>
              <div className="text-xs text-muted-foreground">Needs Follow-up</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2">
          {(["all", "trending", "followUp"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                filter === f
                  ? "gradient-brand text-white border-transparent"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f === "trending" ? "Trending" : "Needs Follow-up"}
            </button>
          ))}
        </div>

        {/* Engagement List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : engagements.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No engagement data yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Post some replies first, then the monitoring agent will track engagement.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {engagements.map((eng) => (
              <div
                key={eng.id}
                className={`bg-card border rounded-lg p-4 ${
                  eng.isTrending
                    ? "border-green-500/30"
                    : eng.needsFollowUp
                    ? "border-yellow-500/30"
                    : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                          eng.draft.opportunity.platform === "reddit"
                            ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                            : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                        }`}
                      >
                        {eng.draft.opportunity.platform === "reddit"
                          ? `r/${eng.draft.opportunity.source}`
                          : "X"}
                      </span>
                      {eng.isTrending && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                          Trending
                        </span>
                      )}
                      {eng.needsFollowUp && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Follow-up
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Checked {formatDate(eng.checkedAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">
                      {eng.draft.opportunity.postTitle || "Untitled"}
                    </p>
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-4 shrink-0">
                    {eng.upvotes !== null && (
                      <div className="flex items-center gap-1 text-sm">
                        <ArrowUp className="h-3.5 w-3.5 text-orange-500" />
                        <span>{eng.upvotes}</span>
                      </div>
                    )}
                    {eng.comments !== null && (
                      <div className="flex items-center gap-1 text-sm">
                        <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                        <span>{eng.comments}</span>
                      </div>
                    )}
                    {eng.likes !== null && (
                      <div className="flex items-center gap-1 text-sm">
                        <Heart className="h-3.5 w-3.5 text-red-500" />
                        <span>{eng.likes}</span>
                      </div>
                    )}
                    {eng.retweets !== null && (
                      <div className="flex items-center gap-1 text-sm">
                        <Repeat className="h-3.5 w-3.5 text-green-500" />
                        <span>{eng.retweets}</span>
                      </div>
                    )}
                    {eng.views !== null && (
                      <div className="flex items-center gap-1 text-sm">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{eng.views}</span>
                      </div>
                    )}
                    <a
                      href={eng.draft.opportunity.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
