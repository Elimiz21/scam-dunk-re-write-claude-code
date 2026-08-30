"use client";

import { useCallback, useEffect, useReducer } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, History, ListChecks, Loader2, RefreshCw, ScanSearch } from "lucide-react";

import {
  dashboardResourceReducer,
  type DashboardResourceState,
} from "@/components/dashboard/dashboard-state";
import { PumpRadar } from "@/components/dashboard/PumpRadar";
import type { DashboardPayload } from "@/components/dashboard/types";
import { readApiError } from "@/components/dashboard/types";
import { UsageSummary } from "@/components/dashboard/UsageSummary";
import { aggregateSocialSummary } from "@/components/dashboard/view-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: DashboardResourceState<DashboardPayload> = {
  status: "idle",
  data: null,
  error: null,
};

function riskVariant(label: DashboardPayload["recentScans"][number]["riskLabel"]) {
  if (label === "High risk") return "high" as const;
  if (label === "Caution") return "medium" as const;
  return "low" as const;
}

function DashboardLoading() {
  return (
    <div className="space-y-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        Loading your dashboard
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none" />
        ))}
      </div>
      <PumpRadar
        status="LOADING"
        rows={[]}
        asOf={null}
        publishedAt={null}
        coverage={null}
        socialSummary={null}
        freshness={null}
        notice="Retrieving the latest completed end-of-day scan."
      />
    </div>
  );
}

export function DashboardHome() {
  const [state, dispatch] = useReducer(
    dashboardResourceReducer<DashboardPayload>,
    initialState,
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    dispatch({ type: "loading" });
    try {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        signal,
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          readApiError(body, "Dashboard data is temporarily unavailable.")
            .message,
        );
      }
      dispatch({ type: "loaded", data: body as DashboardPayload });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({
        type: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Dashboard data is temporarily unavailable.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.status === "idle" || state.status === "loading") {
    return <DashboardLoading />;
  }

  if (state.status === "error" || !state.data) {
    return (
      <Card role="alert">
        <CardContent className="flex flex-col items-center px-5 py-12 text-center">
          <RefreshCw className="h-7 w-7 text-destructive" aria-hidden="true" />
          <h2 className="mt-3 font-editorial text-xl">Dashboard unavailable</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {state.error || "Dashboard data is temporarily unavailable."}
          </p>
          <Button className="mt-5 min-h-11" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = state.data;
  return (
    <div className="space-y-7">
      <UsageSummary
        plan={data.plan}
        usage={data.usage}
        monitorSlots={data.monitorSlots}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Saved stocks</p>
              <CardTitle className="mt-1 font-editorial text-xl">Watchlist</CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm" className="min-h-10 gap-1.5">
              <Link href="/watchlist">
                Manage <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.watchlist.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <ListChecks className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 font-semibold">No saved stocks yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Adding or removing a stock never uses a scan credit.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60" aria-label="Watchlist preview">
                {data.watchlist.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-semibold">{entry.ticker}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.monitors.filter((monitor) => monitor.status === "ACTIVE").length} active monitors
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {entry.lastDataAt ? "Data published" : "Awaiting data"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Completed checks</p>
              <CardTitle className="mt-1 font-editorial text-xl">Recent scans</CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm" className="min-h-10 gap-1.5">
              <Link href="/recent-scans">
                View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentScans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <History className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 font-semibold">No completed scans yet</p>
                <Link href="/" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  Run your first scan
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border/60" aria-label="Recent scans preview">
                {data.recentScans.map((scan) => (
                  <li key={scan.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-semibold">{scan.ticker}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{scan.signalCount} signals · Score {scan.score}</p>
                    </div>
                    <Badge variant={riskVariant(scan.riskLabel)}>{scan.riskLabel}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <PumpRadar
        {...data.pumpRadar}
        socialSummary={aggregateSocialSummary(data.pumpRadar.rows)}
        showDashboardLink={false}
      />

      {(data.notifications?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Monitoring updates</p>
              <CardTitle className="mt-1 font-editorial text-xl">Recent notifications</CardTitle>
            </div>
            <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60" aria-label="Recent monitoring notifications">
              {data.notifications?.map((notification) => (
                <li key={notification.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-semibold">{notification.ticker} · {notification.kind === "FULL" ? "Full" : "Price"} monitor</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {notification.status === "COMPLETED" ? "Completed" : `Skipped: ${(notification.skipReason || "unavailable").replaceAll("_", " ").toLowerCase()}`} · {notification.publicationKey.replace("eod:", "")}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">After close</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ScanSearch className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold">Need to check a stock now?</p>
              <p className="mt-1 text-sm text-muted-foreground">Manual scans use one credit and are separate from your saved watchlist.</p>
            </div>
          </div>
          <Button asChild variant="brand" className="min-h-11 w-full sm:w-auto">
            <Link href="/">Run a scan</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
