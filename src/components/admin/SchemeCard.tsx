"use client";

import { TrendingDown, TrendingUp, Clock, AlertTriangle, Shield, ExternalLink } from "lucide-react";

interface SchemeCardProps {
  scheme: {
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
  };
  onClick?: () => void;
}

const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  ONGOING: { bg: "bg-red-500/10", text: "text-red-600", border: "border-red-500/30", label: "ONGOING" },
  COOLING: { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30", label: "COOLING" },
  NEW: { bg: "bg-indigo-500/10", text: "text-indigo-600", border: "border-indigo-500/30", label: "NEW" },
  NO_SCAM_DETECTED: { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/30", label: "CLEARED" },
  PUMP_AND_DUMP_ENDED: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", label: "ENDED" },
};

export default function SchemeCard({ scheme, onClick }: SchemeCardProps) {
  const config = statusConfig[scheme.status] || statusConfig.ONGOING;
  const priceDown = scheme.priceChangeFromPeak < -5;
  const priceUp = scheme.priceChangeFromPeak > 5;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border ${config.border} p-4 transition-all duration-200 hover:shadow-md hover:scale-[1.01] bg-card`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold font-display text-foreground">{scheme.symbol}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
              {config.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{scheme.name}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-foreground">{scheme.currentRiskScore}</div>
          <div className="text-[10px] text-muted-foreground">risk score</div>
        </div>
      </div>

      {/* Price journey */}
      <div className="flex items-center gap-3 mb-3 text-xs">
        <div className="flex-1">
          <div className="text-muted-foreground">Detection</div>
          <div className="font-medium tabular-nums">${scheme.priceAtDetection.toFixed(2)}</div>
        </div>
        <div className="flex-1">
          <div className="text-muted-foreground">Peak</div>
          <div className="font-medium tabular-nums">${scheme.peakPrice.toFixed(2)}</div>
        </div>
        <div className="flex-1">
          <div className="text-muted-foreground">Current</div>
          <div className="flex items-center gap-1">
            <span className="font-medium tabular-nums">${scheme.currentPrice.toFixed(2)}</span>
            {priceDown && <TrendingDown className="h-3 w-3 text-red-500" />}
            {priceUp && <TrendingUp className="h-3 w-3 text-emerald-500" />}
          </div>
        </div>
        {scheme.priceChangeFromPeak !== 0 && (
          <div className={`text-sm font-bold tabular-nums ${priceDown ? "text-red-500" : priceUp ? "text-emerald-500" : "text-muted-foreground"}`}>
            {scheme.priceChangeFromPeak > 0 ? "+" : ""}{scheme.priceChangeFromPeak.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {scheme.daysActive}d active
        </span>
        <span className="flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Promo: {scheme.currentPromotionScore}
        </span>
        {scheme.promotionPlatforms.length > 0 && (
          <span className="flex items-center gap-1">
            {scheme.promotionPlatforms.slice(0, 3).join(", ")}
            {scheme.promotionPlatforms.length > 3 && ` +${scheme.promotionPlatforms.length - 3}`}
          </span>
        )}
      </div>

      {/* Mini timeline */}
      {scheme.timeline.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="space-y-1">
            {scheme.timeline.slice(-3).map((evt, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px]">
                <span className="text-muted-foreground/50 tabular-nums whitespace-nowrap">{evt.date}</span>
                <span className={`${evt.significance === "high" ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {evt.event}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}
