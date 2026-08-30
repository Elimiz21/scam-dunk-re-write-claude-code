"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";

import type { ActivityTickerPayload } from "@/lib/activity-ticker";
import { cn } from "@/lib/utils";

type ResourceState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: ActivityTickerPayload }
  | { status: "error"; data: null };

function Stat({ label, value, tone }: { label: string; value: number; tone?: "high" | "caution" }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {tone === "high" && <AlertTriangle className="h-3 w-3 text-red-500" aria-hidden="true" />}
      {tone === "caution" && <AlertCircle className="h-3 w-3 text-amber-500" aria-hidden="true" />}
      <span className="text-muted-foreground">{label}</span>
      <strong className={cn("tabular-nums text-foreground", tone === "high" && "text-red-600 dark:text-red-400", tone === "caution" && "text-amber-700 dark:text-amber-400")}>{value}</strong>
    </span>
  );
}

export function ActivityTicker() {
  const [state, setState] = useState<ResourceState>({ status: "loading", data: null });

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
      className="sticky top-16 z-30 border-b border-border/60 bg-card/95 backdrop-blur"
    >
      <div className="mx-auto flex min-h-11 max-w-6xl items-center gap-x-4 gap-y-2 overflow-x-auto px-4 py-2 text-[11px] sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-1.5 font-semibold uppercase tracking-widest text-primary">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Activity</span>
        </div>
        {state.status === "loading" && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Loading verified totals
          </span>
        )}
        {state.status === "error" && (
          <span className="shrink-0 text-muted-foreground" role="status">
            Activity totals temporarily unavailable
          </span>
        )}
        {state.status === "ready" && (
          <>
            <Stat label="All scans" value={state.data.allTimeScans} />
            <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            <span className="shrink-0 font-semibold text-foreground">This week</span>
            <Stat label="High risk" value={state.data.week.highRisk} tone="high" />
            <Stat label="Caution" value={state.data.week.caution} tone="caution" />
            <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            <span className="shrink-0 font-semibold text-foreground">This month</span>
            <Stat label="High risk" value={state.data.month.highRisk} tone="high" />
            <Stat label="Caution" value={state.data.month.caution} tone="caution" />
            <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            <span className="shrink-0 text-muted-foreground">Other users</span>
            {state.data.community.length === 0 ? (
              <span className="shrink-0 text-muted-foreground">No recent high-risk community scans</span>
            ) : (
              state.data.community.map((item, index) => (
                <span key={`${item.scannedAt}-${index}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/5 px-2 py-1 text-red-700 dark:text-red-300">
                  <span className="font-semibold">{item.displayTicker}</span>
                  <span>Score {item.score}</span>
                  <span className="sr-only">High risk</span>
                </span>
              ))
            )}
            <span className="shrink-0 text-muted-foreground/70">Refreshes every minute · not live monitoring</span>
          </>
        )}
      </div>
    </section>
  );
}
