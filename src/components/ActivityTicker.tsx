"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";

import type { ActivityTickerPayload } from "@/lib/activity-ticker";
import { cn } from "@/lib/utils";

type ResourceState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: ActivityTickerPayload }
  | { status: "error"; data: null };

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatScanDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function Stat({
  label,
  value,
  tone,
  className,
  compactLabel,
}: {
  label: string;
  value: string;
  tone?: "high" | "caution";
  className?: string;
  compactLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        className,
      )}
    >
      {tone === "high" && (
        <AlertTriangle className="h-3 w-3 text-red-500" aria-hidden="true" />
      )}
      {tone === "caution" && (
        <AlertCircle className="h-3 w-3 text-amber-500" aria-hidden="true" />
      )}
      <span
        className={cn("text-muted-foreground", compactLabel && "hidden sm:inline")}
      >
        {label}
      </span>
      {compactLabel && (
        <>
          <span
            aria-hidden="true"
            className="text-muted-foreground sm:hidden"
          >
            {compactLabel}
          </span>
          <span className="sr-only sm:hidden">{label}</span>
        </>
      )}
      <strong
        className={cn(
          "tabular-nums text-foreground",
          tone === "high" && "text-red-600 dark:text-red-400",
          tone === "caution" && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </strong>
    </span>
  );
}

export function ActivityTicker() {
  const [state, setState] = useState<ResourceState>({
    status: "loading",
    data: null,
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/activity-ticker", {
        cache: "no-store",
        signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("activity unavailable");
      const data = (await response.json()) as ActivityTickerPayload;
      if (!signal?.aborted) setState({ status: "ready", data });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!signal?.aborted) setState({ status: "error", data: null });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load]);

  return (
    <section
      aria-label="ScamDunk activity ticker"
      className="sticky top-16 z-30 overflow-hidden border-b border-border/60 bg-card/95 backdrop-blur"
    >
      <div className="mx-auto flex min-h-11 w-full max-w-[1600px] items-center gap-1.5 overflow-hidden px-2 py-2 text-[10px] sm:gap-3 sm:px-4 sm:text-[11px]">
        <div className="hidden shrink-0 items-center gap-1.5 font-semibold uppercase tracking-widest text-primary sm:flex">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Activity</span>
        </div>
        {state.status === "loading" && (
          <span
            className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted-foreground"
            role="status"
          >
            <Loader2
              className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Loading verified totals
          </span>
        )}
        {state.status === "error" && (
          <span className="min-w-0 truncate text-muted-foreground" role="status">
            Activity totals temporarily unavailable
          </span>
        )}
        {state.status === "ready" && state.data.status === "UNAVAILABLE" && (
          <span className="min-w-0 truncate text-muted-foreground" role="status">
            Market-wide scan totals are not available yet
          </span>
        )}
        {state.status === "ready" && state.data.status === "AVAILABLE" && (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden sm:gap-3">
            <Stat
              label="Latest scan"
              compactLabel="Latest"
              value={formatCount(state.data.latestScan.evaluated)}
            />
            <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            <Stat
              label="High risk"
              compactLabel="High"
              value={formatCount(state.data.latestScan.highRisk)}
              tone="high"
            />
            <Stat
              label="Caution"
              value={formatCount(state.data.latestScan.caution)}
              tone="caution"
              className="hidden sm:inline-flex"
            />
            <Stat
              label="Coverage"
              value={
                state.data.latestScan.coveragePercent === null
                  ? "—"
                  : `${state.data.latestScan.coveragePercent}%`
              }
              className="hidden md:inline-flex"
            />
            <Stat
              label="Scans to date"
              value={formatCount(state.data.allTimeEvaluations)}
              className="hidden lg:inline-flex"
            />
            <span className="min-w-0 flex-1 truncate text-right text-muted-foreground/70 xl:hidden">
              {formatScanDate(state.data.latestScan.scanDate)} · not live
            </span>
            <span className="hidden shrink-0 whitespace-nowrap text-muted-foreground/70 xl:inline">
              Data {formatScanDate(state.data.latestScan.scanDate)} · end-of-day, not live
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
