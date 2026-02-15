"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import StatCard from "@/components/admin/StatCard";
import RiskFunnel from "@/components/admin/RiskFunnel";
import AILayerPanel from "@/components/admin/AILayerPanel";
import SchemeCard from "@/components/admin/SchemeCard";
import ScanTimeline from "@/components/admin/ScanTimeline";
import SignalGrid from "@/components/admin/SignalGrid";
import {
  Shield,
  AlertTriangle,
  Search,
  TrendingUp,
  ExternalLink,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  Brain,
  Target,
  Activity,
  Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface DashboardData {
  date: string;
  previousDate: string | null;
  availableDates: string[];
  dailyReport: {
    totalStocksScanned: number;
    byRiskLevel: { LOW: number; MEDIUM: number; HIGH: number; INSUFFICIENT: number };
    highRiskBeforeFilters: number;
    filteredByMarketCap: number;
    filteredByVolume: number;
    filteredByNews: number;
    remainingSuspicious: number;
    activeSchemes: number;
    newSchemes: number;
    processingTimeMinutes: number;
  } | null;
  fmpSummary: {
    totalStocks: number;
    evaluated: number;
    durationMinutes: number;
    apiCallsMade: number;
  } | null;
  funnel: {
    evaluated: number;
    highRisk: number;
    filteredMarketCap: number;
    filteredVolume: number;
    filteredNews: number;
    suspicious: number;
  };
  deltas: {
    stocksScanned: number;
    highRisk: number;
    suspicious: number;
    schemes: number;
  } | null;
  aiStats: {
    total: number;
    withBackend: number;
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
  };
  topStocks: Stock[];
  activeSchemes: Scheme[];
  schemeDb: {
    totalSchemes: number;
    activeSchemes: number;
    resolvedSchemes: number;
    lastUpdated: string;
  } | null;
  socialSummary: {
    totalScanned: number;
    highPromotion: number;
    mediumPromotion: number;
  } | null;
  topPromoted: PromotedStock[];
}

interface Stock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  marketCap: number | null;
  lastPrice: number | null;
  riskLevel: string;
  totalScore: number;
  signals: { code: string; category: string; weight: number; description: string }[];
  aiLayers: {
    layer1_deterministic: number | null;
    layer2_anomaly: number | null;
    layer3_rf: number | null;
    layer4_lstm: number | null;
    combined: number | null;
    usedPythonBackend: boolean;
  };
  isFiltered: boolean;
  filterReason: string | null;
  hasLegitimateNews: boolean;
  newsAnalysis: string | null;
  socialMediaScanned: boolean;
  schemeId: string | null;
  evaluatedAt: string;
}

interface Scheme {
  schemeId: string;
  symbol: string;
  name: string;
  status: string;
  currentRiskScore: number;
  peakRiskScore: number;
  currentPromotionScore: number;
  priceAtDetection: number;
  peakPrice: number;
  currentPrice: number;
  priceChangeFromPeak: number;
  daysActive: number;
  firstDetected: string;
  lastSeen: string;
  promotionPlatforms: string[];
  signalsDetected: string[];
  timeline: { date: string; event: string; significance?: string }[];
}

interface PromotedStock {
  symbol: string;
  name: string;
  riskScore: number;
  price: number;
  marketCap: string;
  platforms: string[];
  redFlags: string[];
  assessment: string;
}

interface HistoryEntry {
  date: string;
  format: string;
  stocksScanned: number;
  highRisk: number;
  suspicious: number;
  activeSchemes: number;
  processingMinutes: number;
}

// ── Page ───────────────────────────────────────────────────────────

export default function ScanIntelligencePage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState("");
  const [showAllStocks, setShowAllStocks] = useState(false);

  const fetchData = useCallback(async (date?: string) => {
    try {
      setLoading(true);
      setError("");
      const qs = date ? `?date=${date}` : "";
      const [dashRes, histRes] = await Promise.all([
        fetch(`/api/admin/scan-intelligence${qs}`),
        fetch("/api/admin/scan-intelligence/history"),
      ]);

      if (!dashRes.ok) throw new Error("Failed to fetch scan data");
      const dashData = await dashRes.json();
      setData(dashData);
      setSelectedDate(dashData.date);

      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.history || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    fetchData(date);
  }

  // ── Loading state ──────────────────────────────────────────────

  if (loading && !data) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-card rounded-xl w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card rounded-2xl border border-border h-28" />
            ))}
          </div>
          <div className="bg-card rounded-2xl border border-border h-40" />
          <div className="bg-card rounded-2xl border border-border h-96" />
        </div>
      </AdminLayout>
    );
  }

  if (error && !data) {
    return (
      <AdminLayout>
        <AlertBanner type="error" title="Error Loading Scan Intelligence" message={error} />
      </AdminLayout>
    );
  }

  if (!data) return null;

  const report = data.dailyReport;
  const filteredStocks = data.topStocks.filter((s) => {
    if (!stockFilter) return true;
    const q = stockFilter.toUpperCase();
    return s.symbol.includes(q) || s.name.toUpperCase().includes(q);
  });
  const displayStocks = showAllStocks ? filteredStocks : filteredStocks.slice(0, 15);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display italic text-foreground">
              Scan Intelligence
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily stock evaluation pipeline results and scheme tracking
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Date pill */}
            <div className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium tabular-nums">{data.date}</span>
              {report && (
                <span className="text-xs text-muted-foreground">
                  {report.processingTimeMinutes}min
                </span>
              )}
            </div>

            {loading && (
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>

        {/* ── Key Metrics ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Stocks Evaluated"
            value={report?.totalStocksScanned || data.fmpSummary?.evaluated || 0}
            icon={Activity}
            color="blue"
            change={data.deltas?.stocksScanned}
            changeIsAbsolute
          />
          <StatCard
            title="HIGH Risk"
            value={report?.highRiskBeforeFilters || 0}
            icon={AlertTriangle}
            color="red"
            change={data.deltas?.highRisk}
            changeIsAbsolute
          />
          <StatCard
            title="Suspicious (Filtered)"
            value={report?.remainingSuspicious || 0}
            icon={Target}
            color="yellow"
            change={data.deltas?.suspicious}
            changeIsAbsolute
          />
          <StatCard
            title="Active Schemes"
            value={data.activeSchemes.length}
            icon={Shield}
            color="purple"
            change={data.deltas?.schemes}
            changeIsAbsolute
          />
        </div>

        {/* ── Risk Funnel + AI Layers (2-col) ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Funnel - 2/3 width */}
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-5">
            <h3 className="text-sm font-medium font-display italic text-foreground mb-4">
              Risk Filtering Pipeline
            </h3>
            <RiskFunnel
              stages={[
                { label: "Evaluated", value: data.funnel.evaluated, color: "#6366f1" },
                { label: "HIGH Risk", value: data.funnel.highRisk, color: "#ef4444" },
                { label: "After Cap Filter", value: data.funnel.highRisk - data.funnel.filteredMarketCap, color: "#f59e0b", detail: `${data.funnel.filteredMarketCap} removed` },
                { label: "After News Filter", value: data.funnel.highRisk - data.funnel.filteredMarketCap - data.funnel.filteredNews, color: "#f97316", detail: `${data.funnel.filteredNews} legit` },
                { label: "Suspicious", value: data.funnel.suspicious, color: "#dc2626", detail: "Actionable" },
              ]}
            />
          </div>

          {/* AI Layers - 1/3 width */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <AILayerPanel stats={data.aiStats} />
          </div>
        </div>

        {/* ── Top Suspicious Stocks ───────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-medium font-display italic text-foreground">
                Top Suspicious Stocks
              </h3>
              <span className="text-xs text-muted-foreground">
                by risk score
              </span>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search ticker..."
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary/30 w-40"
                />
              </div>
            </div>
          </div>

          {/* Stock table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Symbol</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium hidden lg:table-cell">Company</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium">Score</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium">AI Combined</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium hidden md:table-cell">L2 Anomaly</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium hidden md:table-cell">L4 LSTM</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Price</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium hidden lg:table-cell">Mkt Cap</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium">Signals</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {displayStocks.map((stock) => {
                  const isExpanded = expandedStock === stock.symbol;
                  const hasPump = stock.signals.some((s) => s.code.includes("PUMP") || s.code.includes("DUMP"));

                  return (
                    <>
                      <tr
                        key={stock.symbol}
                        className={`border-b border-border/50 transition-colors cursor-pointer ${
                          isExpanded ? "bg-secondary/50" : "hover:bg-secondary/30"
                        }`}
                        onClick={() => setExpandedStock(isExpanded ? null : stock.symbol)}
                      >
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground">{stock.symbol}</span>
                            {hasPump && (
                              <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-red-500/10 text-red-600">
                                PUMP
                              </span>
                            )}
                            {stock.schemeId && (
                              <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-amber-500/10 text-amber-600">
                                SCHEME
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground truncate max-w-[200px] hidden lg:table-cell">
                          {stock.name}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`font-bold tabular-nums ${
                            stock.totalScore >= 16 ? "text-red-600" :
                            stock.totalScore >= 14 ? "text-amber-600" : "text-foreground"
                          }`}>
                            {stock.totalScore}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="font-medium tabular-nums text-muted-foreground">
                            {stock.aiLayers?.combined != null
                              ? (stock.aiLayers.combined * 100).toFixed(0) + "%"
                              : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center hidden md:table-cell">
                          <span className="tabular-nums text-muted-foreground">
                            {stock.aiLayers?.layer2_anomaly != null
                              ? (stock.aiLayers.layer2_anomaly * 100).toFixed(0) + "%"
                              : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center hidden md:table-cell">
                          <span className="tabular-nums text-muted-foreground">
                            {stock.aiLayers?.layer4_lstm != null
                              ? (stock.aiLayers.layer4_lstm * 100).toFixed(0) + "%"
                              : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {stock.lastPrice ? `$${stock.lastPrice.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
                          {stock.marketCap
                            ? stock.marketCap > 1e9
                              ? `$${(stock.marketCap / 1e9).toFixed(1)}B`
                              : `$${(stock.marketCap / 1e6).toFixed(0)}M`
                            : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="text-muted-foreground">{stock.signals.length}</span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr key={`${stock.symbol}-detail`} className="bg-secondary/30">
                          <td colSpan={10} className="p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Signals */}
                              <div>
                                <h4 className="text-xs font-semibold text-foreground mb-2">Detected Signals</h4>
                                <SignalGrid signals={stock.signals} compact />
                              </div>

                              {/* Details */}
                              <div className="space-y-3">
                                {stock.newsAnalysis && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-foreground mb-1">News Analysis</h4>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">{stock.newsAnalysis}</p>
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/admin/scan-intelligence/stock/${stock.symbol}`);
                                    }}
                                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Full Deep Dive
                                  </button>
                                </div>
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

          {/* Show more */}
          {filteredStocks.length > 15 && (
            <button
              onClick={() => setShowAllStocks(!showAllStocks)}
              className="mt-3 w-full py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
            >
              {showAllStocks
                ? "Show less"
                : `Show all ${filteredStocks.length} stocks`}
            </button>
          )}
        </div>

        {/* ── Active Schemes ──────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-medium font-display italic text-foreground">
                Active Schemes
              </h3>
              <span className="text-xs text-muted-foreground">
                {data.activeSchemes.length} tracked
                {data.schemeDb && ` of ${data.schemeDb.totalSchemes} total`}
              </span>
            </div>
            {data.schemeDb && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>{data.schemeDb.resolvedSchemes} resolved</span>
              </div>
            )}
          </div>
          {data.activeSchemes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.activeSchemes.map((scheme) => (
                <SchemeCard
                  key={scheme.schemeId}
                  scheme={scheme}
                  onClick={() => router.push(`/admin/scan-intelligence/scheme/${scheme.schemeId}`)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No active schemes detected</p>
              <p className="text-xs mt-1">Schemes are tracked automatically when high-risk stocks show coordinated promotion patterns</p>
            </div>
          )}
        </div>

        {/* ── Top Promoted Stocks ─────────────────────────────────── */}
        {data.topPromoted.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-medium font-display italic text-foreground">
                Top Promoted Stocks
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.topPromoted.map((stock) => (
                <button
                  key={stock.symbol}
                  onClick={() => router.push(`/admin/scan-intelligence/stock/${stock.symbol}`)}
                  className="text-left p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{stock.symbol}</span>
                        <span className="text-xs text-muted-foreground">${stock.price}</span>
                        <span className="text-[10px] text-muted-foreground">{stock.marketCap}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{stock.name}</p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${
                      stock.riskScore >= 16 ? "text-red-600" : stock.riskScore >= 14 ? "text-amber-600" : "text-foreground"
                    }`}>
                      {stock.riskScore}
                    </span>
                  </div>
                  {/* Red flags */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {stock.redFlags.slice(0, 4).map((flag, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 line-clamp-1">
                        {flag}
                      </span>
                    ))}
                    {stock.redFlags.length > 4 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        +{stock.redFlags.length - 4} more
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Scan History Timeline ───────────────────────────────── */}
        {history.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <ScanTimeline
              entries={history}
              selectedDate={selectedDate}
              onSelectDate={handleDateSelect}
            />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
