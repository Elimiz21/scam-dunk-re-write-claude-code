"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Activity,
  Brain,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Cpu,
  Filter,
  Newspaper,
  Radio,
  Shield,
  TreePine,
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Zap,
  Calendar,
} from "lucide-react";

// ─── Types matching scan-status-{DATE}.json ────────────────────────

interface PhaseStatus {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  details: Record<string, any>;
}

interface ScanStatusData {
  available: boolean;
  source?: "scan-status" | "daily-report";
  error?: string;
  date?: string;
  pipelineStatus?: "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  durationMinutes?: number | null;
  failedAtPhase?: string | null;
  aiBackend?: {
    configured: boolean;
    available: boolean;
    layersUsed: string[];
  };
  phases?: {
    phase1_riskScoring: PhaseStatus;
    phase2_sizeFiltering: PhaseStatus;
    phase3_newsAnalysis: PhaseStatus;
    phase4_socialMedia: PhaseStatus;
    phase5_schemeTracking: PhaseStatus;
  };
  summary?: {
    totalStocks?: number;
    processed?: number;
    skippedNoData?: number;
    riskCounts?: { LOW: number; MEDIUM: number; HIGH: number; INSUFFICIENT: number };
    highRiskBeforeFilters?: number;
    filteredByMarketCap?: number;
    filteredByVolume?: number;
    filteredByNews?: number;
    remainingSuspicious?: number;
    newSchemes?: number;
    ongoingSchemes?: number;
    totalActiveSchemes?: number;
    activeSchemes?: number;
  };
  socialMediaDetails?: {
    platformsUsed: string[];
    platformResults: Array<{
      platform: string;
      scanner: string;
      configured: boolean;
      success: boolean;
      mentionsFound: number;
      error: string | null;
    }>;
    totalMentions: number;
    tickersScanned: number;
    tickersWithMentions: number;
  };
  history?: Array<{ date: string; filename: string }>;
}

interface LiveBackendData {
  timestamp: string;
  backend: {
    configured: boolean;
    reachable: boolean;
    url: string | null;
    latencyMs: number | null;
    version: string | null;
    modelsLoaded: boolean;
  };
  layers: Array<{
    id: string;
    name: string;
    description: string;
    status: "online" | "offline";
  }>;
  layersSummary: string;
  activity: {
    scansLastHour: number;
    scansToday: number;
    avgProcessingTimeMs: number | null;
    riskBreakdown: {
      low: number;
      medium: number;
      high: number;
      insufficient: number;
    } | null;
    recentScans: Array<{
      ticker: string;
      riskLevel: string;
      score: number;
      processingTimeMs: number | null;
      scannedAt: string;
    }>;
  };
}

// ─── Helper components ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    completed: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-700",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    },
    failed: {
      bg: "bg-red-500/10",
      text: "text-red-700",
      icon: <XCircle className="h-3.5 w-3.5" />,
    },
    running: {
      bg: "bg-blue-500/10",
      text: "text-blue-700",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    },
    pending: {
      bg: "bg-gray-500/10",
      text: "text-gray-500",
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    skipped: {
      bg: "bg-amber-500/10",
      text: "text-amber-700",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
    },
  };

  const c = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.icon}
      {status.toUpperCase()}
    </span>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Phase Row Component ───────────────────────────────────────────

function PhaseRow({
  phase,
  icon: Icon,
  children,
}: {
  phase: PhaseStatus;
  icon: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(phase.status === "failed");
  const hasDetails = Object.keys(phase.details || {}).length > 0 || phase.error || children;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
          hasDetails ? "hover:bg-secondary/50 cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="p-2 rounded-lg bg-secondary">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{phase.name}</p>
          {phase.durationMs != null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDuration(phase.durationMs)}
            </p>
          )}
        </div>
        <StatusBadge status={phase.status} />
        {hasDetails && (
          expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && hasDetails && (
        <div className="px-5 pb-4 border-t border-border bg-secondary/20">
          {phase.error && (
            <div className="mt-3 p-3 bg-red-500/10 rounded-lg">
              <p className="text-sm text-red-700 font-mono break-all">{phase.error}</p>
            </div>
          )}
          {Object.keys(phase.details || {}).length > 0 && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(phase.details).map(([key, val]) => {
                if (typeof val === "object" && val !== null) return null;
                return (
                  <div key={key} className="bg-card rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground">
                      {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                    </p>
                    <p className="text-sm font-medium text-foreground mt-0.5">
                      {typeof val === "number" ? val.toLocaleString() : String(val)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Layer icon lookup ──────────────────────────────────────────────

const LAYER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deterministic: Activity,
  anomaly: Brain,
  random_forest: TreePine,
  lstm: Cpu,
};

const LAYER_COLORS: Record<string, string> = {
  deterministic: "#6366f1",
  anomaly: "#f59e0b",
  random_forest: "#10b981",
  lstm: "#ec4899",
};

// ─── Live AI Backend Panel ──────────────────────────────────────────

function LiveAIBackendPanel() {
  const [live, setLive] = useState<LiveBackendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-backend-live");
      if (res.ok) {
        const json = await res.json();
        setLive(json);
        setLastRefresh(new Date());
      }
    } catch {
      // silently fail for polling
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    intervalRef.current = setInterval(fetchLive, 30_000); // Poll every 30s
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchLive]);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-secondary rounded w-48" />
          <div className="h-20 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  if (!live) return null;

  const allOnline = live.layers.every((l) => l.status === "online");
  const someOffline = live.layers.some((l) => l.status === "offline");

  const riskLevelColor = (level: string) => {
    switch (level) {
      case "HIGH": return "text-red-700 bg-red-500/10";
      case "MEDIUM": return "text-amber-700 bg-amber-500/10";
      case "LOW": return "text-emerald-700 bg-emerald-500/10";
      default: return "text-gray-600 bg-gray-500/10";
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Zap className="h-5 w-5 text-primary" />
            <span
              className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                allOnline ? "bg-emerald-500" : someOffline ? "bg-amber-500" : "bg-red-500"
              }`}
              style={allOnline ? { animation: "pulse-dot 2s ease-in-out infinite" } : undefined}
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Live AI Backend</h3>
            <p className="text-[11px] text-muted-foreground">
              Real-time status for user-facing scans
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {live.backend.latencyMs != null && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {live.backend.latencyMs}ms
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
              live.backend.reachable
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-red-500/10 text-red-700"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live.backend.reachable ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            {live.backend.reachable ? "CONNECTED" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Layer grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {live.layers.map((layer) => {
            const Icon = LAYER_ICONS[layer.id] || Cpu;
            const color = LAYER_COLORS[layer.id] || "#6366f1";
            const isOnline = layer.status === "online";

            return (
              <div
                key={layer.id}
                className="relative rounded-xl p-3 border transition-all"
                style={{
                  borderColor: isOnline ? `${color}30` : undefined,
                  backgroundColor: isOnline ? `${color}06` : undefined,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-7 w-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  {isOnline ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                </div>
                <p className="text-xs font-medium text-foreground">{layer.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{layer.description}</p>
              </div>
            );
          })}
        </div>

        {/* Live activity stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-secondary/40 rounded-xl p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Last Hour</p>
            <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">
              {live.activity.scansLastHour}
            </p>
            <p className="text-[10px] text-muted-foreground">scans</p>
          </div>
          <div className="bg-secondary/40 rounded-xl p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Today</p>
            <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">
              {live.activity.scansToday}
            </p>
            <p className="text-[10px] text-muted-foreground">scans</p>
          </div>
          <div className="bg-secondary/40 rounded-xl p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Avg Time</p>
            <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">
              {live.activity.avgProcessingTimeMs != null
                ? formatDuration(live.activity.avgProcessingTimeMs)
                : "-"}
            </p>
            <p className="text-[10px] text-muted-foreground">per scan</p>
          </div>
        </div>

        {/* Today's risk breakdown bar */}
        {live.activity.riskBreakdown && live.activity.scansToday > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Today&apos;s Risk Distribution
            </p>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-secondary">
              {live.activity.riskBreakdown.low > 0 && (
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(live.activity.riskBreakdown.low / live.activity.scansToday) * 100}%` }}
                  title={`LOW: ${live.activity.riskBreakdown.low}`}
                />
              )}
              {live.activity.riskBreakdown.medium > 0 && (
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(live.activity.riskBreakdown.medium / live.activity.scansToday) * 100}%` }}
                  title={`MEDIUM: ${live.activity.riskBreakdown.medium}`}
                />
              )}
              {live.activity.riskBreakdown.high > 0 && (
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${(live.activity.riskBreakdown.high / live.activity.scansToday) * 100}%` }}
                  title={`HIGH: ${live.activity.riskBreakdown.high}`}
                />
              )}
              {live.activity.riskBreakdown.insufficient > 0 && (
                <div
                  className="bg-gray-400 transition-all"
                  style={{ width: `${(live.activity.riskBreakdown.insufficient / live.activity.scansToday) * 100}%` }}
                  title={`INSUFFICIENT: ${live.activity.riskBreakdown.insufficient}`}
                />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />LOW {live.activity.riskBreakdown.low}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />MED {live.activity.riskBreakdown.medium}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />HIGH {live.activity.riskBreakdown.high}</span>
              {live.activity.riskBreakdown.insufficient > 0 && (
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" />N/A {live.activity.riskBreakdown.insufficient}</span>
              )}
            </div>
          </div>
        )}

        {/* Recent scan feed */}
        {live.activity.recentScans.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Recent Scans
            </p>
            <div className="space-y-1.5">
              {live.activity.recentScans.map((scan, i) => (
                <div
                  key={`${scan.ticker}-${scan.scannedAt}-${i}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      {scan.ticker}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${riskLevelColor(scan.riskLevel)}`}>
                      {scan.riskLevel}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {timeAgo(scan.scannedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
          <span>Auto-refreshes every 30s</span>
          {lastRefresh && <span>Updated {timeAgo(lastRefresh.toISOString())}</span>}
        </div>
      </div>

      {/* Pulsing dot animation */}
      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────

export default function ScanStatusPage() {
  const [data, setData] = useState<ScanStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchStatus = useCallback(async (date?: string | null) => {
    if (date) {
      setDateLoading(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const qs = date ? `?date=${date}` : "";
      const res = await fetch(`/api/admin/scan-status${qs}`);
      if (!res.ok) throw new Error("Failed to fetch scan status");
      const json = await res.json();
      setData(json);
      setSelectedDate(json.date || date || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan status");
    } finally {
      setLoading(false);
      setDateLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  function handleDateClick(date: string) {
    if (date === selectedDate) return;
    setSelectedDate(date);
    fetchStatus(date);
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-secondary rounded w-60" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-2xl border border-border h-28" />
            ))}
          </div>
          <div className="bg-card rounded-2xl border border-border h-96" />
        </div>
      </AdminLayout>
    );
  }

  if (error && !data) {
    return (
      <AdminLayout>
        <AlertBanner type="error" title="Error Loading Scan Status" message={error} />
      </AdminLayout>
    );
  }

  if (!data?.available && !data?.history?.length) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold font-display italic text-foreground">Scan Status</h1>
          {/* Still show live panel even when no pipeline data exists */}
          <LiveAIBackendPanel />
          <AlertBanner
            type="warning"
            title="No Scan Data Available"
            message={data?.error || "The daily scan pipeline has not produced any status data yet. Status data will appear after the next scan completes."}
          />
        </div>
      </AdminLayout>
    );
  }

  const s = data?.summary || {};
  const phases = data?.phases;
  const social = data?.socialMediaDetails;
  const ai = data?.aiBackend;

  const pipelineFailed = data?.pipelineStatus === "failed";

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display italic text-foreground">Scan Status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pipeline results &amp; live AI backend monitoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchStatus(selectedDate)}
              disabled={dateLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dateLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {data?.source === "daily-report" && (
              <span className="text-xs text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full">
                Legacy data (pre-status tracking)
              </span>
            )}
          </div>
        </div>

        {/* Live AI Backend Panel */}
        <LiveAIBackendPanel />

        {/* Scan history date picker */}
        {data?.history && data.history.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">Scan History</h3>
              <span className="text-xs text-muted-foreground">
                ({data.history.length} available)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.history.map((h) => {
                const isSelected = h.date === selectedDate;
                const isLoading = dateLoading && h.date === selectedDate;
                return (
                  <button
                    key={h.date}
                    onClick={() => handleDateClick(h.date)}
                    disabled={dateLoading}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-secondary/80"
                    } disabled:opacity-50`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isSelected ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : null}
                    {h.date}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date-specific loading overlay */}
        {dateLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading scan data for {selectedDate}...
            </span>
          </div>
        )}

        {/* Show "no data for this date" if applicable */}
        {!dateLoading && data && !data.available && (
          <AlertBanner
            type="warning"
            title="No Data For This Date"
            message={data.error || `No scan results found for ${selectedDate}.`}
          />
        )}

        {/* Main scan results (only show when data is available and not loading a date) */}
        {!dateLoading && data?.available && (
          <>
            {/* Pipeline failure banner */}
            {pipelineFailed && (
              <AlertBanner
                type="error"
                title={`Pipeline FAILED${data.failedAtPhase ? ` at: ${data.failedAtPhase}` : ""}`}
                message={data.error || (data as any)?.failedAtPhase || "The scan did not complete successfully."}
              />
            )}

            {/* Top-level summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs font-medium text-muted-foreground">Scan Date</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{data.date}</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs font-medium text-muted-foreground">Status</p>
                <div className="mt-2">
                  <StatusBadge status={data.pipelineStatus || "unknown"} />
                </div>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs font-medium text-muted-foreground">Duration</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {data.durationMinutes != null ? `${data.durationMinutes}m` : "-"}
                </p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs font-medium text-muted-foreground">Stocks Scanned</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {(s.processed ?? s.totalStocks ?? 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* AI Backend Status (from daily pipeline) */}
            {ai && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">AI Backend (Pipeline Run)</h3>
                  <StatusBadge status={ai.available ? "completed" : ai.configured ? "failed" : "skipped"} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {ai.layersUsed.map((layer) => (
                    <span
                      key={layer}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary rounded-lg text-xs text-foreground"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {layer}
                    </span>
                  ))}
                  {!ai.available && ai.configured && (
                    <span className="text-xs text-red-600">Backend configured but not reachable</span>
                  )}
                  {!ai.configured && (
                    <span className="text-xs text-muted-foreground">
                      AI_BACKEND_URL not set - using Layer 1 only
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Phase-by-phase breakdown */}
            {phases && (
              <div className="space-y-3">
                <h2 className="text-lg font-medium font-display italic text-foreground">Pipeline Phases</h2>

                <PhaseRow phase={phases.phase1_riskScoring} icon={Shield}>
                  {phases.phase1_riskScoring.details?.riskCounts && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">Risk Distribution</p>
                      <div className="grid grid-cols-4 gap-2">
                        {Object.entries(phases.phase1_riskScoring.details.riskCounts as Record<string, number>).map(
                          ([level, count]) => {
                            const color =
                              level === "HIGH" ? "text-red-700 bg-red-500/10"
                              : level === "MEDIUM" ? "text-amber-700 bg-amber-500/10"
                              : level === "LOW" ? "text-emerald-700 bg-emerald-500/10"
                              : "text-gray-600 bg-gray-500/10";
                            return (
                              <div key={level} className={`rounded-lg p-2 text-center ${color}`}>
                                <p className="text-xs font-medium">{level}</p>
                                <p className="text-lg font-semibold">{count.toLocaleString()}</p>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}
                </PhaseRow>

                <PhaseRow phase={phases.phase2_sizeFiltering} icon={Filter} />

                <PhaseRow phase={phases.phase3_newsAnalysis} icon={Newspaper} />

                <PhaseRow phase={phases.phase4_socialMedia} icon={Radio}>
                  {social && social.platformResults.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">Platform Results</p>
                      <div className="space-y-2">
                        {social.platformResults.map((p) => (
                          <div
                            key={`${p.platform}-${p.scanner}`}
                            className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                              p.success
                                ? "border-emerald-500/20 bg-emerald-500/5"
                                : "border-red-500/20 bg-red-500/5"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {p.success ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-foreground">{p.platform}</p>
                                <p className="text-xs text-muted-foreground">{p.scanner}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              {p.success ? (
                                <p className="text-sm font-medium text-foreground">
                                  {p.mentionsFound} mention{p.mentionsFound !== 1 ? "s" : ""}
                                </p>
                              ) : (
                                <p className="text-xs text-red-600 max-w-xs truncate">
                                  {p.error || "Failed"}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Total mentions: <span className="font-medium text-foreground">{social.totalMentions}</span></span>
                        <span>Tickers scanned: <span className="font-medium text-foreground">{social.tickersScanned}</span></span>
                        <span>With mentions: <span className="font-medium text-foreground">{social.tickersWithMentions}</span></span>
                      </div>
                    </div>
                  )}
                </PhaseRow>

                <PhaseRow phase={phases.phase5_schemeTracking} icon={TrendingUp} />
              </div>
            )}

            {/* Filtering funnel */}
            {s.highRiskBeforeFilters != null && (
              <div className="bg-card rounded-2xl border border-border p-6">
                <h2 className="text-lg font-medium font-display italic text-foreground mb-4">Filtering Funnel</h2>
                <div className="space-y-3">
                  <FunnelRow
                    label="High-risk stocks (before filters)"
                    value={s.highRiskBeforeFilters ?? 0}
                    total={s.processed ?? s.totalStocks ?? 1}
                    color="bg-red-500"
                  />
                  <FunnelRow
                    label="Filtered by market cap"
                    value={s.filteredByMarketCap ?? 0}
                    total={s.highRiskBeforeFilters ?? 1}
                    color="bg-amber-500"
                    isFilter
                  />
                  <FunnelRow
                    label="Filtered by volume"
                    value={s.filteredByVolume ?? 0}
                    total={s.highRiskBeforeFilters ?? 1}
                    color="bg-amber-400"
                    isFilter
                  />
                  <FunnelRow
                    label="Filtered by legitimate news"
                    value={s.filteredByNews ?? 0}
                    total={s.highRiskBeforeFilters ?? 1}
                    color="bg-blue-400"
                    isFilter
                  />
                  <FunnelRow
                    label="Remaining suspicious"
                    value={s.remainingSuspicious ?? 0}
                    total={s.highRiskBeforeFilters ?? 1}
                    color="bg-red-600"
                  />
                </div>
              </div>
            )}

            {/* Scheme tracking summary */}
            {(s.newSchemes != null || s.totalActiveSchemes != null || s.activeSchemes != null) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card rounded-2xl border border-border p-5">
                  <p className="text-xs font-medium text-muted-foreground">New Schemes</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{s.newSchemes ?? 0}</p>
                </div>
                <div className="bg-card rounded-2xl border border-border p-5">
                  <p className="text-xs font-medium text-muted-foreground">Ongoing Schemes</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{s.ongoingSchemes ?? 0}</p>
                </div>
                <div className="bg-card rounded-2xl border border-border p-5">
                  <p className="text-xs font-medium text-muted-foreground">Total Active Schemes</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {s.totalActiveSchemes ?? s.activeSchemes ?? 0}
                  </p>
                </div>
              </div>
            )}

            {/* Timestamps */}
            {data.startedAt && (
              <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
                <span>Started: {formatDate(data.startedAt)}</span>
                {data.completedAt && <span>Completed: {formatDate(data.completedAt)}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ─── Funnel row ────────────────────────────────────────────────────

function FunnelRow({
  label,
  value,
  total,
  color,
  isFilter = false,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  isFilter?: boolean;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">
          {isFilter ? `\u2514\u2500 ${label}` : label}
        </span>
        <span className="font-medium text-foreground">
          {isFilter ? `-${value}` : value}
        </span>
      </div>
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
    </div>
  );
}
