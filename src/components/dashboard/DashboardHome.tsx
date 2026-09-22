"use client";

import { useCallback, useEffect, useReducer } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, RefreshCw } from "lucide-react";

import { dashboardResourceReducer, type DashboardResourceState } from "@/components/dashboard/dashboard-state";
import { DashboardScanEntry } from "@/components/dashboard/DashboardScanEntry";
import type { DashboardPayload } from "@/components/dashboard/types";
import { readApiError } from "@/components/dashboard/types";
import { UnifiedMarketTable } from "@/components/dashboard/UnifiedMarketTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const initialState: DashboardResourceState<DashboardPayload> = {
  status: "idle",
  data: null,
  error: null,
};

export function DashboardHome() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [state, dispatch] = useReducer(dashboardResourceReducer<DashboardPayload>, initialState);

  const load = useCallback(async (signal?: AbortSignal) => {
    dispatch({ type: "loading" });
    try {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        signal,
        headers: { Accept: "application/json" },
      });
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
  const initialFilter = searchParams.get("filter") === "watching" ? "WATCHING" : "ALL";

  return (
    <div className="space-y-7">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          Market-wide · completed end-of-day
        </p>
        <h1 className="mt-1.5 font-editorial text-[clamp(1.4rem,2vw,1.85rem)] leading-tight">Welcome back, {firstName}</h1>
        <DashboardScanEntry onAdded={load} />
      </header>

      {(state.status === "idle" || state.status === "loading") && (
        <div className="h-[420px] animate-pulse rounded-2xl border border-border bg-secondary motion-reduce:animate-none" aria-live="polite" aria-busy="true">
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

      {state.data && (
        <UnifiedMarketTable data={state.data} initialFilter={initialFilter} onRefresh={load} />
      )}
    </div>
  );
}
