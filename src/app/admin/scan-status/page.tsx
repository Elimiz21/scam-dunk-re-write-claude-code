"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Cpu,
  Filter,
  Newspaper,
  Radio,
  Shield,
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
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

// ─── Main Page ─────────────────────────────────────────────────────

export default function ScanStatusPage() {
  const [data, setData] = useState<ScanStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/scan-status");
      if (!res.ok) throw new Error("Failed to fetch scan status");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

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

  if (error) {
    return (
      <AdminLayout>
        <AlertBanner type="error" title="Error Loading Scan Status" message={error} />
      </AdminLayout>
    );
  }

  if (!data?.available) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold font-display italic text-foreground">Scan Status</h1>
          <AlertBanner
            type="warning"
            title="No Scan Data Available"
            message={data?.error || "The daily scan pipeline has not produced any status data yet. Status data will appear after the next scan completes."}
          />
        </div>
      </AdminLayout>
    );
  }

  const s = data.summary || {};
  const phases = data.phases;
  const social = data.socialMediaDetails;
  const ai = data.aiBackend;

  const pipelineOk = data.pipelineStatus === "completed";
  const pipelineFailed = data.pipelineStatus === "failed";

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display italic text-foreground">Scan Status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Detailed view of the latest Enhanced Daily Scan pipeline execution
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchStatus}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            {data.source === "daily-report" && (
              <span className="text-xs text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full">
                Legacy data (pre-status tracking)
              </span>
            )}
          </div>
        </div>

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
          {/* Date */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground">Scan Date</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{data.date}</p>
          </div>

          {/* Overall Status */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <div className="mt-2">
              <StatusBadge status={data.pipelineStatus || "unknown"} />
            </div>
          </div>

          {/* Duration */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground">Duration</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {data.durationMinutes != null ? `${data.durationMinutes}m` : "-"}
            </p>
          </div>

          {/* Stocks Scanned */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground">Stocks Scanned</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {(s.processed ?? s.totalStocks ?? 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* AI Backend Status */}
        {ai && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">AI Backend</h3>
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
              {/* Risk distribution inside Phase 1 */}
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
              {/* Social media platform breakdown */}
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

        {/* Filtering funnel (always shown from summary) */}
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

        {/* Scan history */}
        {data.history && data.history.length > 1 && (
          <div className="bg-card rounded-2xl border border-border p-6">
            <h2 className="text-lg font-medium font-display italic text-foreground mb-3">Recent Scan History</h2>
            <div className="flex flex-wrap gap-2">
              {data.history.map((h) => (
                <span
                  key={h.date}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    h.date === data.date
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  {h.date === data.date && <CheckCircle2 className="h-3 w-3" />}
                  {h.date}
                </span>
              ))}
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
