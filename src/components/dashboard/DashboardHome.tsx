"use client";

import { useCallback, useEffect, useReducer } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Clock3, History, Loader2, RefreshCw, Star } from "lucide-react";

import { dashboardResourceReducer, type DashboardResourceState } from "@/components/dashboard/dashboard-state";
import { DashboardScanEntry } from "@/components/dashboard/DashboardScanEntry";
import { PumpRadar } from "@/components/dashboard/PumpRadar";
import type { DashboardPayload } from "@/components/dashboard/types";
import { readApiError } from "@/components/dashboard/types";
import { aggregateSocialSummary } from "@/components/dashboard/view-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeDate } from "@/lib/utils";

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

function SectionHeading({ icon: Icon, title, href }: { icon: typeof Star; title: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      <Link href={href} className="flex min-h-10 items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function DashboardHome() {
  const { data: session } = useSession();
  const [state, dispatch] = useReducer(dashboardResourceReducer<DashboardPayload>, initialState);

  const load = useCallback(async (signal?: AbortSignal) => {
    dispatch({ type: "loading" });
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store", signal, headers: { Accept: "application/json" } });
      const body = (await response.json()) as unknown;
      if (!response.ok) throw new Error(readApiError(body, "Dashboard data is temporarily unavailable.").message);
      dispatch({ type: "loaded", data: body as DashboardPayload });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({ type: "failed", error: error instanceof Error ? error.message : "Dashboard data is temporarily unavailable." });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const firstName = (session?.user?.name || session?.user?.email?.split("@")[0] || "there").split(" ")[0];
  const data = state.data;

  return (
    <div className="space-y-7">
      <section id="dashboard-scan" className="relative overflow-hidden rounded-3xl border border-brand-blue/25 bg-[#193650] px-6 py-8 text-white shadow-sm sm:px-9 sm:py-10">
        <span className="absolute inset-x-0 top-0 h-1 bg-brand-blue" aria-hidden="true" />
        <h1 className="font-editorial text-[clamp(2rem,4vw,3rem)] leading-tight">
          Welcome back, {firstName} — paste a ticker, get the truth.
        </h1>
        <DashboardScanEntry />
      </section>

      {(state.status === "idle" || state.status === "loading") && (
        <div className="grid gap-4 lg:grid-cols-2" aria-live="polite" aria-busy="true">
          {[0, 1].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-border bg-secondary motion-reduce:animate-none" />)}
          <span className="sr-only"><Loader2 className="animate-spin" />Loading dashboard</span>
        </div>
      )}

      {state.status === "error" && (
        <Card role="alert">
          <CardContent className="flex flex-col items-center px-5 py-12 text-center">
            <RefreshCw className="h-7 w-7 text-destructive" aria-hidden="true" />
            <h2 className="mt-3 font-editorial text-xl">Dashboard unavailable</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{state.error}</p>
            <Button className="mt-5 min-h-11" variant="outline" onClick={() => void load()}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <SectionHeading icon={Star} title="Your watchlist" href="/watchlist" />
              <div className="px-5 py-2">
                {data.watchlist.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nothing on your watchlist yet.</p>
                ) : (
                  <ul className="divide-y divide-border/60" aria-label="Watchlist preview">
                    {data.watchlist.slice(0, 3).map((entry) => {
                      const active = entry.monitors.filter((monitor) => monitor.status === "ACTIVE");
                      return (
                        <li key={entry.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <span className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-xs font-semibold">{entry.ticker}</span>
                            <p className="mt-2 text-[11px] text-muted-foreground">{entry.lastScanAt ? `Last scanned ${formatRelativeDate(entry.lastScanAt)}` : "Not scanned yet"}</p>
                          </div>
                          <span className="text-right text-[11px] font-medium text-muted-foreground">
                            {active.length ? `${active.length} active monitor${active.length === 1 ? "" : "s"}` : "Manual only"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <SectionHeading icon={Clock3} title="Recent scans" href="/recent-scans" />
              <div className="px-5 py-2">
                {data.recentScans.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No completed scans yet.</p>
                ) : (
                  <ul className="divide-y divide-border/60" aria-label="Recent scans preview">
                    {data.recentScans.slice(0, 3).map((scan) => (
                      <li key={scan.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <span className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-xs font-semibold">{scan.ticker}</span>
                          <p className="mt-2 text-[11px] text-muted-foreground">{formatRelativeDate(scan.scannedAt)}</p>
                        </div>
                        <Badge variant={riskVariant(scan.riskLabel)}>{scan.riskLabel}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-muted-foreground">
              You have used <strong className="text-foreground">{data.usage.creditsUsed} of {data.usage.creditsLimit} scans</strong> this month. Active monitoring: <strong className="text-foreground">{data.monitorSlots.full.used} full</strong> and <strong className="text-foreground">{data.monitorSlots.price.used} price</strong>. Checks run after the trading day closes — not live.
            </p>
          </div>

          <PumpRadar
            {...data.pumpRadar}
            socialSummary={aggregateSocialSummary(data.pumpRadar.rows)}
            compact
            showFullPageLink
          />
        </>
      )}
    </div>
  );
}
