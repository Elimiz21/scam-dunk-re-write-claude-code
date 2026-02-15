"use client";

import { Brain, Activity, TreePine, Cpu, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

interface AILayerPanelProps {
  stats: {
    total: number;
    withBackend: number;
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
  };
}

const layers = [
  { key: "layer1" as const, name: "Deterministic", icon: Activity, color: "#6366f1", desc: "Rule-based signals" },
  { key: "layer2" as const, name: "Anomaly", icon: Brain, color: "#f59e0b", desc: "Statistical detection" },
  { key: "layer3" as const, name: "Random Forest", icon: TreePine, color: "#10b981", desc: "ML classification" },
  { key: "layer4" as const, name: "LSTM", icon: Cpu, color: "#ec4899", desc: "Deep learning" },
];

export default function AILayerPanel({ stats }: AILayerPanelProps) {
  const total = stats.total || 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">AI Layer Coverage</h4>
        <span className="text-xs text-muted-foreground">
          {stats.withBackend}/{stats.total} used backend
        </span>
      </div>

      <div className="space-y-2.5">
        {layers.map((layer) => {
          const count = stats[layer.key];
          const pct = Math.round((count / total) * 100);
          const Icon = layer.icon;
          const status = pct === 0 ? "offline" : pct < 50 ? "partial" : "active";

          return (
            <div key={layer.key} className="group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: `${layer.color}20` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: layer.color }} />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-foreground">{layer.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">{layer.desc}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {status === "active" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : status === "partial" ? (
                    <MinusCircle className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                  <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
                    {pct}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: layer.color,
                    opacity: status === "offline" ? 0.2 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Single-stock AI layer display ────────────────────────────────

interface StockAILayersProps {
  aiLayers: {
    layer1_deterministic: number | null;
    layer2_anomaly: number | null;
    layer3_rf: number | null;
    layer4_lstm: number | null;
    combined: number | null;
    usedPythonBackend: boolean;
  };
}

export function StockAILayers({ aiLayers }: StockAILayersProps) {
  const items = [
    { label: "L1 Deterministic", value: aiLayers.layer1_deterministic, color: "#6366f1", isScore: true },
    { label: "L2 Anomaly", value: aiLayers.layer2_anomaly, color: "#f59e0b", isScore: false },
    { label: "L3 Random Forest", value: aiLayers.layer3_rf, color: "#10b981", isScore: false },
    { label: "L4 LSTM", value: aiLayers.layer4_lstm, color: "#ec4899", isScore: false },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg p-2.5"
          style={{ backgroundColor: `${item.color}08`, borderLeft: `2px solid ${item.color}30` }}
        >
          <div className="text-[10px] font-medium text-muted-foreground mb-1">{item.label}</div>
          {item.value !== null ? (
            <div className="text-lg font-bold tabular-nums" style={{ color: item.color }}>
              {item.isScore ? item.value : (item.value * 100).toFixed(1) + "%"}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground/40 italic">offline</div>
          )}
        </div>
      ))}

      {/* Combined score */}
      <div className="col-span-2 md:col-span-4 rounded-lg p-2.5 bg-secondary/50 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Combined Ensemble</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums text-foreground">
            {aiLayers.combined !== null ? (aiLayers.combined * 100).toFixed(1) + "%" : "—"}
          </span>
          {aiLayers.usedPythonBackend && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
              Backend Active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
