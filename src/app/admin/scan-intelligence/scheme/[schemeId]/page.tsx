"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  ArrowLeft,
  Shield,
  Clock,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Users,
  ExternalLink,
  Globe,
} from "lucide-react";

interface Scheme {
  schemeId: string;
  symbol: string;
  name: string;
  schemeName: string;
  sector: string;
  industry: string;
  status: string;
  firstDetected: string;
  lastSeen: string;
  daysActive: number;
  currentRiskScore: number;
  peakRiskScore: number;
  currentPromotionScore: number;
  peakPromotionScore: number;
  priceAtDetection: number;
  peakPrice: number;
  currentPrice: number;
  priceChangeFromDetection: number;
  priceChangeFromPeak: number;
  promotionPlatforms: string[];
  promoterAccounts: { platform: string; identifier: string; postCount: number; confidence: string; firstSeen: string; lastSeen: string }[];
  coordinationIndicators: string[];
  signalsDetected: string[];
  timeline: { date: string; event: string; category?: string; details?: string; significance?: string }[];
  notes: string[];
  investigationFlags: string[];
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  ONGOING: { bg: "bg-red-500/10", text: "text-red-600", label: "ONGOING" },
  COOLING: { bg: "bg-amber-500/10", text: "text-amber-600", label: "COOLING DOWN" },
  NEW: { bg: "bg-indigo-500/10", text: "text-indigo-600", label: "NEWLY DETECTED" },
  NO_SCAM_DETECTED: { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "CLEARED" },
  PUMP_AND_DUMP_ENDED: { bg: "bg-muted", text: "text-muted-foreground", label: "P&D ENDED" },
};

const confidenceColors: Record<string, string> = {
  high: "text-red-600 bg-red-500/10",
  medium: "text-amber-600 bg-amber-500/10",
  low: "text-muted-foreground bg-secondary",
};

export default function SchemeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schemeId = params.schemeId as string;
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/scan-intelligence/schemes");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        const all = [...(data.active || []), ...(data.resolved || [])];
        const match = all.find((s: Scheme) => s.schemeId === schemeId);
        if (!match) {
          setError("Scheme not found");
          return;
        }
        setScheme(match);
      } catch {
        setError("Failed to load scheme data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [schemeId]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !scheme) {
    return (
      <AdminLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">{error || "Scheme not found"}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Go back
          </button>
        </div>
      </AdminLayout>
    );
  }

  const config = statusConfig[scheme.status] || statusConfig.ONGOING;
  const priceDown = scheme.priceChangeFromPeak < -5;
  const priceUp = scheme.priceChangeFromPeak > 5;

  // Group timeline by category
  const timelineByCategory: Record<string, typeof scheme.timeline> = {};
  for (const evt of scheme.timeline) {
    const cat = evt.category || "other";
    if (!timelineByCategory[cat]) timelineByCategory[cat] = [];
    timelineByCategory[cat].push(evt);
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Scan Intelligence
        </button>

        {/* Header */}
        <div className={`rounded-2xl border p-6 ${
          scheme.status === "ONGOING" ? "bg-red-500/5 border-red-500/20" :
          scheme.status === "COOLING" ? "bg-amber-500/5 border-amber-500/20" :
          "bg-card border-border"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Shield className={`h-6 w-6 ${config.text}`} />
                <h1 className="text-2xl font-bold font-display text-foreground">
                  {scheme.schemeName}
                </h1>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${config.bg} ${config.text}`}>
                  {config.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground ml-9">
                {scheme.name} &middot; {scheme.sector} &middot; {scheme.industry}
              </p>
              <p className="text-xs text-muted-foreground ml-9 mt-1 font-mono">
                {scheme.schemeId}
              </p>
            </div>
            <button
              onClick={() => router.push(`/admin/scan-intelligence/stock/${scheme.symbol}`)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View Stock
            </button>
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5">
            <div>
              <div className="text-xs text-muted-foreground">Risk Score</div>
              <div className="text-2xl font-bold tabular-nums">{scheme.currentRiskScore}</div>
              <div className="text-[10px] text-muted-foreground">peak: {scheme.peakRiskScore}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Promotion Score</div>
              <div className="text-2xl font-bold tabular-nums">{scheme.currentPromotionScore}</div>
              <div className="text-[10px] text-muted-foreground">peak: {scheme.peakPromotionScore}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Days Active</div>
              <div className="text-2xl font-bold tabular-nums flex items-center gap-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {scheme.daysActive}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {scheme.firstDetected} &rarr; {scheme.lastSeen}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Platforms</div>
              <div className="text-2xl font-bold tabular-nums">{scheme.promotionPlatforms.length}</div>
              <div className="text-[10px] text-muted-foreground">channels detected</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Promoters</div>
              <div className="text-2xl font-bold tabular-nums">{scheme.promoterAccounts.length}</div>
              <div className="text-[10px] text-muted-foreground">accounts identified</div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Price Journey */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="text-sm font-medium font-display italic text-foreground mb-4">
              Price Journey
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">At Detection</div>
                  <div className="text-xl font-bold tabular-nums">${scheme.priceAtDetection.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Peak</div>
                  <div className="text-xl font-bold tabular-nums text-amber-600">${scheme.peakPrice.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Current</div>
                  <div className="text-xl font-bold tabular-nums flex items-center gap-1 justify-end">
                    ${scheme.currentPrice.toFixed(2)}
                    {priceDown && <TrendingDown className="h-4 w-4 text-red-500" />}
                    {priceUp && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                  </div>
                </div>
              </div>

              {/* Progress bar showing price journey */}
              <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
                {scheme.peakPrice > 0 && (
                  <>
                    <div
                      className="absolute h-full bg-amber-500/30 rounded-full"
                      style={{ width: `${Math.min(100, (scheme.peakPrice / scheme.peakPrice) * 100)}%` }}
                    />
                    <div
                      className={`absolute h-full rounded-full ${priceDown ? "bg-red-500/50" : "bg-emerald-500/50"}`}
                      style={{ width: `${Math.min(100, (scheme.currentPrice / scheme.peakPrice) * 100)}%` }}
                    />
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-muted-foreground">From Detection</div>
                  <div className={`text-lg font-bold tabular-nums ${scheme.priceChangeFromDetection > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {scheme.priceChangeFromDetection > 0 ? "+" : ""}{scheme.priceChangeFromDetection.toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-muted-foreground">From Peak</div>
                  <div className={`text-lg font-bold tabular-nums ${scheme.priceChangeFromPeak > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {scheme.priceChangeFromPeak > 0 ? "+" : ""}{scheme.priceChangeFromPeak.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signals Detected */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="text-sm font-medium font-display italic text-foreground mb-4">
              Signals Detected ({scheme.signalsDetected.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {scheme.signalsDetected.map((signal, i) => (
                <span
                  key={i}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700"
                >
                  {signal.replace(/_/g, " ")}
                </span>
              ))}
            </div>

            {/* Investigation flags */}
            {scheme.investigationFlags.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="text-xs font-medium text-red-600 mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Investigation Flags
                </h4>
                <div className="space-y-1">
                  {scheme.investigationFlags.map((flag, i) => (
                    <div key={i} className="text-xs text-red-600 bg-red-500/5 rounded-lg px-3 py-2">
                      {flag}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {scheme.notes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="text-xs font-medium text-foreground mb-2">Notes</h4>
                <div className="space-y-1">
                  {scheme.notes.map((note, i) => (
                    <div key={i} className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coordination Evidence */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-medium font-display italic text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Coordination Evidence
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Platforms */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Promotion Platforms</h4>
              <div className="space-y-2">
                {scheme.promotionPlatforms.map((platform, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                    <Globe className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-medium text-foreground">{platform}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coordination indicators */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Indicators</h4>
              <div className="space-y-2">
                {scheme.coordinationIndicators.length > 0 ? (
                  scheme.coordinationIndicators.map((ind, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-foreground">{ind}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No specific coordination indicators recorded</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Promoter Accounts */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-medium font-display italic text-foreground mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            Identified Promoter Accounts
          </h3>

          {scheme.promoterAccounts.length > 0 ? (
            <div className="space-y-2">
              {scheme.promoterAccounts.map((promoter, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Users className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{promoter.identifier}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {promoter.platform} &middot; First seen: {promoter.firstSeen} &middot; Last: {promoter.lastSeen}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums">{promoter.postCount}</div>
                      <div className="text-[10px] text-muted-foreground">posts</div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${confidenceColors[promoter.confidence] || confidenceColors.low}`}>
                      {promoter.confidence}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No individual promoter accounts identified yet</p>
              <p className="text-xs mt-1">
                Promotion was detected on {scheme.promotionPlatforms.length} platform{scheme.promotionPlatforms.length !== 1 ? "s" : ""} but
                specific accounts have not been linked
              </p>
            </div>
          )}
        </div>

        {/* Full Timeline */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-medium font-display italic text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Full Timeline ({scheme.timeline.length} events)
          </h3>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-3">
              {scheme.timeline.map((evt, i) => {
                const isHigh = evt.significance === "high";
                const isDetection = evt.category === "detection";
                const isStatusChange = evt.category === "status_change";

                return (
                  <div key={i} className="flex items-start gap-3 relative">
                    {/* Dot */}
                    <div className={`relative z-10 mt-1.5 h-[15px] w-[15px] rounded-full border-2 flex-shrink-0 ${
                      isDetection ? "bg-red-500 border-red-500" :
                      isStatusChange ? "bg-amber-500 border-amber-500" :
                      isHigh ? "bg-primary border-primary" :
                      "bg-card border-border"
                    }`} />

                    <div className={`flex-1 rounded-lg p-3 ${
                      isHigh ? "bg-primary/5 border border-primary/20" : "bg-secondary/30"
                    }`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] tabular-nums text-muted-foreground font-medium">{evt.date}</span>
                        {evt.category && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            isDetection ? "bg-red-500/10 text-red-600" :
                            isStatusChange ? "bg-amber-500/10 text-amber-600" :
                            "bg-secondary text-muted-foreground"
                          }`}>
                            {evt.category.replace(/_/g, " ").toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs ${isHigh ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {evt.event}
                      </p>
                      {evt.details && (
                        <p className="text-[10px] text-muted-foreground mt-1">{evt.details}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
