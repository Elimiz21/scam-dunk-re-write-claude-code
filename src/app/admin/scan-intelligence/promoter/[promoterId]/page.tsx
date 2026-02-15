"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  ArrowLeft,
  Users,
  Shield,
  Clock,
  TrendingUp,
  AlertTriangle,
  Globe,
  Link2,
  ExternalLink,
} from "lucide-react";

interface PromoterStock {
  symbol: string;
  schemeId: string;
  schemeName: string;
  schemeStatus: string;
  firstSeen: string;
  lastSeen: string;
  postCount: number;
}

interface CoPromoter {
  promoterId: string;
  identifier: string;
  platform: string;
  sharedStocks: string[];
}

interface Promoter {
  promoterId: string;
  identifier: string;
  platform: string;
  firstSeen: string;
  lastSeen: string;
  totalPosts: number;
  confidence: string;
  stocksPromoted: PromoterStock[];
  coPromoters: CoPromoter[];
  riskLevel: string;
  isActive: boolean;
}

const riskColors: Record<string, { bg: string; text: string; label: string }> = {
  SERIAL_OFFENDER: { bg: "bg-red-500/10", text: "text-red-600", label: "SERIAL OFFENDER" },
  HIGH: { bg: "bg-red-500/10", text: "text-red-600", label: "HIGH RISK" },
  MEDIUM: { bg: "bg-amber-500/10", text: "text-amber-600", label: "MEDIUM RISK" },
  LOW: { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "LOW RISK" },
};

const statusColors: Record<string, string> = {
  ONGOING: "text-red-600 bg-red-500/10",
  COOLING: "text-amber-600 bg-amber-500/10",
  NEW: "text-indigo-600 bg-indigo-500/10",
  NO_SCAM_DETECTED: "text-emerald-600 bg-emerald-500/10",
  PUMP_AND_DUMP_ENDED: "text-muted-foreground bg-muted",
};

export default function PromoterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const promoterId = params.promoterId as string;
  const [promoter, setPromoter] = useState<Promoter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/scan-intelligence/promoters");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        const match = (data.promoters || []).find(
          (p: Promoter) => p.promoterId === promoterId
        );
        if (!match) {
          setError("Promoter not found");
          return;
        }
        setPromoter(match);
      } catch {
        setError("Failed to load promoter data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [promoterId]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !promoter) {
    return (
      <AdminLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">{error || "Promoter not found"}</p>
          <button onClick={() => router.back()} className="mt-4 text-sm text-primary hover:underline">
            Go back
          </button>
        </div>
      </AdminLayout>
    );
  }

  const risk = riskColors[promoter.riskLevel] || riskColors.LOW;

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
          promoter.riskLevel === "SERIAL_OFFENDER" ? "bg-red-500/5 border-red-500/20" :
          promoter.riskLevel === "HIGH" ? "bg-amber-500/5 border-amber-500/20" :
          "bg-card border-border"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Users className={`h-6 w-6 ${risk.text}`} />
                <h1 className="text-2xl font-bold font-display text-foreground">
                  {promoter.identifier}
                </h1>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${risk.bg} ${risk.text}`}>
                  {risk.label}
                </span>
                {promoter.isActive && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-red-500/10 text-red-600 animate-pulse">
                    ACTIVE NOW
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground ml-9 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" />
                {promoter.platform}
              </p>
              <p className="text-xs text-muted-foreground ml-9 mt-1 font-mono">
                {promoter.promoterId}
              </p>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5">
            <div>
              <div className="text-xs text-muted-foreground">Stocks Promoted</div>
              <div className="text-2xl font-bold tabular-nums">{promoter.stocksPromoted.length}</div>
              <div className="text-[10px] text-muted-foreground">across all time</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Posts</div>
              <div className="text-2xl font-bold tabular-nums">{promoter.totalPosts}</div>
              <div className="text-[10px] text-muted-foreground">promotional</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Co-Promoters</div>
              <div className="text-2xl font-bold tabular-nums flex items-center gap-1">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                {promoter.coPromoters.length}
              </div>
              <div className="text-[10px] text-muted-foreground">linked accounts</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Confidence</div>
              <div className={`text-lg font-bold ${
                promoter.confidence === "high" ? "text-red-600" :
                promoter.confidence === "medium" ? "text-amber-600" :
                "text-muted-foreground"
              }`}>{promoter.confidence.toUpperCase()}</div>
              <div className="text-[10px] text-muted-foreground">detection level</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Active Period</div>
              <div className="text-sm font-medium flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {promoter.firstSeen}
              </div>
              <div className="text-[10px] text-muted-foreground">to {promoter.lastSeen}</div>
            </div>
          </div>
        </div>

        {/* Stocks Promoted - the history */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-medium font-display italic text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-red-500" />
            Stocks Promoted ({promoter.stocksPromoted.length})
          </h3>

          <div className="space-y-2">
            {promoter.stocksPromoted
              .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
              .map((stock, i) => {
                const statusColor = statusColors[stock.schemeStatus] || "text-muted-foreground bg-muted";
                return (
                  <button
                    key={i}
                    onClick={() => router.push(`/admin/scan-intelligence/scheme/${stock.schemeId}`)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold font-display text-foreground">{stock.symbol}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                            {stock.schemeStatus.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{stock.schemeName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold tabular-nums">{stock.postCount}</div>
                        <div className="text-[10px] text-muted-foreground">posts</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">{stock.firstSeen}</div>
                        <div className="text-[10px] text-muted-foreground">to {stock.lastSeen}</div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Co-Promoter Network */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-medium font-display italic text-foreground mb-4 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-purple-500" />
            Co-Promoter Network ({promoter.coPromoters.length} linked accounts)
          </h3>

          {promoter.coPromoters.length > 0 ? (
            <div className="space-y-2">
              {promoter.coPromoters
                .sort((a, b) => b.sharedStocks.length - a.sharedStocks.length)
                .map((co, i) => (
                  <button
                    key={i}
                    onClick={() => router.push(`/admin/scan-intelligence/promoter/${co.promoterId}`)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 hover:border-purple-500/30 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <Users className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{co.identifier}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {co.platform}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-bold text-foreground">
                          {co.sharedStocks.length} shared stock{co.sharedStocks.length !== 1 ? "s" : ""}
                        </div>
                        <div className="flex gap-1 mt-0.5 justify-end">
                          {co.sharedStocks.map((s, j) => (
                            <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 font-medium">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </button>
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No co-promoters detected</p>
              <p className="text-xs mt-1">
                Co-promoters are identified when multiple accounts promote the same stocks
              </p>
            </div>
          )}
        </div>

        {/* Risk Assessment */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-medium font-display italic text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Risk Assessment
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-secondary/30">
              <div className="text-xs text-muted-foreground mb-1">Track Record</div>
              <div className="text-sm text-foreground">
                Promoted <span className="font-bold">{promoter.stocksPromoted.length}</span> stock{promoter.stocksPromoted.length !== 1 ? "s" : ""}
                {" "}with <span className="font-bold">{promoter.totalPosts}</span> total posts
              </div>
              {promoter.stocksPromoted.filter(s => s.schemeStatus === "PUMP_AND_DUMP_ENDED").length > 0 && (
                <div className="text-xs text-red-600 mt-1 font-medium">
                  {promoter.stocksPromoted.filter(s => s.schemeStatus === "PUMP_AND_DUMP_ENDED").length} confirmed pump & dump{promoter.stocksPromoted.filter(s => s.schemeStatus === "PUMP_AND_DUMP_ENDED").length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl bg-secondary/30">
              <div className="text-xs text-muted-foreground mb-1">Network</div>
              <div className="text-sm text-foreground">
                {promoter.coPromoters.length > 0
                  ? `Connected to ${promoter.coPromoters.length} other promoter${promoter.coPromoters.length !== 1 ? "s" : ""}`
                  : "No coordinated network detected"
                }
              </div>
              {promoter.coPromoters.length > 0 && (
                <div className="text-xs text-amber-600 mt-1 font-medium">
                  Possible coordinated promotion ring
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl bg-secondary/30">
              <div className="text-xs text-muted-foreground mb-1">Detection Confidence</div>
              <div className={`text-sm font-medium ${
                promoter.confidence === "high" ? "text-red-600" :
                promoter.confidence === "medium" ? "text-amber-600" :
                "text-muted-foreground"
              }`}>
                {promoter.confidence.toUpperCase()} confidence
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Based on post volume and promotion patterns
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
