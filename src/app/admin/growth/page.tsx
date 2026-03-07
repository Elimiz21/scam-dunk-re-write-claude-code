"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Link from "next/link";
import {
  Megaphone,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  MessageSquare,
  Eye,
} from "lucide-react";

interface Stats {
  [key: string]: number;
}

interface EngagementStats {
  totalPosted: number;
  trending: number;
  needsFollowUp: number;
}

export default function GrowthDashboard() {
  const [stats, setStats] = useState<Stats>({});
  const [engagementStats, setEngagementStats] = useState<EngagementStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [oppRes, engRes] = await Promise.all([
        fetch("/api/admin/growth/opportunities?status=draft_ready&limit=1"),
        fetch("/api/admin/growth/engagement?limit=1"),
      ]);

      if (oppRes.ok) {
        const data = await oppRes.json();
        setStats(data.stats || {});
      }

      if (engRes.ok) {
        const data = await engRes.json();
        setEngagementStats(data.stats || null);
      }
    } catch (error) {
      console.error("Failed to load growth stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      label: "Awaiting Review",
      value: stats.draft_ready || 0,
      icon: Clock,
      color: "text-yellow-500",
      href: "/admin/growth/queue",
    },
    {
      label: "Approved",
      value: stats.approved || 0,
      icon: CheckCircle,
      color: "text-green-500",
      href: "/admin/growth/queue?status=approved",
    },
    {
      label: "Posted",
      value: stats.posted || 0,
      icon: MessageSquare,
      color: "text-blue-500",
      href: "/admin/growth/history",
    },
    {
      label: "Skipped",
      value: stats.skipped || 0,
      icon: XCircle,
      color: "text-muted-foreground",
      href: "/admin/growth/queue?status=skipped",
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="h-6 w-6" />
              Growth Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered social media outreach for Reddit and X
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">{card.value}</div>
                  <div className="text-xs text-muted-foreground">{card.label}</div>
                </Link>
              ))}
            </div>

            {/* Engagement Stats */}
            {engagementStats && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Engagement
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {engagementStats.totalPosted}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Posted</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-500">
                      {engagementStats.trending}
                    </div>
                    <div className="text-xs text-muted-foreground">Trending</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-500">
                      {engagementStats.needsFollowUp}
                    </div>
                    <div className="text-xs text-muted-foreground">Needs Follow-up</div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/admin/growth/queue"
                className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
              >
                <Eye className="h-6 w-6 text-primary mb-2" />
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  Review Queue
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Review and approve AI-generated reply drafts
                </p>
              </Link>

              <Link
                href="/admin/growth/history"
                className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
              >
                <TrendingUp className="h-6 w-6 text-primary mb-2" />
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  Engagement History
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Track performance of posted replies
                </p>
              </Link>

              <Link
                href="/admin/growth/settings"
                className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
              >
                <Megaphone className="h-6 w-6 text-primary mb-2" />
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  Settings
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure discovery targets, voice, and scheduling
                </p>
              </Link>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
