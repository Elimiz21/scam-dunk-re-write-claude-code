"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  ExternalLink,
  Copy,
  Check,
  X,
  Edit3,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Filter,
  Clock,
  TrendingUp,
  Megaphone,
} from "lucide-react";

interface Draft {
  id: string;
  replyText: string;
  includesLink: boolean;
  status: string;
  editedText: string | null;
  variant: number;
  postedAt: string | null;
  postedUrl: string | null;
}

interface Opportunity {
  id: string;
  platform: string;
  source: string;
  postUrl: string;
  postTitle: string | null;
  postBody: string | null;
  author: string | null;
  postDate: string | null;
  engagement: any;
  discoveredVia: string;
  relevanceScore: number;
  engagementScore: number;
  urgencyScore: number;
  overallScore: number;
  status: string;
  createdAt: string;
  drafts: Draft[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function GrowthQueue() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("draft_ready");
  const [platformFilter, setPlatformFilter] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        page: page.toString(),
        limit: "10",
      });
      if (platformFilter) params.set("platform", platformFilter);

      const res = await fetch(`/api/admin/growth/opportunities?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data.opportunities || []);
        setPagination(data.pagination || null);
        setStats(data.stats || {});
      }
    } catch (error) {
      console.error("Failed to load queue:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, platformFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAction(draftId: string, action: string, extra?: any) {
    setActionLoading(draftId);
    try {
      const res = await fetch("/api/admin/growth/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, action, ...extra }),
      });

      if (res.ok) {
        // If action is "posted" for Reddit, we're done
        // Reload data to reflect changes
        await loadData(pagination?.page || 1);
      }
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
    } finally {
      setActionLoading(null);
      setEditingId(null);
    }
  }

  async function handleCopyAndOpen(opp: Opportunity, draft: Draft) {
    const replyText = draft.editedText || draft.replyText;

    // Copy reply text to clipboard
    try {
      await navigator.clipboard.writeText(replyText);
      setCopiedId(draft.id);
      setTimeout(() => setCopiedId(null), 3000);
    } catch {
      // Fallback: select text in a textarea
      const textarea = document.createElement("textarea");
      textarea.value = replyText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(draft.id);
      setTimeout(() => setCopiedId(null), 3000);
    }

    // Open the original post in a new tab
    window.open(opp.postUrl, "_blank", "noopener,noreferrer");

    // Mark as posted (user will paste manually on Reddit)
    await handleAction(draft.id, "posted");
  }

  function getScoreColor(score: number): string {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-muted-foreground";
  }

  function getPlatformBadge(platform: string): string {
    return platform === "reddit"
      ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
      : "bg-blue-500/10 text-blue-500 border-blue-500/20";
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-6 w-6" />
              Review Queue
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review AI-generated replies. Copy &amp; Open for Reddit, auto-post for X.
            </p>
          </div>
          <button
            onClick={() => loadData()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Status:</span>
          </div>
          {["draft_ready", "approved", "posted", "skipped"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === s
                  ? "gradient-brand text-white border-transparent"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.replace("_", " ")} ({stats[s] || 0})
            </button>
          ))}

          <div className="ml-4 flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Platform:</span>
          </div>
          {["", "reddit", "x"].map((p) => (
            <button
              key={p || "all"}
              onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                platformFilter === p
                  ? "gradient-brand text-white border-transparent"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p || "All"}
            </button>
          ))}
        </div>

        {/* Queue */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No items in queue</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The discovery agent will find new opportunities on its next run.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {opportunities.map((opp) => {
              const draft = opp.drafts[0];
              if (!draft && statusFilter === "draft_ready") return null;

              return (
                <div
                  key={opp.id}
                  className="bg-card border border-border rounded-lg overflow-hidden"
                >
                  {/* Post Header */}
                  <div className="px-6 py-4 border-b border-border/50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getPlatformBadge(
                              opp.platform
                            )}`}
                          >
                            {opp.platform === "reddit" ? `r/${opp.source}` : "X"}
                          </span>
                          {opp.author && (
                            <span className="text-xs text-muted-foreground">
                              by {opp.author}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(opp.createdAt)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            via {opp.discoveredVia}
                          </span>
                        </div>
                        <h3 className="font-medium text-foreground truncate">
                          {opp.postTitle || "Untitled post"}
                        </h3>
                        {opp.postBody && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {opp.postBody}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className={`text-lg font-bold ${getScoreColor(opp.overallScore)}`}>
                            {opp.overallScore}
                          </div>
                          <div className="text-xs text-muted-foreground">Score</div>
                        </div>
                        <a
                          href={opp.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                          title="View original post"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-muted-foreground">
                        Relevance: <span className={getScoreColor(opp.relevanceScore)}>{opp.relevanceScore}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Engagement: <span className={getScoreColor(opp.engagementScore)}>{opp.engagementScore}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Urgency: <span className={getScoreColor(opp.urgencyScore)}>{opp.urgencyScore}</span>
                      </span>
                      {opp.engagement && (
                        <span className="text-xs text-muted-foreground">
                          {opp.engagement.upvotes !== undefined && `${opp.engagement.upvotes} upvotes`}
                          {opp.engagement.comments !== undefined && ` / ${opp.engagement.comments} comments`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Draft */}
                  {draft && (
                    <div className="px-6 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Draft Reply {draft.includesLink && "(includes ScamDunk link)"}
                        </span>
                      </div>

                      {editingId === draft.id ? (
                        <div className="space-y-3">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={6}
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAction(draft.id, "edit", { editedText: editText })}
                              className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90"
                            >
                              Save Edit
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 text-xs font-medium bg-secondary text-foreground rounded-md hover:bg-secondary/80"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-background border border-border/50 rounded-md p-4 text-sm text-foreground whitespace-pre-wrap">
                          {draft.editedText || draft.replyText}
                        </div>
                      )}

                      {/* Actions */}
                      {draft.status !== "posted" && draft.status !== "skipped" && editingId !== draft.id && (
                        <div className="flex items-center gap-2 mt-4">
                          {opp.platform === "reddit" ? (
                            /* REDDIT: Copy text + open post in new tab */
                            <button
                              onClick={() => handleCopyAndOpen(opp, draft)}
                              disabled={actionLoading === draft.id}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium gradient-brand text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {copiedId === draft.id ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  Copied! Opening post...
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4" />
                                  Copy &amp; Open in Reddit
                                </>
                              )}
                            </button>
                          ) : (
                            /* X: Auto-post via API */
                            <button
                              onClick={() => handleAction(draft.id, "approve")}
                              disabled={actionLoading === draft.id}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium gradient-brand text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              <Check className="h-4 w-4" />
                              Approve &amp; Post to X
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setEditingId(draft.id);
                              setEditText(draft.editedText || draft.replyText);
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary text-foreground rounded-md hover:bg-secondary/80 transition-colors"
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit
                          </button>

                          <button
                            onClick={() => handleAction(draft.id, "skip")}
                            disabled={actionLoading === draft.id}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-4 w-4" />
                            Skip
                          </button>
                        </div>
                      )}

                      {draft.status === "posted" && (
                        <div className="flex items-center gap-2 mt-4 text-green-500 text-sm">
                          <Check className="h-4 w-4" />
                          Posted {draft.postedAt ? formatDate(draft.postedAt) : ""}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadData(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="p-2 rounded-md bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => loadData(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-2 rounded-md bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
