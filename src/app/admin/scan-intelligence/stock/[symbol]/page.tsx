"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import { StockAILayers } from "@/components/admin/AILayerPanel";
import SignalGrid from "@/components/admin/SignalGrid";
import ChartCard from "@/components/admin/ChartCard";
import {
  ArrowLeft,
  ExternalLink,
  Shield,
  Globe,
  Newspaper,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface StockData {
  stock: {
    symbol: string;
    name: string;
    exchange: string;
    sector: string;
    industry: string;
    marketCap: number | null;
    lastPrice: number | null;
    avgDailyVolume: number | null;
    avgDollarVolume: number | null;
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
    recentNews: { title: string; date: string; source: string; url: string }[];
    secFilings: { type: string; date: string; url: string }[];
    socialMediaScanned: boolean;
    socialMediaFindings: {
      socialMediaMentions?: { platform: string; source: string; mentionsFound: number; activityLevel: string; promotionRisk: string }[];
      overallPromotionScore?: number;
      promotionRiskLevel?: string;
      overallAssessment?: string;
    } | null;
    schemeId: string | null;
    schemeStatus: string | null;
    evaluatedAt: string;
  };
  foundDate: string;
  socialData: {
    symbol: string;
    name: string;
    riskScore: number;
    socialMediaMentions: { platform: string; source: string; mentionsFound: number; activityLevel: string; promotionRisk: string }[];
    overallPromotionScore: number;
    promotionRiskLevel: string;
    overallAssessment: string;
    recentNews: { title: string; date: string; source: string; url: string }[];
    newsAnalysis: string;
  } | null;
  schemeData: {
    schemeId: string;
    symbol: string;
    name: string;
    status: string;
    firstDetected: string;
    lastSeen: string;
    daysActive: number;
    peakRiskScore: number;
    currentRiskScore: number;
    priceAtDetection: number;
    peakPrice: number;
    currentPrice: number;
    priceChangeFromPeak: number;
    promotionPlatforms: string[];
    signalsDetected: string[];
    timeline: { date: string; event: string; details?: string; significance?: string }[];
  } | null;
  history: { date: string; totalScore: number; riskLevel: string; price: number | null; aiCombined: number | null }[];
}

// ── Page ───────────────────────────────────────────────────────────

export default function StockDeepDivePage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params.symbol as string)?.toUpperCase();

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!symbol) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/scan-intelligence/stock/${symbol}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Stock not found");
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stock");
      } finally {
        setLoading(false);
      }
    })();
  }, [symbol]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-card rounded-xl w-48" />
          <div className="h-32 bg-card rounded-2xl border border-border" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-48 bg-card rounded-2xl border border-border" />
            <div className="h-48 bg-card rounded-2xl border border-border" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <AlertBanner type="error" title={`Stock ${symbol} Not Found`} message={error || "No data available for this stock."} />
      </AdminLayout>
    );
  }

  const { stock, socialData, schemeData, history } = data;
  const riskColor = stock.riskLevel === "HIGH" ? "#ef4444" : stock.riskLevel === "MEDIUM" ? "#f59e0b" : "#10b981";

  // Prepare chart data
  const scoreHistory = history.map((h) => ({
    label: h.date.slice(5),
    value: h.totalScore,
  }));

  const priceHistory = history
    .filter((h) => h.price !== null)
    .map((h) => ({
      label: h.date.slice(5),
      value: h.price!,
    }));

  // Social mentions
  const socialMentions = socialData?.socialMediaMentions ?? stock.socialMediaFindings?.socialMediaMentions ?? [];
  const promotionScore = socialData?.overallPromotionScore ?? stock.socialMediaFindings?.overallPromotionScore ?? 0;
  const newsItems = socialData?.recentNews ?? stock.recentNews ?? [];
  const newsAnalysisText = socialData?.newsAnalysis ?? stock.newsAnalysis ?? "";

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Scan Intelligence
        </button>

        {/* ── Stock Header ─────────────────────────────────────── */}
        <div
          className="rounded-2xl p-5 border"
          style={{ borderColor: `${riskColor}40`, backgroundColor: `${riskColor}08` }}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold font-display text-foreground">{stock.symbol}</h1>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: `${riskColor}20`, color: riskColor }}
                >
                  {stock.riskLevel} RISK
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                  {stock.exchange}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{stock.name}</p>
              <p className="text-xs text-muted-foreground/70">
                {stock.sector} / {stock.industry}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-3xl font-bold tabular-nums text-foreground">
                  {stock.totalScore}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Risk Score</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-foreground">
                  {stock.lastPrice ? `$${stock.lastPrice.toFixed(2)}` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Price</div>
              </div>
              <div className="text-right">
                <div className="text-lg tabular-nums text-muted-foreground">
                  {stock.marketCap
                    ? stock.marketCap > 1e9
                      ? `$${(stock.marketCap / 1e9).toFixed(1)}B`
                      : `$${(stock.marketCap / 1e6).toFixed(0)}M`
                    : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Mkt Cap</div>
              </div>
            </div>
          </div>

          {/* Scan date */}
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Scan date: {data.foundDate} at {new Date(stock.evaluatedAt).toLocaleTimeString()}
          </div>
        </div>

        {/* ── AI Analysis ──────────────────────────────────────── */}
        {stock.aiLayers && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="text-sm font-medium font-display italic text-foreground mb-3">
              AI Layer Analysis
            </h3>
            <StockAILayers aiLayers={stock.aiLayers} />
          </div>
        )}

        {/* ── Signal Breakdown ─────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-medium font-display italic text-foreground mb-3">
            Detected Signals ({stock.signals.length})
          </h3>
          <SignalGrid signals={stock.signals} />
        </div>

        {/* ── Charts (2-col) ───────────────────────────────────── */}
        {history.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scoreHistory.length > 1 && (
              <ChartCard
                title="Risk Score History"
                data={scoreHistory}
                type="line"
                color="#ef4444"
              />
            )}
            {priceHistory.length > 1 && (
              <ChartCard
                title="Price History"
                data={priceHistory}
                type="line"
                color="#6366f1"
              />
            )}
          </div>
        )}

        {/* ── News & SEC Analysis ──────────────────────────────── */}
        {(newsItems.length > 0 || newsAnalysisText) && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium font-display italic text-foreground">
                News & SEC Analysis
              </h3>
              {stock.hasLegitimateNews ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
                  Legitimate News Found
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium">
                  No Legitimate Catalyst
                </span>
              )}
            </div>

            {newsAnalysisText && (
              <div className="bg-secondary/50 rounded-lg p-3 mb-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{newsAnalysisText}</p>
              </div>
            )}

            {newsItems.length > 0 && (
              <div className="space-y-2">
                {newsItems.map((news, i) => (
                  <a
                    key={i}
                    href={news.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <ExternalLink className="h-3 w-3 text-muted-foreground/40 mt-0.5 group-hover:text-primary flex-shrink-0" />
                    <div>
                      <p className="text-xs text-foreground group-hover:text-primary line-clamp-2">{news.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {news.source} &middot; {news.date}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {stock.secFilings && stock.secFilings.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <h4 className="text-xs font-medium text-foreground mb-2">SEC Filings</h4>
                <div className="space-y-1">
                  {stock.secFilings.map((filing, i) => (
                    <a
                      key={i}
                      href={filing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
                    >
                      <span className="font-medium">{filing.type}</span>
                      <span>&middot; {filing.date}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Social Media Evidence ────────────────────────────── */}
        {socialMentions.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium font-display italic text-foreground">
                  Social Media Evidence
                </h3>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                promotionScore >= 50 ? "bg-red-500/10 text-red-600" :
                promotionScore >= 30 ? "bg-amber-500/10 text-amber-600" :
                "bg-secondary text-muted-foreground"
              }`}>
                Promotion Score: {promotionScore}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {socialMentions.map((m, i) => (
                <div key={i} className="rounded-lg p-3 bg-secondary/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{m.platform}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      m.promotionRisk === "high" ? "bg-red-500/10 text-red-600" :
                      m.promotionRisk === "medium" ? "bg-amber-500/10 text-amber-600" :
                      "bg-emerald-500/10 text-emerald-600"
                    }`}>
                      {m.promotionRisk}
                    </span>
                  </div>
                  <div className="text-lg font-bold tabular-nums">{m.mentionsFound}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {m.activityLevel} activity &middot; {m.source}
                  </div>
                </div>
              ))}
            </div>

            {(socialData?.overallAssessment || stock.socialMediaFindings?.overallAssessment) && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {socialData?.overallAssessment || stock.socialMediaFindings?.overallAssessment}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Scheme Membership ────────────────────────────────── */}
        {schemeData && (
          <div className="bg-card rounded-2xl border border-red-500/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-medium font-display italic text-foreground">
                Scheme: {schemeData.schemeId}
              </h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                schemeData.status === "ONGOING" ? "bg-red-500/10 text-red-600" :
                schemeData.status === "COOLING" ? "bg-amber-500/10 text-amber-600" :
                "bg-emerald-500/10 text-emerald-600"
              }`}>
                {schemeData.status}
              </span>
            </div>

            {/* Price journey */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Price at Detection</div>
                <div className="text-lg font-bold tabular-nums">${schemeData.priceAtDetection.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">{schemeData.firstDetected}</div>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Peak Price</div>
                <div className="text-lg font-bold tabular-nums">${schemeData.peakPrice.toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Current Price</div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold tabular-nums">${schemeData.currentPrice.toFixed(2)}</span>
                  {schemeData.priceChangeFromPeak < -5 && <TrendingDown className="h-4 w-4 text-red-500" />}
                  {schemeData.priceChangeFromPeak > 5 && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                </div>
                <div className={`text-xs font-bold tabular-nums ${schemeData.priceChangeFromPeak < 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {schemeData.priceChangeFromPeak > 0 ? "+" : ""}{schemeData.priceChangeFromPeak.toFixed(1)}% from peak
                </div>
              </div>
            </div>

            {/* Timeline */}
            {schemeData.timeline.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">Scheme Timeline</h4>
                <div className="space-y-2 relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                  {schemeData.timeline.map((evt, i) => (
                    <div key={i} className="flex items-start gap-3 relative">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 z-10 ${
                        evt.significance === "high"
                          ? "bg-red-500 border-red-500"
                          : "bg-card border-border"
                      }`} />
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] tabular-nums text-muted-foreground">{evt.date}</span>
                          <span className={`text-xs ${evt.significance === "high" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                            {evt.event}
                          </span>
                        </div>
                        {evt.details && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">{evt.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Platforms */}
            {schemeData.promotionPlatforms.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">Platforms: </span>
                {schemeData.promotionPlatforms.map((p) => (
                  <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground mx-0.5">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
