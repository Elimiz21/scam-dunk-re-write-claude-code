"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Radio,
  Search,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Globe,
  MessageSquare,
  Youtube,
  Hash,
  Eye,
} from "lucide-react";

interface ScanRun {
  id: string;
  scanDate: string;
  status: string;
  tickersScanned: number;
  tickersWithMentions: number;
  totalMentions: number;
  platformsUsed: string[];
  duration: number | null;
  errors: string[];
  createdAt: string;
}

interface Mention {
  id: string;
  ticker: string;
  stockName: string | null;
  platform: string;
  source: string;
  discoveredVia: string;
  title: string | null;
  content: string | null;
  url: string | null;
  author: string | null;
  postDate: string | null;
  engagement: Record<string, number>;
  sentiment: string | null;
  isPromotional: boolean;
  promotionScore: number;
  redFlags: string[];
  createdAt: string;
  scanRun: { scanDate: string };
}

interface Stats {
  totalMentions: number;
  avgPromotionScore: number;
  promotionalCount: number;
  uniqueTickers: Array<{ ticker: string; count: number }>;
  platformBreakdown: Array<{ platform: string; count: number; avgScore: number }>;
}

interface ScanData {
  scanRuns: ScanRun[];
  mentions: Mention[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: Stats;
}

const platformIcons: Record<string, any> = {
  Reddit: MessageSquare,
  YouTube: Youtube,
  Discord: Hash,
  StockTwits: TrendingUp,
  Twitter: Globe,
  TikTok: Globe,
  Web: Globe,
  Forum: Globe,
};

const platformColors: Record<string, string> = {
  Reddit: "bg-orange-100 text-orange-700",
  YouTube: "bg-red-100 text-red-700",
  Discord: "bg-indigo-100 text-indigo-700",
  StockTwits: "bg-blue-100 text-blue-700",
  Twitter: "bg-sky-100 text-sky-700",
  TikTok: "bg-pink-100 text-pink-700",
  Web: "bg-gray-100 text-gray-700",
  Forum: "bg-amber-100 text-amber-700",
};

const scannerLabels: Record<string, string> = {
  reddit_oauth: "Reddit OAuth",
  reddit_public: "Reddit Public",
  youtube_api: "YouTube API",
  google_cse: "Google CSE",
  perplexity: "Perplexity AI",
  discord_bot: "Discord Bot",
  stocktwits: "StockTwits API",
  rss: "RSS Monitor",
};

export default function SocialScanPage() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filterTicker, setFilterTicker] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [promotionalOnly, setPromotionalOnly] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [manualTickers, setManualTickers] = useState("");
  const [expandedMention, setExpandedMention] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    status: string;
    tickersScanned: number;
    tickersWithMentions: number;
    totalMentions: number;
    platformsUsed: string[];
    errors: string[];
    duration: number;
    message: string;
  } | null>(null);
  const [settingUpDb, setSettingUpDb] = useState(false);
  const [dbSetupDone, setDbSetupDone] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (filterTicker) params.set("ticker", filterTicker);
      if (filterPlatform) params.set("platform", filterPlatform);
      if (promotionalOnly) params.set("promotionalOnly", "true");

      const res = await fetch(`/api/admin/social-scan?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [page, filterTicker, filterPlatform, promotionalOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function triggerScan() {
    setTriggering(true);
    setError("");
    setScanResult(null);
    try {
      // If manual tickers provided, send them. Otherwise, auto-pull from daily scan.
      const tickerList = manualTickers.trim()
        ? manualTickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
        : undefined;
      const res = await fetch("/api/admin/social-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString().split("T")[0],
          tickers: tickerList,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to trigger scan");
      }
      const result = await res.json();
      setScanResult(result);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger scan");
    } finally {
      setTriggering(false);
    }
  }

  async function setupDatabase() {
    setSettingUpDb(true);
    setError("");
    try {
      const res = await fetch("/api/admin/db-status", { method: "POST" });
      if (!res.ok) throw new Error("Failed to set up database");
      setDbSetupDone(true);
      setError("");
      // Refresh data now that tables exist
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set up database");
    } finally {
      setSettingUpDb(false);
    }
  }

  const isDbSetupError = error.toLowerCase().includes("table") && (error.toLowerCase().includes("not set up") || error.toLowerCase().includes("not exist") || error.toLowerCase().includes("does not exist"));

  function getStatusBadge(status: string) {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="h-3 w-3" /> Completed
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Clock className="h-3 w-3 animate-spin" /> Running
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        );
      case "PARTIAL":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <AlertTriangle className="h-3 w-3" /> Partial
          </span>
        );
      default:
        return <span className="text-xs text-muted-foreground">{status}</span>;
    }
  }

  function getPromotionBadge(score: number) {
    if (score >= 60) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">{score}</span>;
    }
    if (score >= 30) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">{score}</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{score}</span>;
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
            <h1 className="text-2xl font-bold text-foreground">Social Media Scan</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor social media for suspicious stock promotion activity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={manualTickers}
              onChange={(e) => setManualTickers(e.target.value)}
              placeholder="Auto from daily scan, or enter tickers..."
              disabled={triggering}
              className="w-64 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <button
              onClick={triggerScan}
              disabled={triggering}
              className="gradient-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
            >
              <Radio className={`h-4 w-4 ${triggering ? "animate-pulse" : ""}`} />
              {triggering ? "Scanning..." : "Run Scan"}
            </button>
          </div>
        </div>

        {triggering && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 flex items-center gap-3">
            <Clock className="h-5 w-5 animate-spin flex-shrink-0" />
            <div>
              <p className="font-medium">Social media scan in progress...</p>
              <p className="text-xs mt-1 text-blue-600">
                Scanning Reddit, YouTube, StockTwits, Google, Perplexity, and Discord for high-risk tickers from the latest daily scan. This may take 2-5 minutes.
              </p>
            </div>
          </div>
        )}

        {scanResult && !triggering && (
          <div className={`border rounded-lg p-4 text-sm ${
            scanResult.status === 'COMPLETED' ? 'bg-green-50 border-green-200 text-green-700' :
            scanResult.status === 'PARTIAL' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
            'bg-red-50 border-red-200 text-red-700'
          }`}>
            <div className="flex items-start gap-3">
              {scanResult.status === 'COMPLETED' ? <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /> :
               scanResult.status === 'PARTIAL' ? <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" /> :
               <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
              <div className="space-y-1">
                <p className="font-medium">{scanResult.message}</p>
                <div className="flex flex-wrap gap-3 text-xs opacity-80">
                  <span>{scanResult.tickersScanned} tickers scanned</span>
                  <span>{scanResult.tickersWithMentions} with mentions</span>
                  <span>{scanResult.totalMentions} total mentions</span>
                  {scanResult.duration > 0 && <span>{(scanResult.duration / 1000).toFixed(0)}s</span>}
                </div>
                {scanResult.platformsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {scanResult.platformsUsed.map(p => (
                      <span key={p} className="px-1.5 py-0.5 rounded text-xs bg-white/50">{p}</span>
                    ))}
                  </div>
                )}
                {scanResult.errors.length > 0 && (
                  <div className="mt-1 text-xs opacity-70">
                    {scanResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {dbSetupDone && !error && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            Database tables created successfully. You can now run scans.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p>{isDbSetupError ? "Database tables need to be created before you can run scans." : error}</p>
                {isDbSetupError && (
                  <p className="text-xs mt-1 opacity-70">Click the button to automatically create the required tables.</p>
                )}
              </div>
              {isDbSetupError && (
                <button
                  onClick={setupDatabase}
                  disabled={settingUpDb}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-2"
                >
                  {settingUpDb ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    "Setup Database"
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card rounded-2xl shadow p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg gradient-brand-subtle">
                <Radio className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Mentions</p>
                <p className="text-2xl font-bold text-foreground">{data?.stats.totalMentions || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Promotional</p>
                <p className="text-2xl font-bold text-foreground">{data?.stats.promotionalCount || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Promotion Score</p>
                <p className="text-2xl font-bold text-foreground">{data?.stats.avgPromotionScore || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <Search className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Tickers Tracked</p>
                <p className="text-2xl font-bold text-foreground">{data?.stats.uniqueTickers?.length || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Scan Runs */}
        {data?.scanRuns && data.scanRuns.length > 0 && (
          <div className="bg-card rounded-2xl shadow border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Recent Scan Runs</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tickers</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Mentions</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Platforms</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scanRuns.map((run) => (
                    <tr key={run.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground">
                        {new Date(run.scanDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(run.status)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {run.tickersWithMentions}/{run.tickersScanned} with mentions
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{run.totalMentions}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {run.platformsUsed.map((p) => (
                            <span key={p} className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                              {scannerLabels[p] || p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {run.duration ? `${(run.duration / 1000).toFixed(0)}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Platform Breakdown */}
        {data?.stats.platformBreakdown && data.stats.platformBreakdown.length > 0 && (
          <div className="bg-card rounded-2xl shadow border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Platform Breakdown</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {data.stats.platformBreakdown.map((p) => {
                const Icon = platformIcons[p.platform] || Globe;
                const colorClass = platformColors[p.platform] || "bg-gray-100 text-gray-700";
                return (
                  <div
                    key={p.platform}
                    className="flex flex-col items-center p-3 rounded-xl border border-border hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => setFilterPlatform(filterPlatform === p.platform ? "" : p.platform)}
                  >
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium text-foreground mt-2">{p.platform}</span>
                    <span className="text-lg font-bold text-foreground">{p.count}</span>
                    <span className="text-xs text-muted-foreground">avg score: {p.avgScore}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-card rounded-2xl shadow border border-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by ticker..."
                value={filterTicker}
                onChange={(e) => { setFilterTicker(e.target.value); setPage(1); }}
                className="pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={filterPlatform}
              onChange={(e) => { setFilterPlatform(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Platforms</option>
              <option value="Reddit">Reddit</option>
              <option value="YouTube">YouTube</option>
              <option value="Twitter">Twitter/X</option>
              <option value="Discord">Discord</option>
              <option value="StockTwits">StockTwits</option>
              <option value="TikTok">TikTok</option>
              <option value="Web">Web</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={promotionalOnly}
                onChange={(e) => { setPromotionalOnly(e.target.checked); setPage(1); }}
                className="rounded border-border"
              />
              Promotional only
            </label>
            <button
              onClick={() => { setFilterTicker(""); setFilterPlatform(""); setPromotionalOnly(false); setPage(1); }}
              className="text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
            <div className="ml-auto">
              <button onClick={fetchData} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Mentions Evidence Table */}
        <div className="bg-card rounded-2xl shadow border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">
              Social Media Evidence
              {data?.pagination && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({data.pagination.total} mentions)
                </span>
              )}
            </h2>
          </div>

          {(!data?.mentions || data.mentions.length === 0) ? (
            <div className="p-12 text-center">
              <Radio className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No social media mentions found yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Run a scan to detect stock promotion activity.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ticker</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Platform</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Found Via</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Content</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Author</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Score</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mentions.map((mention) => {
                      const Icon = platformIcons[mention.platform] || Globe;
                      const colorClass = platformColors[mention.platform] || "bg-gray-100 text-gray-700";
                      const isExpanded = expandedMention === mention.id;

                      return (
                        <>
                          <tr
                            key={mention.id}
                            className={`border-b border-border hover:bg-muted/20 transition-colors cursor-pointer ${
                              mention.isPromotional ? "bg-red-50/30" : ""
                            }`}
                            onClick={() => setExpandedMention(isExpanded ? null : mention.id)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold text-sm text-foreground">${mention.ticker}</span>
                              {mention.stockName && (
                                <p className="text-xs text-muted-foreground truncate max-w-[120px]">{mention.stockName}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                                  <Icon className="h-3 w-3" />
                                  {mention.platform}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[140px]">{mention.source}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                {scannerLabels[mention.discoveredVia] || mention.discoveredVia}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[300px]">
                              {mention.title && (
                                <p className="text-sm font-medium text-foreground truncate">{mention.title}</p>
                              )}
                              <p className="text-xs text-muted-foreground truncate">
                                {mention.content?.substring(0, 100)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">{mention.author || "—"}</td>
                            <td className="px-4 py-3">{getPromotionBadge(mention.promotionScore)}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {mention.postDate
                                ? new Date(mention.postDate).toLocaleDateString()
                                : new Date(mention.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              {mention.url ? (
                                <a
                                  href={mention.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${mention.id}-detail`} className="border-b border-border bg-muted/10">
                              <td colSpan={8} className="px-6 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Full Content</h4>
                                    <p className="text-sm text-foreground whitespace-pre-wrap">
                                      {mention.content || "No content available"}
                                    </p>
                                  </div>
                                  <div className="space-y-3">
                                    <div>
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Engagement</h4>
                                      <div className="flex flex-wrap gap-2">
                                        {Object.entries(mention.engagement || {}).map(([key, val]) =>
                                          val ? (
                                            <span key={key} className="text-xs px-2 py-1 rounded bg-muted text-foreground">
                                              {key}: {val.toLocaleString()}
                                            </span>
                                          ) : null
                                        )}
                                        {Object.keys(mention.engagement || {}).length === 0 && (
                                          <span className="text-xs text-muted-foreground">No engagement data</span>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Red Flags</h4>
                                      <div className="flex flex-wrap gap-1">
                                        {mention.redFlags.length > 0 ? (
                                          mention.redFlags.map((flag, i) => (
                                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                              {flag}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-xs text-muted-foreground">None detected</span>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Sentiment</h4>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        mention.sentiment === "bullish" ? "bg-green-100 text-green-700" :
                                        mention.sentiment === "bearish" ? "bg-red-100 text-red-700" :
                                        "bg-gray-100 text-gray-700"
                                      }`}>
                                        {mention.sentiment || "neutral"}
                                      </span>
                                    </div>
                                    {mention.url && (
                                      <a
                                        href={mention.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        View Original Post
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.pagination && data.pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(data.pagination.page - 1) * data.pagination.limit + 1}–
                    {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-foreground px-2">
                      {data.pagination.page} / {data.pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(data!.pagination.totalPages, p + 1))}
                      disabled={page >= data.pagination.totalPages}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Top Tickers */}
        {data?.stats.uniqueTickers && data.stats.uniqueTickers.length > 0 && (
          <div className="bg-card rounded-2xl shadow border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Most Mentioned Tickers</h2>
            <div className="flex flex-wrap gap-2">
              {data.stats.uniqueTickers.map((t) => (
                <button
                  key={t.ticker}
                  onClick={() => { setFilterTicker(t.ticker); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    filterTicker === t.ticker
                      ? "gradient-brand text-white border-transparent"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  ${t.ticker}
                  <span className="ml-1.5 text-xs opacity-70">({t.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
