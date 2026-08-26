"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";

import { RecentScansTable } from "@/components/dashboard/RecentScansTable";
import { ScanSocialEvidence } from "@/components/dashboard/ScanSocialEvidence";
import type {
  HistoryOrder,
  HistoryPayload,
  RecentScanDto,
  ScanDetailDto,
} from "@/components/dashboard/types";
import { readApiError } from "@/components/dashboard/types";
import { PageLayout } from "@/components/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function riskVariant(label: ScanDetailDto["riskLabel"]) {
  if (label === "High risk") return "high" as const;
  if (label === "Caution") return "medium" as const;
  return "low" as const;
}

export default function RecentScansPage() {
  const [order, setOrder] = useState<HistoryOrder>("MOST_RECENT");
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScanDetailDto | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadHistory = useCallback(async (selectedOrder: HistoryOrder, signal?: AbortSignal) => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(
        `/api/scans/history?order=${encodeURIComponent(selectedOrder)}&page=1&limit=20`,
        { cache: "no-store", signal },
      );
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "Scan history is temporarily unavailable.").message);
      }
      setHistory(body as HistoryPayload);
      setStatus("ready");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Scan history is temporarily unavailable.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(order, controller.signal);
    return () => controller.abort();
  }, [loadHistory, order]);

  async function openDetail(scan: RecentScanDto) {
    setDetail(null);
    setDetailError(null);
    setDetailStatus("loading");
    try {
      const response = await fetch(`/api/scans/${encodeURIComponent(scan.id)}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "Scan details are temporarily unavailable.").message);
      }
      setDetail(body as ScanDetailDto);
      setDetailStatus("idle");
      window.requestAnimationFrame(() => {
        document.getElementById("scan-detail")?.focus();
      });
    } catch (caught) {
      setDetailStatus("error");
      setDetailError(caught instanceof Error ? caught.message : "Scan details are temporarily unavailable.");
    }
  }

  return (
    <PageLayout>
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-[1200px] space-y-6">
          <header>
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Your checks</p>
            <h1 className="mt-2 font-display text-3xl italic sm:text-4xl">Recent scans</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Review manual scans and completed scheduled checks. Automatic monitoring is checked after the trading day closes — not live.
            </p>
          </header>

          {status === "loading" ? (
            <div className="flex min-h-40 items-center justify-center rounded-2xl border border-border bg-card" aria-live="polite">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Loading scans</span>
            </div>
          ) : status === "error" ? (
            <Card role="alert">
              <CardContent className="flex flex-col items-center px-5 py-10 text-center">
                <p className="font-semibold">Scan history unavailable</p>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                <Button className="mt-4 min-h-11 gap-2" variant="outline" onClick={() => void loadHistory(order)}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />Try again
                </Button>
              </CardContent>
            </Card>
          ) : (
            <RecentScansTable
              items={history?.items || []}
              order={order}
              onOrderChange={(nextOrder) => {
                setDetail(null);
                setOrder(nextOrder);
              }}
              onOpenDetail={(scan) => void openDetail(scan)}
            />
          )}

          {detailStatus === "loading" && (
            <div className="flex min-h-28 items-center justify-center rounded-2xl border border-border bg-card" aria-live="polite">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Loading scan details</span>
            </div>
          )}
          {detailStatus === "error" && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
              {detailError}
            </div>
          )}
          {detail && (
            <section id="scan-detail" tabIndex={-1} aria-labelledby="scan-detail-title" className="space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <Card>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Scan detail</p>
                    <CardTitle id="scan-detail-title" className="mt-1 font-display text-2xl italic">{detail.ticker}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={riskVariant(detail.riskLabel)}>{detail.riskLabel}</Badge>
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Close scan details" onClick={() => setDetail(null)}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-xs text-muted-foreground">Risk score</dt><dd className="mt-1 font-semibold tabular-nums">{detail.score}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Signals</dt><dd className="mt-1 font-semibold tabular-nums">{detail.signalCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Source</dt><dd className="mt-1 font-semibold">{detail.source === "MANUAL" ? "Manual scan" : detail.source === "AUTOMATIC_FULL" ? "Full monitor" : "Price monitor"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Market data</dt><dd className="mt-1 font-semibold">{detail.market?.asOf ? "Published end-of-day" : "Unavailable"}</dd></div>
                  </dl>
                  {detail.market?.signalSummary && (
                    <p className="mt-5 rounded-xl bg-secondary/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                      {detail.market.signalSummary}
                    </p>
                  )}
                </CardContent>
              </Card>
              <ScanSocialEvidence social={detail.social} />
            </section>
          )}
        </div>
      </main>
    </PageLayout>
  );
}
