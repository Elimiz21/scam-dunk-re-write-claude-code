"use client";

import { AlertTriangle, TrendingUp, Shield, Activity } from "lucide-react";

interface Signal {
  code: string;
  category: string;
  weight: number;
  description: string;
}

interface SignalGridProps {
  signals: Signal[];
  compact?: boolean;
}

const categoryConfig: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  STRUCTURAL: { icon: Shield, color: "text-indigo-600", bg: "bg-indigo-500/10" },
  PATTERN: { icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-500/10" },
  ALERT: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-500/10" },
  BEHAVIORAL: { icon: Activity, color: "text-purple-600", bg: "bg-purple-500/10" },
};

export default function SignalGrid({ signals, compact = false }: SignalGridProps) {
  if (signals.length === 0) {
    return <p className="text-sm text-muted-foreground">No signals detected</p>;
  }

  // Group by category
  const grouped: Record<string, Signal[]> = {};
  for (const s of signals) {
    const cat = s.category || "OTHER";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {signals.map((s, i) => {
          const conf = categoryConfig[s.category] || categoryConfig.PATTERN;
          return (
            <span
              key={`${s.code}-${i}`}
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${conf.bg} ${conf.color}`}
              title={s.description}
            >
              {s.code.replace(/_/g, " ")}
              <span className="opacity-50">w{s.weight}</span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([category, sigs]) => {
        const conf = categoryConfig[category] || categoryConfig.PATTERN;
        const Icon = conf.icon;

        return (
          <div key={category}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon className={`h-3.5 w-3.5 ${conf.color}`} />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                {category}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({sigs.length} signal{sigs.length > 1 ? "s" : ""})
              </span>
            </div>
            <div className="space-y-1">
              {sigs.map((s, i) => (
                <div
                  key={`${s.code}-${i}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${conf.bg}`}
                >
                  <div>
                    <span className={`text-xs font-medium ${conf.color}`}>
                      {s.code.replace(/_/g, " ")}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.description}</p>
                  </div>
                  <span className={`text-xs font-bold tabular-nums ${conf.color}`}>
                    +{s.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
