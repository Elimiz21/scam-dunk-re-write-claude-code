"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChartNoAxesCombined,
  Clock3,
  Loader2,
  Search,
  Settings,
  X,
} from "lucide-react";

import { MonitorEditor, type MonitorSaveRequest } from "@/components/dashboard/MonitorEditor";
import { ScanSocialEvidence } from "@/components/dashboard/ScanSocialEvidence";
import type {
  ApiErrorShape,
  DashboardPayload,
  ScanDetailDto,
  SortDirection,
  UnifiedMarketFilter,
  UnifiedMarketRow,
  UnifiedMarketSort,
} from "@/components/dashboard/types";
import { readApiError } from "@/components/dashboard/types";
import {
  buildUnifiedMarketRows,
  filterUnifiedMarketRows,
  sortUnifiedMarketRows,
} from "@/components/dashboard/view-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatRelativeDate } from "@/lib/utils";

interface UnifiedMarketTableProps {
  data: DashboardPayload;
  onRefresh: () => void | Promise<void>;
}

function riskVariant(label: UnifiedMarketRow["riskLabel"]) {
  if (label === "High risk") return "high" as const;
  if (label === "Caution") return "medium" as const;
  return "low" as const;
}

function numberLabel(value: number | null, style: "price" | "percent" | "score") {
  if (value === null) return "—";
  if (style === "price") return `$${value.toFixed(2)}`;
  if (style === "percent") return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  return String(Math.round(value));
}

export function UnifiedMarketTable({ data, onRefresh }: UnifiedMarketTableProps) {
  const [filter, setFilter] = useState<UnifiedMarketFilter>("ALL");
  const [sort, setSort] = useState<UnifiedMarketSort>("DEFAULT");
  const [direction, setDirection] = useState<SortDirection>("DESC");
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyDetail, setHistoryDetail] = useState<ScanDetailDto | null>(null);
  const [historyDetailStatus, setHistoryDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [monitorKey, setMonitorKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [monitorError, setMonitorError] = useState<ApiErrorShape | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const allRows = useMemo(
    () => buildUnifiedMarketRows({
      watchlist: data.watchlist,
      recentScans: data.recentScans,
      pumpRadarRows: data.pumpRadar.rows,
    }),
    [data],
  );
  const rows = useMemo(
    () => sortUnifiedMarketRows(filterUnifiedMarketRows(allRows, filter), sort, direction),
    [allRows, direction, filter, sort],
  );
  const history = data.recentScans.filter((scan) =>
    scan.ticker.toUpperCase().includes(historyQuery.trim().toUpperCase()),
  );
  const counts = {
    ALL: allRows.length,
    WATCHING: allRows.filter((row) => row.tracked).length,
    RADAR: allRows.filter((row) => row.source === "RADAR").length,
    HIGH: allRows.filter((row) => row.riskLabel === "High risk").length,
  };

  function changeSort(next: UnifiedMarketSort) {
    if (sort === next) setDirection((current) => current === "ASC" ? "DESC" : "ASC");
    else {
      setSort(next);
      setDirection(next === "PRICE" ? "ASC" : "DESC");
    }
  }

  async function remove(row: UnifiedMarketRow) {
    if (!row.watchlistEntry) return;
    setActionError(null);
    setPendingKey(row.key);
    try {
      const response = await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: row.ticker }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setActionError(readApiError(body, `${row.ticker} could not be removed from your watchlist.`).message);
        return;
      }
      window.dispatchEvent(new Event("scamdunk:watchlist-updated"));
      await onRefresh();
    } catch {
      setActionError(`${row.ticker} could not be removed from your watchlist. Please try again.`);
    } finally {
      setPendingKey(null);
    }
  }

  async function saveMonitor(request: MonitorSaveRequest) {
    setPendingKey(monitorKey);
    setMonitorError(null);
    try {
      const response = await fetch("/api/monitors", {
        method: request.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.mode === "create" ? {
          watchlistEntryId: request.watchlistEntryId,
          kind: "FULL",
          frequency: request.frequency,
          durationMonths: request.durationMonths,
        } : {
          id: request.id,
          frequency: request.frequency,
          durationMonths: request.durationMonths,
        }),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setMonitorError(readApiError(body, "The monitor could not be saved."));
        return;
      }
      setMonitorKey(null);
      await onRefresh();
    } catch {
      setMonitorError({ code: "MONITORS_UNAVAILABLE", message: "The monitor could not be saved." });
    } finally {
      setPendingKey(null);
    }
  }

  async function openHistoryDetail(id: string) {
    setHistoryDetail(null);
    setHistoryDetailError(null);
    setHistoryDetailStatus("loading");
    try {
      const response = await fetch(`/api/scans/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "Scan details are temporarily unavailable.").message);
      }
      setHistoryDetail(body as ScanDetailDto);
      setHistoryDetailStatus("idle");
      window.requestAnimationFrame(() => {
        document.getElementById("dashboard-scan-detail")?.focus();
      });
    } catch (caught) {
      setHistoryDetailStatus("error");
      setHistoryDetailError(caught instanceof Error ? caught.message : "Scan details are temporarily unavailable.");
    }
  }

  const filterLabels: Array<[UnifiedMarketFilter, string]> = [
    ["ALL", "All"],
    ["WATCHING", "Watching"],
    ["RADAR", "Radar suspects"],
    ["HIGH", "High risk"],
  ];

  if (showHistory) {
    return (
      <section aria-labelledby="scan-history-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="scan-history-title" className="font-editorial text-2xl">Scan history</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your most recent completed checks.</p>
          </div>
          <Button variant="outline" className="min-h-11 rounded-full" onClick={() => { setShowHistory(false); setHistoryDetail(null); }}>Back to market</Button>
        </div>
        <label className="relative block max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search scan history" className="min-h-11 rounded-full pl-11" />
        </label>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {history.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No matching scans.</p> : (
            <ul className="divide-y divide-border/60">
              {history.map((scan) => (
                <li key={scan.id}>
                  <button type="button" onClick={() => void openHistoryDetail(scan.id)} className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50">
                    <span><strong className="font-mono text-sm">{scan.ticker}</strong><span className="ml-3 text-xs text-muted-foreground">{formatRelativeDate(scan.scannedAt)}</span></span>
                    <Badge variant={riskVariant(scan.riskLabel)}>{scan.riskLabel} · {scan.score}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {historyDetailStatus === "loading" && <div className="flex min-h-28 items-center justify-center rounded-2xl border border-border bg-card" aria-live="polite"><Loader2 className="mr-2 h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" /><span className="text-sm text-muted-foreground">Loading scan details</span></div>}
        {historyDetailStatus === "error" && <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{historyDetailError}</div>}
        {historyDetail && <section id="dashboard-scan-detail" tabIndex={-1} aria-labelledby="dashboard-scan-detail-title" className="space-y-4 rounded-2xl border border-border bg-card p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-widest text-primary">Scan detail</p><h3 id="dashboard-scan-detail-title" className="mt-1 font-editorial text-2xl">{historyDetail.ticker}</h3></div><div className="flex items-center gap-2"><Badge variant={riskVariant(historyDetail.riskLabel)}>{historyDetail.riskLabel}</Badge><Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Close scan details" onClick={() => setHistoryDetail(null)}><X className="h-4 w-4" aria-hidden="true" /></Button></div></div><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Risk score</dt><dd className="mt-1 font-semibold tabular-nums">{historyDetail.score}</dd></div><div><dt className="text-xs text-muted-foreground">Signals</dt><dd className="mt-1 font-semibold tabular-nums">{historyDetail.signalCount}</dd></div><div><dt className="text-xs text-muted-foreground">Source</dt><dd className="mt-1 font-semibold">{historyDetail.source === "MANUAL" ? "Manual scan" : "Monitor"}</dd></div><div><dt className="text-xs text-muted-foreground">Market data</dt><dd className="mt-1 font-semibold">{historyDetail.market?.asOf ? "Published end-of-day" : "Unavailable"}</dd></div></dl>{historyDetail.market?.signalSummary && <p className="rounded-xl bg-secondary/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">{historyDetail.market.signalSummary}</p>}<ScanSocialEvidence social={historyDetail.social} /></section>}
      </section>
    );
  }

  return (
    <section aria-label="Market overview">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter stocks">
          {filterLabels.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={cn("min-h-10 rounded-full border px-4 text-sm transition-colors", filter === value ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-secondary")}>{label} <span className="text-current/55">({counts[value]})</span></button>
          ))}
        </div>
        <button type="button" onClick={() => setShowHistory(true)} className="flex min-h-10 items-center gap-2 self-start rounded-full border border-dashed border-border bg-card px-4 text-sm hover:bg-secondary xl:self-auto"><Clock3 className="h-4 w-4" aria-hidden="true" />Scan history <span className="text-muted-foreground">({data.recentScans.length})</span></button>
      </div>

      {actionError && <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{actionError}</div>}

      <div className="space-y-3 md:hidden">
        {rows.length === 0 && <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">No stocks match this filter.</div>}
        {rows.map((row) => {
          const isExpanded = expandedKey === row.key;
          const editing = monitorKey === row.key && row.watchlistEntry;
          return (
            <article key={`mobile:${row.key}`} className={cn("rounded-2xl border border-border bg-card p-4", (isExpanded || editing) && "border-brand-blue/30 bg-brand-blue/5")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold", row.source === "RADAR" && "border-dashed text-muted-foreground")}>{row.displayTicker}</span>{row.tracked && <span className="rounded-md bg-brand-blue/10 px-2 py-0.5 text-[10px] font-semibold text-brand-blue">TRACKED</span>}</div>
                  <p className="mt-2 truncate text-sm font-medium">{row.companyName || row.signalSummary || row.ticker}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.tracked ? (row.lastScannedAt ? `Last scanned ${formatRelativeDate(row.lastScannedAt)}` : "Not scanned yet") : row.signalSummary || "Flagged by the latest market-wide scan"}</p>
                </div>
                <Badge variant={riskVariant(row.riskLabel)}>{row.pumpScore ?? "—"}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-sm">
                <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Change</dt><dd className={cn("mt-1 font-medium", row.priceChangePct !== null && (row.priceChangePct < 0 ? "text-destructive" : "text-emerald-600"))}>{numberLabel(row.priceChangePct, "percent")}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</dt><dd className="mt-1 font-medium">{numberLabel(row.lastPrice, "price")}</dd></div>
              </dl>
              <div className="mt-3 flex justify-end gap-1 border-t border-border/60 pt-2"><Button type="button" variant="ghost" size="icon" className={cn("h-11 w-11", isExpanded && "bg-brand-blue/10 text-brand-blue")} onClick={() => setExpandedKey(isExpanded ? null : row.key)} aria-label={`${isExpanded ? "Hide" : "Show"} ${row.displayTicker} details`}><ChartNoAxesCombined className="h-4 w-4" /></Button>{row.watchlistEntry && <><Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => { setMonitorError(null); setMonitorKey(editing ? null : row.key); }} aria-label={`Monitoring settings for ${row.ticker}`}><Settings className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-11 w-11 hover:text-destructive" onClick={() => void remove(row)} disabled={pendingKey === row.key} aria-label={`Remove ${row.ticker} from watchlist`}>{pendingKey === row.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</Button></>}</div>
              {isExpanded && <div className="mt-3 rounded-xl border border-border bg-card p-4 text-sm"><strong>Latest market signal</strong><p className="mt-1 text-muted-foreground">{numberLabel(row.lastPrice, "price")} · {numberLabel(row.priceChangePct, "percent")} · {row.riskLabel}. End-of-day data, not live.</p></div>}
              {editing && row.watchlistEntry && <MonitorEditor entry={row.watchlistEntry} slots={data.monitorSlots} creditEstimate={data.monitorCreditEstimate} error={monitorError} isSaving={pendingKey === row.key} onSubmit={saveMonitor} onCancel={() => { setMonitorError(null); setMonitorKey(null); }} />}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="h-11 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 font-semibold">Instrument</th>
              {[["CHANGE", "Change"], ["PRICE", "Price"], ["PUMP_SCORE", "Pump score"]].map(([key, label]) => (
                <th key={key} aria-sort={sort === key ? (direction === "ASC" ? "ascending" : "descending") : "none"} className="px-4 font-semibold"><button type="button" onClick={() => changeSort(key as UnifiedMarketSort)} className="inline-flex min-h-10 items-center gap-1 hover:text-foreground">{label}{sort === key && (direction === "ASC" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button></th>
              ))}
              <th className="px-4 font-semibold">24H range</th>
              <th className="w-36 px-4"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">No stocks match this filter.</td></tr>}
            {rows.map((row) => {
              const isExpanded = expandedKey === row.key;
              const editing = monitorKey === row.key && row.watchlistEntry;
              return (
                <Fragment key={row.key}>
                  <tr className={cn("h-[72px] border-b border-border/70", (isExpanded || editing) && "bg-brand-blue/5")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3"><span className={cn("rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold", row.source === "RADAR" && "border-dashed text-muted-foreground")}>{row.displayTicker}</span><div><p className="text-sm font-medium">{row.companyName || (row.source === "RADAR" ? row.signalSummary || "Radar suspect" : row.ticker)} {row.tracked && <span className="ml-1 rounded-md bg-brand-blue/10 px-2 py-0.5 text-[10px] font-semibold text-brand-blue">TRACKED</span>}</p><p className="mt-1 text-xs text-muted-foreground">{row.tracked ? (row.lastScannedAt ? `Last scanned ${formatRelativeDate(row.lastScannedAt)}` : "Not scanned yet") : row.signalSummary || "Flagged by the latest market-wide scan"}</p></div></div>
                    </td>
                    <td className={cn("px-4 text-sm", row.priceChangePct !== null && (row.priceChangePct < 0 ? "text-destructive" : "text-emerald-600"))}>{numberLabel(row.priceChangePct, "percent")}</td>
                    <td className="px-4 text-sm">{numberLabel(row.lastPrice, "price")}</td>
                    <td className="px-4"><Badge variant={riskVariant(row.riskLabel)}>{numberLabel(row.pumpScore, "score")}</Badge></td>
                    <td className="px-4 text-sm text-muted-foreground">—</td>
                    <td className="px-4"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" className={cn("h-10 w-10", isExpanded && "bg-brand-blue/10 text-brand-blue")} onClick={() => setExpandedKey(isExpanded ? null : row.key)} aria-label={`${isExpanded ? "Hide" : "Show"} ${row.displayTicker} details`}><ChartNoAxesCombined className="h-4 w-4" /></Button>{row.watchlistEntry && <><Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => { setMonitorError(null); setMonitorKey(editing ? null : row.key); }} aria-label={`Monitoring settings for ${row.ticker}`}><Settings className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-10 w-10 hover:text-destructive" onClick={() => void remove(row)} disabled={pendingKey === row.key} aria-label={`Remove ${row.ticker} from watchlist`}>{pendingKey === row.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</Button></>}</div></td>
                  </tr>
                  {(isExpanded || editing) && <tr key={`${row.key}:detail`} className="border-b border-border bg-brand-blue/5"><td colSpan={6} className="px-5 py-5">{isExpanded && <div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Latest market signal</p><p className="mt-3 text-2xl font-semibold">{numberLabel(row.lastPrice, "price")}</p><p className="mt-1 text-sm text-muted-foreground">{numberLabel(row.priceChangePct, "percent")} in the latest end-of-day publication. Not live.</p></div><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk analysis</p><p className="mt-3 text-2xl font-semibold">{row.pumpScore ?? "—"}</p><p className="mt-1 text-sm text-muted-foreground">{row.riskLabel}{row.signalSummary ? ` · ${row.signalSummary}` : ""}</p></div></div>}{editing && row.watchlistEntry && <MonitorEditor entry={row.watchlistEntry} slots={data.monitorSlots} creditEstimate={data.monitorCreditEstimate} error={monitorError} isSaving={pendingKey === row.key} onSubmit={saveMonitor} onCancel={() => { setMonitorError(null); setMonitorKey(null); }} />}</td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Market prices and risk scores come from the latest completed end-of-day publication — this is not live monitoring.</p>
    </section>
  );
}
