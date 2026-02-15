"use client";

import { ChevronRight } from "lucide-react";

interface FunnelStage {
  label: string;
  value: number;
  color: string;
  detail?: string;
}

interface RiskFunnelProps {
  stages: FunnelStage[];
}

export default function RiskFunnel({ stages }: RiskFunnelProps) {
  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="flex items-stretch gap-1 w-full">
      {stages.map((stage, i) => {
        const widthPct = Math.max((stage.value / maxValue) * 100, 12);
        return (
          <div key={stage.label} className="flex items-center" style={{ flex: `${widthPct} 1 0%` }}>
            <div
              className="flex-1 rounded-xl p-3 transition-all duration-500 group hover:scale-[1.02]"
              style={{
                backgroundColor: `${stage.color}15`,
                borderLeft: `3px solid ${stage.color}`,
              }}
            >
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: stage.color }}
              >
                {stage.value.toLocaleString()}
              </div>
              <div className="text-[11px] font-medium text-muted-foreground mt-0.5 leading-tight">
                {stage.label}
              </div>
              {stage.detail && (
                <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {stage.detail}
                </div>
              )}
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 mx-0.5 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
