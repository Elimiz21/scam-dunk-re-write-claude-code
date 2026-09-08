import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, Radio, ScanLine, Trash2 } from "lucide-react";

import type { ApiErrorShape, MonitorDto, WatchlistEntryDto } from "@/components/dashboard/types";
import { buildWatchlistView } from "@/components/dashboard/view-model";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeDate } from "@/lib/utils";

interface WatchlistTableProps {
  entries: WatchlistEntryDto[];
  pendingTicker: string | null;
  feedback?: ApiErrorShape | null;
  onRemove: (entry: WatchlistEntryDto) => void;
  onEditMonitor: (entry: WatchlistEntryDto, kind?: MonitorDto["kind"]) => void;
  renderMonitorEditor?: (entry: WatchlistEntryDto) => ReactNode;
}

function activeMonitors(entry: WatchlistEntryDto): MonitorDto[] {
  return entry.monitors.filter((monitor) => monitor.status === "ACTIVE" || monitor.status === "PAUSED");
}

function needsManualRescan(lastScanAt: string | null): boolean {
  if (!lastScanAt) return true;
  const scanTime = new Date(lastScanAt).getTime();
  return Number.isNaN(scanTime) || Date.now() - scanTime >= 7 * 24 * 60 * 60 * 1000;
}

function monitorLabel(monitor: MonitorDto): string {
  const kind = monitor.kind === "FULL" ? "Full monitor" : "Price monitor";
  const frequency = monitor.frequency === "DAILY" ? "Daily" : "Weekly";
  return `${kind} · ${frequency}`;
}

export function WatchlistTable({
  entries,
  pendingTicker,
  feedback,
  onRemove,
  onEditMonitor,
  renderMonitorEditor,
}: WatchlistTableProps) {
  const view = buildWatchlistView(entries, feedback ?? null);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {feedback && (
          <div className="m-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm" role="alert">
            <p className="font-semibold text-destructive">{view.feedback}</p>
            {feedback.code === "UNSUPPORTED_TICKER" && <p className="mt-1 text-xs text-muted-foreground">{view.feedbackDetail}</p>}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Radio className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-semibold">{view.title}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Add a supported US-listed stock, then choose full or price monitoring.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 px-4 sm:px-6">
            {entries.map((entry) => {
              const monitors = activeMonitors(entry);
              const manualOnly = monitors.length === 0;
              const stale = manualOnly && needsManualRescan(entry.lastScanAt);
              return (
                <article key={entry.id} className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-lg border border-border bg-background px-2.5 py-1 font-mono text-xs font-semibold">{entry.ticker}</span>
                        <span className="text-sm text-muted-foreground">
                          {entry.lastScanAt ? `Last scanned ${formatRelativeDate(entry.lastScanAt)}` : "Not scanned yet"}
                        </span>
                      </div>
                      {stale && <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">Rescan recommended</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {monitors.map((monitor) => (
                        <button
                          key={monitor.id}
                          type="button"
                          onClick={() => onEditMonitor(entry, monitor.kind)}
                          className="min-h-10 rounded-full border border-teal/30 bg-teal/10 px-3 text-[11px] font-semibold text-teal transition-colors hover:bg-teal/15"
                        >
                          {monitorLabel(monitor)}
                        </button>
                      ))}
                      {manualOnly && (
                        <button
                          type="button"
                          onClick={() => onEditMonitor(entry)}
                          className="min-h-10 rounded-full border border-border bg-secondary px-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Manual only
                        </button>
                      )}
                      {manualOnly && (
                        <Button asChild variant="outline" size="sm" className="min-h-10 rounded-full">
                          <Link href={`/?ticker=${encodeURIComponent(entry.ticker)}&focus=scan`}>
                            <ScanLine className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Rescan now
                          </Link>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(entry)}
                        disabled={pendingTicker === entry.ticker}
                        aria-label={`Remove ${entry.ticker} from watchlist`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {renderMonitorEditor?.(entry)}
                </article>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2 border-t border-border/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-6">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Adding stocks or changing monitor settings does not use a credit. Each completed scheduled check uses one credit. Monitoring runs after the trading day closes, not live.
        </div>
      </CardContent>
    </Card>
  );
}
