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
  coverage: PumpRadarCoverage | null;
  socialSummary: Omit<SocialSummary, "maxPromotionScore"> | null;
  freshness: "FRESH" | "STALE" | null;
  notice: string;
  compact?: boolean;
  showDashboardLink?: boolean;
}

function riskVariant(label: PumpRadarRow["riskLabel"]) {
  if (label === "High risk") return "high" as const;
  if (label === "Caution") return "medium" as const;
  return "low" as const;
}

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function RadarRow({ row }: { row: PumpRadarRow }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1.2fr)_auto] gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_auto_auto_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold tracking-tight">{row.displayTicker}</span>
          <Badge variant={riskVariant(row.riskLabel)}>{row.riskLabel}</Badge>
        </div>
        {row.companyName && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {row.companyName}
          </p>
        )}
        {row.signalSummary && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground md:hidden">
            {row.signalSummary}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Score
        </p>
        <p className="mt-0.5 font-semibold tabular-nums">{row.score}</p>
      </div>
      <div className="hidden text-right md:block">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Price move
        </p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums">
          {row.priceChangePct === null
            ? "—"
            : `${row.priceChangePct > 0 ? "+" : ""}${formatNumber(row.priceChangePct)}%`}
        </p>
      </div>
      <div className="hidden text-right md:block">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Social
        </p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums">
          {row.socialSummary
            ? `${row.socialSummary.promotionalMentions} flagged`
            : "Not analyzed"}
        </p>
      </div>
      <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground md:hidden">
        <span>{row.signalCount} signals</span>
        <span>Volume {formatNumber(row.volumeRatio)}×</span>
        <span>
          {row.socialSummary
            ? `${row.socialSummary.promotionalMentions} promotional mentions`
            : "Social not analyzed"}
        </span>
      </div>
    </div>
  );
}

export function PumpRadar({
  status,
  rows,
  asOf,
  publishedAt,
  coverage,
  socialSummary,
  freshness,
  notice,
  compact = false,
  showDashboardLink = false,
}: PumpRadarProps) {
  const view = buildPumpRadarView({ status, rows, coverage, socialSummary });

  return (
    <section aria-labelledby="pump-radar-title" className="w-full">
      <Card className="overflow-hidden shadow-sm shadow-black/[0.02]">
        <CardHeader className={cn("gap-4", compact && "p-4 sm:p-5")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Radar className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
                  Market-wide findings
                </p>
                <h2
                  id="pump-radar-title"
                  className="mt-1 font-editorial text-xl sm:text-2xl"
                >
                  Pump Radar
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Stocks with the strongest risk signals in the latest completed
                  US market scan. Checked after the trading day closes — not live.
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
          </div>
          <FreshnessNote
            state={status === "LOADING" ? "LOADING" : status === "UNAVAILABLE" ? "UNAVAILABLE" : freshness || "FRESH"}
            asOf={asOf}
            publishedAt={publishedAt}
            notice={notice}
          />
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
              <p className="mt-3 font-semibold">{view.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try again after the next end-of-day publication.
              </p>
            </div>
          </CardContent>
        ) : view.state === "empty" ? (
          <CardContent>
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
              <p className="font-semibold">{view.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The completed market scan did not publish any rows for this view.
              </p>
            </div>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="border-y border-border/60" role="list" aria-label="Pump Radar findings">
              {rows.map((row, index) => (
                <div role="listitem" key={`${row.displayTicker}-${index}`}>
                  <RadarRow row={row} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{view.coverageLabel}</span>
              {socialSummary ? (
                <span className="flex items-center gap-1.5">
                  <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                  {view.socialLabel}
                </span>
              ) : (
                <span>Social media not analyzed for this publication</span>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </section>
  );
}

export function PublicPumpRadar({
  showDashboardLink = false,
}: {
  showDashboardLink?: boolean;
}) {
  const [payload, setPayload] = useState<PumpRadarPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/pump-radar?limit=8", {
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
          rows: [],
          notice: "Published end-of-day findings are temporarily unavailable.",
        });
      });
    return () => controller.abort();
  }, []);

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
      />
    );
  }

  return (
    <PumpRadar
      {...payload}
      socialSummary={aggregateSocialSummary(payload.rows)}
      showDashboardLink={showDashboardLink}
    />
  );
}
