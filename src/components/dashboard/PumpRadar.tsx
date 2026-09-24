"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Megaphone, Radar } from "lucide-react";

import { FreshnessNote } from "@/components/dashboard/FreshnessNote";
import type {
  PumpRadarCoverage,
  PumpRadarPayload,
  PumpRadarRow,
  SocialSummary,
} from "@/components/dashboard/types";
import {
  aggregateSocialSummary,
  buildPumpRadarView,
  filterPumpRadarRows,
  type PumpRadarFilter,
} from "@/components/dashboard/view-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PumpRadarProps {
  status: "LOADING" | "AVAILABLE" | "UNAVAILABLE";
  rows: PumpRadarRow[];
  asOf: string | null;
  publishedAt: string | null;
  executedAt?: string | null;
  publicationQuality?: "VERIFIED" | "DEGRADED" | "UNKNOWN";
  coverage: PumpRadarCoverage | null;
  socialSummary: Omit<SocialSummary, "maxPromotionScore"> | null;
  socialPublication?: {
    status: "COMPLETED" | "PARTIAL";
    scanDate: string;
    updatedAt: string;
  } | null;
  freshness: "FRESH" | "STALE" | null;
  notice: string;
  compact?: boolean;
  showDashboardLink?: boolean;
  showFullPageLink?: boolean;
  fullPage?: boolean;
  showHeading?: boolean;
  showPublicationStatus?: boolean;
}

function riskVariant(label: PumpRadarRow["riskLabel"]) {
  if (label === "High risk") return "high" as const;
  if (label === "Caution") return "medium" as const;
  return "low" as const;
}

function RadarRow({ row, compact }: { row: PumpRadarRow; compact: boolean }) {
  return (
    <div role="row" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
      <div role="cell" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(compact ? "text-[11px] font-medium" : "text-[13px] font-medium")}>{row.displayTicker}</span>
          <Badge className={cn(compact && "px-2 py-0.5 text-[10px] tracking-wide")} variant={riskVariant(row.riskLabel)}>{row.riskLabel}</Badge>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {[row.sector, row.marketCapBand, row.signalSummary].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div role="cell" className="text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:hidden">Risk score</p>
        <p className={cn("font-semibold tabular-nums", compact ? "text-[11px]" : "text-[13px]")}>{row.score}</p>
      </div>
    </div>
  );
}

export function PumpRadar({
  status,
  rows,
  asOf,
  publishedAt,
  executedAt = null,
  publicationQuality = "UNKNOWN",
  coverage,
  socialSummary,
  socialPublication = null,
  freshness,
  notice,
  compact = false,
  showDashboardLink = false,
  showFullPageLink = false,
  fullPage = false,
  showHeading = true,
  showPublicationStatus = fullPage,
}: PumpRadarProps) {
  const [filter, setFilter] = useState<PumpRadarFilter>("ALL");
  const view = buildPumpRadarView({ status, rows, coverage, socialSummary });
  const filteredRows = filterPumpRadarRows(rows, filter);
  const highRiskCount = rows.filter((row) => row.riskLabel === "High risk").length;
  const cautionCount = rows.filter((row) => row.riskLabel === "Caution").length;
  const statusTextClass = compact
    ? "text-[11px] text-muted-foreground"
    : "text-sm text-muted-foreground";

  return (
    <section aria-labelledby="pump-radar-title" className="w-full">
      <Card className="overflow-hidden shadow-sm shadow-black/[0.02]">
        <CardHeader className={cn("gap-4", compact && "gap-3 p-4 sm:p-5")}>
          {showHeading && <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Radar className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  Market-wide findings
                </p>
                <h2
                  id="pump-radar-title"
                  className={cn("mt-1", compact ? "text-[13px] font-medium" : "font-editorial text-xl sm:text-2xl")}
                >
                  Pump Radar
                </h2>
                <p className={cn("mt-1 max-w-2xl text-muted-foreground", compact ? "text-[11px] leading-4" : "text-sm leading-relaxed")}>
                  Anonymous cases and risk patterns from the latest completed
                  US market scan. Company names and tickers stay hidden, including after login.
                </p>
              </div>
            </div>
            {showDashboardLink && (
              <Button asChild variant="outline" size="sm" className="min-h-10 gap-2 shrink-0 self-start">
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
            {showFullPageLink && (
              <Button asChild variant="outline" size="sm" className="min-h-10 shrink-0 gap-2 self-start">
                <Link href="/pump-radar">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>}
          {showPublicationStatus && <FreshnessNote
            state={status === "LOADING" ? "LOADING" : status === "UNAVAILABLE" ? "UNAVAILABLE" : freshness || "FRESH"}
            asOf={asOf}
            publishedAt={publishedAt}
            executedAt={executedAt}
            publicationQuality={publicationQuality}
            socialPublication={socialPublication}
            notice={notice}
            compact={fullPage}
          />}
          {fullPage && view.state === "ready" && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  [rows.length, "flagged in publication"],
                  [highRiskCount, "high risk"],
                  [cautionCount, "caution"],
                  [coverage?.evaluated ?? "—", "stocks evaluated"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-border bg-secondary/35 p-3 text-center">
                    <p className="text-[18px] font-medium tabular-nums text-foreground">{value}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter Pump Radar by risk">
                {([
                  ["ALL", "All"],
                  ["HIGH", "High risk"],
                  ["CAUTION", "Caution"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    onClick={() => setFilter(value)}
                    className={cn(
                      "min-h-10 rounded-full border px-4 text-[13px] font-medium transition-colors",
                      filter === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </CardHeader>

        {view.state === "loading" ? (
          <CardContent aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-20 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none"
                />
              ))}
            </div>
          </CardContent>
        ) : view.state === "unavailable" ? (
          <CardContent>
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
              <Activity className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className={cn("mt-3", compact ? "text-[11px] font-medium" : "font-semibold")}>{view.title}</p>
              <p className={cn("mt-1", statusTextClass)}>
                Try again after the next end-of-day publication.
              </p>
            </div>
          </CardContent>
        ) : view.state === "empty" ? (
          <CardContent>
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
              <p className={cn(compact ? "text-[11px] font-medium" : "font-semibold")}>{view.title}</p>
              <p className={cn("mt-1", statusTextClass)}>
                The completed market scan did not publish any rows for this view.
              </p>
            </div>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="border-y border-border/60" role="table" aria-label="Pump Radar findings">
              <div role="row" className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div role="columnheader">Instrument</div>
                <div role="columnheader" className="text-right">Risk score</div>
              </div>
              {filteredRows.map((row, index) => (
                <RadarRow key={`${row.displayTicker}-${index}`} row={row} compact={compact} />
              ))}
              {filteredRows.length === 0 && (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">No findings match this filter.</p>
              )}
            </div>
            <div className="flex flex-col gap-2 px-4 py-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                {view.socialLabel}
                {socialPublication && (
                  <span>
                    · {socialPublication.status === "PARTIAL" ? "partial run" : "completed run"}
                    {" · updated "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(socialPublication.updatedAt))}
                  </span>
                )}
              </span>
            </div>
          </CardContent>
        )}
      </Card>
    </section>
  );
}

export function PublicPumpRadar({
  showDashboardLink = false,
  fullPage = false,
  showHeading = true,
}: {
  showDashboardLink?: boolean;
  fullPage?: boolean;
  showHeading?: boolean;
}) {
  const [payload, setPayload] = useState<PumpRadarPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/pump-radar?limit=${fullPage ? 50 : 4}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as PumpRadarPayload;
        if (!response.ok && body.status !== "UNAVAILABLE") {
          throw new Error("Pump Radar unavailable");
        }
        setPayload(body);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPayload({
          status: "UNAVAILABLE",
          asOf: null,
          publishedAt: null,
          freshness: null,
          coverage: null,
          socialPublication: null,
          rows: [],
          notice: "Published end-of-day findings are temporarily unavailable.",
        });
      });
    return () => controller.abort();
  }, [fullPage]);

  if (!payload) {
    return (
      <PumpRadar
        status="LOADING"
        rows={[]}
        asOf={null}
        publishedAt={null}
        coverage={null}
        socialSummary={null}
        freshness={null}
        notice="Retrieving the latest completed end-of-day scan."
        showDashboardLink={showDashboardLink}
        fullPage={fullPage}
        showHeading={showHeading}
      />
    );
  }

  return (
    <PumpRadar
      {...payload}
      socialSummary={aggregateSocialSummary(payload.rows)}
      showDashboardLink={showDashboardLink}
      fullPage={fullPage}
      showHeading={showHeading}
    />
  );
}
