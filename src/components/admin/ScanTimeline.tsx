"use client";

interface ScanTimelineEntry {
  date: string;
  stocksScanned: number;
  highRisk: number;
  suspicious: number;
  format: string;
}

interface ScanTimelineProps {
  entries: ScanTimelineEntry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export default function ScanTimeline({ entries, selectedDate, onSelectDate }: ScanTimelineProps) {
  if (entries.length === 0) return null;

  const maxHigh = Math.max(...entries.map((e) => e.highRisk), 1);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">Scan History</h4>
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
        {entries.map((entry) => {
          const isSelected = entry.date === selectedDate;
          const barHeight = Math.max((entry.highRisk / maxHigh) * 40, 4);
          const isEmpty = entry.stocksScanned === 0;

          return (
            <button
              key={entry.date}
              onClick={() => onSelectDate(entry.date)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg transition-all duration-200 min-w-[60px] ${
                isSelected
                  ? "bg-primary/10 border border-primary/30 shadow-sm"
                  : "hover:bg-secondary border border-transparent"
              } ${isEmpty ? "opacity-40" : ""}`}
            >
              {/* Mini bar */}
              <div className="h-10 flex items-end">
                <div
                  className={`w-5 rounded-t transition-all duration-300 ${
                    isSelected ? "bg-primary" : isEmpty ? "bg-muted-foreground/20" : "bg-muted-foreground/40"
                  }`}
                  style={{ height: `${barHeight}px` }}
                />
              </div>

              {/* Date label */}
              <div className={`text-[10px] tabular-nums whitespace-nowrap ${isSelected ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {entry.date.slice(5)}
              </div>

              {/* Stats */}
              <div className="text-[9px] text-muted-foreground tabular-nums">
                {isEmpty ? "empty" : `${entry.highRisk} HIGH`}
              </div>

              {/* Format badge */}
              {entry.format === "enhanced" && (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Enhanced pipeline" />
              )}
              {entry.format === "legacy" && (
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Legacy pipeline" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
