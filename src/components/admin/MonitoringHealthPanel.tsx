"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Database,
  Radio,
  ShieldAlert,
  XCircle,
} from "lucide-react";

type HealthState = "FRESH" | "STALE" | "HEALTHY" | "PARTIAL" | "CONFIGURED" | "DEGRADED" | "UNAVAILABLE";

interface MonitoringPayload {
  generatedAt: string;
  overall: { status: HealthState };
  publication: {
    status: HealthState;
    asOf?: string;
    publishedAt?: string;
    coverage?: {
      total: number;
      evaluated: number;
      skipped: number;
      evaluatedPercent: number | null;
    };
    message?: string;
  };
  monitoring: {
    status: HealthState;
    executionCounts?: Record<string, number>;
    skipReasons?: Array<{ reason: string; count: number }>;
    creditsCharged?: number;
    message?: string;
  };
  notifications: {
    status: HealthState;
    byStatus?: Record<string, number>;
    message?: string;
  };
  socialScan: {
    status: HealthState;
    runStatus?: string;
    scanDate?: string;
    tickersScanned?: number;
    tickersWithMentions?: number;
    totalMentions?: number;
    message?: string;
  };
  billing: {
    status: HealthState;
    activeProvider?: string;
    providers?: Array<{
      name: string;
      configured: boolean;
      databaseStatus: string;
    }>;
    message?: string;
  };
}

function formatDate(value?: string) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

function statusLabel(status?: HealthState) {
  return status ? status.replaceAll("_", " ") : "UNAVAILABLE";
}

function statusClasses(status?: HealthState) {
  if (status === "FRESH" || status === "HEALTHY" || status === "CONFIGURED") {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (status === "STALE" || status === "PARTIAL" || status === "DEGRADED") {
    return "bg-amber-500/10 text-amber-700";
  }
  return "bg-red-500/10 text-red-700";
}

function StatusPill({ status }: { status?: HealthState }) {
  const Icon =
    status === "FRESH" || status === "HEALTHY" || status === "CONFIGURED"
      ? CheckCircle2
      : status === "STALE" || status === "PARTIAL" || status === "DEGRADED"
        ? CircleAlert
        : XCircle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(status)}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function SectionCard({
  title,
  icon: Icon,
  status,
  children,
}: {
  title: string;
  icon: typeof Activity;
  status?: HealthState;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 className="truncate text-base font-medium font-display italic text-foreground">
            {title}
          </h2>
        </div>
        <StatusPill status={status} />
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function MonitoringHealthPanel({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [payload, setPayload] = useState<MonitoringPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/admin/monitoring", {
          cache: "no-store",
        });
        const body = (await response.json()) as MonitoringPayload;
        if (!active) return;
        setPayload(body);
        setRequestError(!response.ok && !body.overall);
      } catch {
        if (active) setRequestError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="Loading monitoring health">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    );
  }

  if (requestError || !payload) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-500/5 p-5 text-sm text-red-700">
        Monitoring health is unavailable. Operational data was not assumed to be healthy.
      </div>
    );
  }

  const count = (key: string) => payload.monitoring.executionCounts?.[key] ?? 0;
  const notificationCount = (key: string) => payload.notifications.byStatus?.[key] ?? 0;

  if (compact) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-medium font-display italic text-foreground">Operations health</h2>
              <StatusPill status={payload.overall.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only publication, monitoring, social, notification, and billing signals.
            </p>
          </div>
          <Link
            href="/admin/monitoring"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open monitoring
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Publication" value={statusLabel(payload.publication.status)} />
          <Metric label="Monitor runs" value={count("COMPLETED")} />
          <Metric label="Credits charged" value={payload.monitoring.creditsCharged ?? "—"} />
          <Metric label="Notifications delivered" value={notificationCount("DELIVERED")} />
          <Metric label="Social scan" value={statusLabel(payload.socialScan.status)} />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Control room snapshot</p>
          <p className="mt-1 text-sm text-muted-foreground">Generated {formatDate(payload.generatedAt)}</p>
        </div>
        <StatusPill status={payload.overall.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Publication freshness & coverage" icon={Database} status={payload.publication.status}>
          {payload.publication.coverage ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="As of" value={formatDate(payload.publication.asOf)} />
              <Metric label="Evaluated" value={`${payload.publication.coverage.evaluated}/${payload.publication.coverage.total}`} />
              <Metric label="Coverage" value={payload.publication.coverage.evaluatedPercent === null ? "—" : `${payload.publication.coverage.evaluatedPercent}%`} />
              <Metric label="Skipped" value={payload.publication.coverage.skipped} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{payload.publication.message}</p>
          )}
        </SectionCard>

        <SectionCard title="Social scan freshness" icon={Radio} status={payload.socialScan.status}>
          {payload.socialScan.scanDate ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Run" value={payload.socialScan.runStatus ?? "—"} />
              <Metric label="Scanned" value={payload.socialScan.tickersScanned ?? "—"} />
              <Metric label="With mentions" value={payload.socialScan.tickersWithMentions ?? "—"} />
              <Metric label="Mentions" value={payload.socialScan.totalMentions ?? "—"} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{payload.socialScan.message}</p>
          )}
        </SectionCard>

        <SectionCard title="Monitor executions" icon={ShieldAlert} status={payload.monitoring.status}>
          {payload.monitoring.executionCounts ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Completed" value={count("COMPLETED")} />
                <Metric label="Skipped" value={count("SKIPPED")} />
                <Metric label="Failed" value={count("FAILED")} />
                <Metric label="Credits" value={payload.monitoring.creditsCharged ?? "—"} />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skip reasons</p>
                {payload.monitoring.skipReasons?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {payload.monitoring.skipReasons.map((item) => (
                      <span key={item.reason} className="rounded-full bg-secondary px-3 py-1 text-xs text-foreground">
                        {item.reason}: {item.count}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No skipped executions in the reporting window.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{payload.monitoring.message}</p>
          )}
        </SectionCard>

        <SectionCard title="Notification delivery" icon={Bell} status={payload.notifications.status}>
          {payload.notifications.byStatus ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Delivered" value={notificationCount("DELIVERED")} />
              <Metric label="Pending" value={notificationCount("PENDING")} />
              <Metric label="Failed" value={notificationCount("FAILED")} />
              <Metric label="Window" value="30d" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{payload.notifications.message}</p>
          )}
        </SectionCard>

        <SectionCard title="Billing provider & config" icon={CreditCard} status={payload.billing.status}>
          {payload.billing.providers ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Active provider</span>
                <span className="font-semibold text-foreground">{payload.billing.activeProvider ?? "Unavailable"}</span>
              </div>
              {payload.billing.providers.map((provider) => (
                <div key={provider.name} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2 text-sm">
                  <span className="text-foreground">{provider.name}</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {provider.configured ? "Configured" : "Not configured"} · {provider.databaseStatus}
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">Credentials and raw provider configuration are intentionally hidden.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{payload.billing.message}</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
