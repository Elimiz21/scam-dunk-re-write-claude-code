"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Globe,
  Monitor,
  Play,
  Pause,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Settings,
  Trash2,
  Camera,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  Hash,
  MessageSquare,
} from "lucide-react";

// ---------- Types ----------

interface PlatformConfig {
  id: string;
  platform: string;
  isEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginStatus: string | null;
  consecutiveFailures: number;
  autoDisabled: boolean;
  autoDisabledAt: string | null;
  dailyPageLimit: number;
  dailyPagesUsed: number;
  dailyResetDate: string | null;
  monitorTargets: string | null;
  notes: string | null;
}

interface BrowserSession {
  id: string;
  scanDate: string;
  platform: string;
  status: string;
  tickersSearched: string;
  pagesVisited: number;
  mentionsFound: number;
  screenshotsTaken: number;
  browserMinutes: number;
  memoryPeakMb: number | null;
  errors: string | null;
  suspensionCount: number;
  resumedFrom: string | null;
  createdAt: string;
  _count: { evidence: number };
}

interface Evidence {
  id: string;
  ticker: string;
  platform: string;
  url: string | null;
  textContent: string | null;
  author: string | null;
  promotionScore: number;
  screenshotPath: string | null;
  createdAt: string;
  session: { platform: string; scanDate: string };
}

interface PlatformBreakdown {
  platform: string;
  sessions: number;
  mentions: number;
  pagesVisited: number;
  browserMinutes: number;
}

interface Stats {
  totalSessions: number;
  todaySessions: number;
  weekSessions: number;
  totalEvidence: number;
  runningSessions: number;
  platformBreakdown: PlatformBreakdown[];
  avgBrowserMinutes: number;
  totalSuspensions: number;
}

// ---------- Helpers ----------

const platformDisplayNames: Record<string, string> = {
  discord: "Discord",
  reddit: "Reddit",
  twitter: "Twitter/X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const platformColors: Record<string, string> = {
  discord: "bg-indigo-100 text-indigo-700",
  reddit: "bg-orange-100 text-orange-700",
  twitter: "bg-sky-100 text-sky-700",
  instagram: "bg-pink-100 text-pink-700",
  facebook: "bg-blue-100 text-blue-700",
  tiktok: "bg-rose-100 text-rose-700",
};

const platformIcons: Record<string, typeof Globe> = {
  discord: Hash,
  reddit: MessageSquare,
  twitter: Globe,
  instagram: Camera,
  facebook: Globe,
  tiktok: Globe,
};

function getStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="h-3 w-3" /> Completed
        </span>
      );
    case "RUNNING":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <Clock className="h-3 w-3 animate-spin" /> Running
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <Clock className="h-3 w-3" /> Pending
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      );
    case "SUSPENDED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Pause className="h-3 w-3" /> Suspended
        </span>
      );
    case "RESUMED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700">
          <Play className="h-3 w-3" /> Resumed
        </span>
      );
    default:
      return (
        <span className="text-xs text-muted-foreground">{status}</span>
      );
  }
}

// ---------- Component ----------

export default function BrowserAgentsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [platformConfigs, setPlatformConfigs] = useState<PlatformConfig[]>([]);
  const [recentEvidence, setRecentEvidence] = useState<Evidence[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // UI state
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [togglingPlatform, setTogglingPlatform] = useState<string | null>(null);

  // Scan modal state
  const [scanTickers, setScanTickers] = useState("");
  const [scanPlatforms, setScanPlatforms] = useState<string[]>([]);

  // Config modal state
  const [configDailyLimit, setConfigDailyLimit] = useState(100);
  const [configNotes, setConfigNotes] = useState("");
  const [configTargets, setConfigTargets] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/browser-agents?page=${pagination.page}&limit=${pagination.limit}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStats(data.stats);
      setSessions(data.sessions);
      setPlatformConfigs(data.platformConfigs);
      setRecentEvidence(data.recentEvidence);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function togglePlatform(platform: string) {
    setTogglingPlatform(platform);
    try {
      const res = await fetch("/api/admin/browser-agents/platforms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, action: "toggle" }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setTogglingPlatform(null);
    }
  }

  async function resetFailures(platform: string) {
    try {
      const res = await fetch("/api/admin/browser-agents/platforms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, action: "reset_failures" }),
      });
      if (!res.ok) throw new Error("Failed to reset");
      setSuccess(`Failures reset for ${platformDisplayNames[platform]}`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  async function triggerScan() {
    setTriggering(true);
    setError("");
    try {
      // If tickers provided, use them. Otherwise, let the API auto-pull from daily scan.
      const tickers = scanTickers.trim()
        ? scanTickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean)
        : undefined;
      const res = await fetch("/api/admin/browser-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger_scan",
          tickers,
          platforms: scanPlatforms.length > 0 ? scanPlatforms : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger scan");
      setSuccess(data.message);
      setShowScanModal(false);
      setScanTickers("");
      setScanPlatforms([]);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  async function clearOldSessions() {
    try {
      const res = await fetch("/api/admin/browser-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_sessions", olderThanDays: 30 }),
      });
      if (!res.ok) throw new Error("Failed to clear");
      const data = await res.json();
      setSuccess(`Cleared ${data.deleted} old sessions`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    }
  }

  async function saveConfig(platform: string) {
    try {
      // Save daily limit and notes
      await fetch("/api/admin/browser-agents/platforms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          action: "update_config",
          dailyPageLimit: configDailyLimit,
          notes: configNotes,
        }),
      });

      // Save targets if provided
      if (configTargets.trim()) {
        const targets = JSON.parse(configTargets);
        await fetch("/api/admin/browser-agents/platforms", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform,
            action: "update_targets",
            targets,
          }),
        });
      }

      setSuccess(`Configuration updated for ${platformDisplayNames[platform]}`);
      setShowConfigModal(null);
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save config"
      );
    }
  }

  function openConfigModal(config: PlatformConfig) {
    setConfigDailyLimit(config.dailyPageLimit);
    setConfigNotes(config.notes || "");
    setConfigTargets(config.monitorTargets || "");
    setShowConfigModal(config.platform);
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-2xl" />
            ))}
          </div>
          <div className="h-96 bg-muted rounded-2xl" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Browser Agents
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor and control browser-based social media scanning
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowScanModal(true)}
              className="gradient-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Launch Scan
            </button>
            <button
              onClick={fetchData}
              className="px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && (
          <AlertBanner
            type="error"
            title="Error"
            message={error}
            onDismiss={() => setError("")}
          />
        )}
        {success && (
          <AlertBanner
            type="success"
            title="Success"
            message={success}
            onDismiss={() => setSuccess("")}
          />
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl shadow p-5 border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg gradient-brand-subtle">
                  <Monitor className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Running Now
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.runningSessions}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl shadow p-5 border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Today&apos;s Scans
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.todaySessions}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl shadow p-5 border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Eye className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Total Evidence
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.totalEvidence}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl shadow p-5 border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Suspensions (7d)
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.totalSuspensions}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Platform Controls */}
        <div className="bg-card rounded-2xl shadow border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">
              Platform Controls
            </h2>
            <span className="text-xs text-muted-foreground">
              {platformConfigs.filter((p) => p.isEnabled).length}/
              {platformConfigs.length} enabled
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {platformConfigs.map((config) => {
              const Icon = platformIcons[config.platform] || Globe;
              const colorClass =
                platformColors[config.platform] || "bg-gray-100 text-gray-700";
              const weekData = stats?.platformBreakdown.find(
                (p) => p.platform === config.platform
              );

              return (
                <div
                  key={config.platform}
                  className={`rounded-xl border p-4 transition-all ${
                    config.isEnabled
                      ? "border-border hover:shadow-sm"
                      : "border-border/50 opacity-60"
                  } ${config.autoDisabled ? "border-red-200 bg-red-50/30" : ""}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-foreground">
                        {platformDisplayNames[config.platform] ||
                          config.platform}
                      </span>
                    </div>
                    <button
                      onClick={() => togglePlatform(config.platform)}
                      disabled={togglingPlatform === config.platform}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        config.isEnabled ? "gradient-brand" : "bg-secondary"
                      }`}
                    >
                      {togglingPlatform === config.platform ? (
                        <Loader2 className="h-4 w-4 animate-spin absolute left-1/2 -translate-x-1/2 text-white" />
                      ) : (
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            config.isEnabled
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      )}
                    </button>
                  </div>

                  {/* Status indicators */}
                  <div className="space-y-1.5 text-xs">
                    {config.autoDisabled && (
                      <div className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-3 w-3" />
                        Auto-disabled ({config.consecutiveFailures} failures)
                        <button
                          onClick={() => resetFailures(config.platform)}
                          className="ml-auto text-primary hover:underline"
                        >
                          Reset
                        </button>
                      </div>
                    )}

                    {config.lastLoginAt && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Last login</span>
                        <span>
                          {new Date(config.lastLoginAt).toLocaleDateString()}
                          {config.lastLoginStatus && (
                            <span
                              className={`ml-1 ${
                                config.lastLoginStatus === "SUCCESS"
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              ({config.lastLoginStatus})
                            </span>
                          )}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-muted-foreground">
                      <span>Daily pages</span>
                      <span>
                        {config.dailyPagesUsed}/{config.dailyPageLimit}
                      </span>
                    </div>

                    {weekData && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>This week</span>
                        <span>
                          {weekData.sessions} scans, {weekData.mentions} finds
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => openConfigModal(config)}
                      className="flex-1 text-xs text-center py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Settings className="h-3 w-3 inline mr-1" />
                      Configure
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platform Breakdown Chart (weekly) */}
        {stats && stats.platformBreakdown.length > 0 && (
          <div className="bg-card rounded-2xl shadow border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Weekly Activity by Platform
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {stats.platformBreakdown.map((p) => {
                const Icon = platformIcons[p.platform] || Globe;
                const colorClass =
                  platformColors[p.platform] || "bg-gray-100 text-gray-700";
                return (
                  <div
                    key={p.platform}
                    className="flex flex-col items-center p-3 rounded-xl border border-border"
                  >
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium text-foreground mt-2">
                      {platformDisplayNames[p.platform] || p.platform}
                    </span>
                    <span className="text-lg font-bold text-foreground">
                      {p.mentions}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      mentions found
                    </span>
                    <div className="mt-1 text-xs text-muted-foreground space-y-0.5 text-center">
                      <div>{p.pagesVisited} pages</div>
                      <div>{p.browserMinutes} min</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Session History */}
        <div className="bg-card rounded-2xl shadow border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">
              Session History
              {pagination.total > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({pagination.total} total)
                </span>
              )}
            </h2>
            <button
              onClick={clearOldSessions}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Clear 30d+
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="p-12 text-center">
              <Monitor className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                No browser agent sessions yet.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Launch a scan to start collecting social media evidence.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Platform
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Tickers
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Pages
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Mentions
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Evidence
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Memory
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => {
                      const Icon =
                        platformIcons[session.platform] || Globe;
                      const colorClass =
                        platformColors[session.platform] ||
                        "bg-gray-100 text-gray-700";
                      const isExpanded = expandedSession === session.id;
                      let tickers: string[] = [];
                      try {
                        tickers = JSON.parse(session.tickersSearched);
                      } catch {
                        tickers = [session.tickersSearched];
                      }
                      let errors: string[] = [];
                      try {
                        if (session.errors)
                          errors = JSON.parse(session.errors);
                      } catch {
                        /* ignore */
                      }

                      return (
                        <tr
                          key={session.id}
                          className={`border-b border-border hover:bg-muted/20 transition-colors cursor-pointer ${
                            session.status === "FAILED"
                              ? "bg-red-50/20"
                              : session.status === "RUNNING"
                              ? "bg-blue-50/20"
                              : ""
                          }`}
                          onClick={() =>
                            setExpandedSession(
                              isExpanded ? null : session.id
                            )
                          }
                        >
                          <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                            {new Date(
                              session.scanDate
                            ).toLocaleDateString()}
                            <p className="text-xs text-muted-foreground">
                              {new Date(
                                session.scanDate
                              ).toLocaleTimeString()}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
                            >
                              <Icon className="h-3 w-3" />
                              {platformDisplayNames[session.platform] ||
                                session.platform}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(session.status)}
                            {session.suspensionCount > 0 && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                {session.suspensionCount}x suspended
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {tickers.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-foreground"
                                >
                                  ${t}
                                </span>
                              ))}
                              {tickers.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{tickers.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {session.pagesVisited}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            {session.mentionsFound}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {session._count.evidence}
                            {session.screenshotsTaken > 0 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({session.screenshotsTaken}{" "}
                                <Camera className="h-3 w-3 inline" />)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {session.browserMinutes.toFixed(1)} min
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {session.memoryPeakMb
                              ? `${session.memoryPeakMb.toFixed(0)} MB`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing{" "}
                    {(pagination.page - 1) * pagination.limit + 1}
                    &ndash;
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )}{" "}
                    of {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setPagination((p) => ({
                          ...p,
                          page: Math.max(1, p.page - 1),
                        }))
                      }
                      disabled={pagination.page <= 1}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-foreground px-2">
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPagination((p) => ({
                          ...p,
                          page: Math.min(p.totalPages, p.page + 1),
                        }))
                      }
                      disabled={pagination.page >= pagination.totalPages}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Recent Evidence */}
        {recentEvidence.length > 0 && (
          <div className="bg-card rounded-2xl shadow border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                Recent Evidence Collected
              </h2>
            </div>
            <div className="divide-y divide-border">
              {recentEvidence.map((ev) => {
                const Icon = platformIcons[ev.platform] || Globe;
                const colorClass =
                  platformColors[ev.platform] ||
                  "bg-gray-100 text-gray-700";
                return (
                  <div
                    key={ev.id}
                    className="px-6 py-4 flex items-start gap-4"
                  >
                    <div className={`p-1.5 rounded-lg ${colorClass} mt-0.5`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-foreground">
                          ${ev.ticker}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            ev.promotionScore >= 60
                              ? "bg-red-100 text-red-700"
                              : ev.promotionScore >= 30
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {ev.promotionScore}
                        </span>
                        {ev.author && (
                          <span className="text-xs text-muted-foreground">
                            by {ev.author}
                          </span>
                        )}
                      </div>
                      {ev.textContent && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {ev.textContent.substring(0, 200)}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {ev.url && (
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            View source
                          </a>
                        )}
                        {ev.screenshotPath && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Camera className="h-3 w-3" />
                            Screenshot saved
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Launch Scan Modal */}
        {showScanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-lg">
              <h3 className="text-lg font-medium text-foreground mb-4">
                Launch Browser Scan
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Tickers (optional)
                  </label>
                  <input
                    type="text"
                    value={scanTickers}
                    onChange={(e) => setScanTickers(e.target.value)}
                    placeholder="Leave empty to auto-scan high-risk stocks from daily scan"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter comma-separated tickers (e.g. ACME, DEFG), or leave empty to automatically use high-risk stocks from the latest daily scan.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Platforms (leave empty for all enabled)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {platformConfigs
                      .filter((p) => p.isEnabled)
                      .map((p) => {
                        const selected = scanPlatforms.includes(
                          p.platform
                        );
                        return (
                          <button
                            key={p.platform}
                            onClick={() =>
                              setScanPlatforms((prev) =>
                                selected
                                  ? prev.filter((x) => x !== p.platform)
                                  : [...prev, p.platform]
                              )
                            }
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              selected
                                ? "gradient-brand text-white border-transparent"
                                : "border-border text-foreground hover:bg-muted"
                            }`}
                          >
                            {platformDisplayNames[p.platform] || p.platform}
                          </button>
                        );
                      })}
                    {platformConfigs.filter((p) => p.isEnabled).length ===
                      0 && (
                      <p className="text-sm text-muted-foreground">
                        No platforms enabled. Enable platforms above first.
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This will queue a browser-based scan. Each platform runs
                  in a separate browser with memory-managed parallel
                  execution.
                </p>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowScanModal(false);
                    setScanTickers("");
                    setScanPlatforms([]);
                  }}
                  className="px-4 py-2 text-foreground border border-border rounded-md hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={triggerScan}
                  disabled={triggering}
                  className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {triggering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Launch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Platform Config Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-lg">
              <h3 className="text-lg font-medium text-foreground mb-4">
                Configure{" "}
                {platformDisplayNames[showConfigModal] || showConfigModal}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Daily Page Limit
                  </label>
                  <input
                    type="number"
                    value={configDailyLimit}
                    onChange={(e) =>
                      setConfigDailyLimit(parseInt(e.target.value) || 0)
                    }
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Maximum pages the browser agent can visit per day on
                    this platform.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Monitor Targets (JSON)
                  </label>
                  <textarea
                    value={configTargets}
                    onChange={(e) => setConfigTargets(e.target.value)}
                    rows={4}
                    placeholder='{"servers": ["123456789"], "channels": []}'
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-mono placeholder:text-muted-foreground"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Platform-specific targets: Discord servers, subreddits,
                    hashtags, etc.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Notes
                  </label>
                  <textarea
                    value={configNotes}
                    onChange={(e) => setConfigNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Platform login credentials are managed via environment
                  variables. Check the Integrations page under &quot;Browser
                  Agent&quot; category.
                </p>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowConfigModal(null)}
                  className="px-4 py-2 text-foreground border border-border rounded-md hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveConfig(showConfigModal)}
                  className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
