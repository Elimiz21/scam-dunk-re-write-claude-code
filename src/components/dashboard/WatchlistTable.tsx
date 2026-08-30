import Link from "next/link";
import { CalendarClock, Radio, ScanLine, Trash2 } from "lucide-react";

import type {
  ApiErrorShape,
  WatchlistEntryDto,
} from "@/components/dashboard/types";
import { buildWatchlistView } from "@/components/dashboard/view-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface WatchlistTableProps {
  entries: WatchlistEntryDto[];
  pendingTicker: string | null;
  feedback?: ApiErrorShape | null;
  onRemove: (entry: WatchlistEntryDto) => void;
  onEditMonitor: (entry: WatchlistEntryDto) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "No published data yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
}

function hasActiveMonitoring(entry: WatchlistEntryDto): boolean {
  return entry.monitors.some((monitor) => monitor.status === "ACTIVE");
}

function needsManualRescan(lastScanAt: string | null): boolean {
  if (!lastScanAt) return true;
  const scanTime = new Date(lastScanAt).getTime();
  if (Number.isNaN(scanTime)) return true;
  return Date.now() - scanTime >= 7 * 24 * 60 * 60 * 1000;
}

function ScanStatus({ entry }: { entry: WatchlistEntryDto }) {
  const manualOnly = !hasActiveMonitoring(entry);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Last scan: {entry.lastScanAt ? formatDate(entry.lastScanAt) : "No scan yet"}
      </p>
      {manualOnly && needsManualRescan(entry.lastScanAt) && (
        <p className="text-xs font-semibold text-primary" role="status">
          Scan again recommended
        </p>
      )}
    </div>
  );
}

function MonitorBadges({ entry }: { entry: WatchlistEntryDto }) {
  const activeMonitors = entry.monitors.filter(
    (monitor) => monitor.status === "ACTIVE" || monitor.status === "PAUSED",
  );
  if (activeMonitors.length === 0) {
    return <span className="text-xs text-muted-foreground">No active monitoring</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {activeMonitors.map((monitor) => (
        <div key={monitor.id} className="rounded-lg border border-border/70 px-2.5 py-1.5">
          <Badge variant={monitor.status === "ACTIVE" ? "secondary" : "outline"} className="normal-case tracking-normal">
            {monitor.kind === "FULL" ? "Full" : "Price"} · {monitor.frequency === "DAILY" ? "Daily" : "Weekly"} · {monitor.status.toLowerCase()}
          </Badge>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Next: {formatDate(monitor.nextEvaluationAt)} · Ends: {formatDate(monitor.expiresAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function WatchlistTable({
  entries,
  pendingTicker,
  feedback,
  onRemove,
  onEditMonitor,
}: WatchlistTableProps) {
  const view = buildWatchlistView(entries, feedback ?? null);
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
          {view.creditNotice} Scheduled checks use one credit only when a completed result is published.
        </div>
        {feedback && (
          <div
            className="m-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
            role="alert"
          >
            <p className="font-semibold text-destructive">{view.feedback}</p>
            {feedback.code === "UNSUPPORTED_TICKER" && (
              <p className="mt-1 text-xs text-muted-foreground">{view.feedbackDetail}</p>
            )}
          </div>
        )}
        {entries.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Radio className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-semibold">{view.title}</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              Add a supported US-listed common stock above, then choose whether to monitor price-only or the full risk scan.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[18%] px-5 py-3 font-semibold">Stock</th>
                    <th className="w-[24%] px-5 py-3 font-semibold">Last scan / market data</th>
                    <th className="w-[34%] px-5 py-3 font-semibold">Active monitoring</th>
                    <th className="w-[24%] px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border/60">
                      <td className="px-5 py-4 font-semibold">{entry.ticker}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        <p>{formatDate(entry.lastDataAt)}</p>
                        <ScanStatus entry={entry} />
                      </td>
                      <td className="px-5 py-4"><MonitorBadges entry={entry} /></td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="min-h-10" onClick={() => onEditMonitor(entry)}>
                            <CalendarClock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Monitor
                          </Button>
                          {!hasActiveMonitoring(entry) && (
                            <Button asChild variant="brand" size="sm" className="min-h-10">
                              <Link href={`/?ticker=${encodeURIComponent(entry.ticker)}`}>
                                <ScanLine className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                Scan now
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-destructive"
                            onClick={() => onRemove(entry)}
                            disabled={pendingTicker === entry.ticker}
                            aria-label={`Remove ${entry.ticker} from watchlist`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border/60 md:hidden">
              {entries.map((entry) => (
                <article key={entry.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{entry.ticker}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Last data: {formatDate(entry.lastDataAt)}</p>
                      <ScanStatus entry={entry} />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-destructive"
                      onClick={() => onRemove(entry)}
                      disabled={pendingTicker === entry.ticker}
                      aria-label={`Remove ${entry.ticker} from watchlist`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <MonitorBadges entry={entry} />
                  <Button variant="outline" className="min-h-11 w-full" onClick={() => onEditMonitor(entry)}>
                    Manage monitoring
                  </Button>
                  {!hasActiveMonitoring(entry) && (
                    <Button asChild variant="brand" className="min-h-11 w-full">
                      <Link href={`/?ticker=${encodeURIComponent(entry.ticker)}`}>
                        <ScanLine className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Scan now
                      </Link>
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
