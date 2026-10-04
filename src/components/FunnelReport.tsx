"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, CreditCard, ScanSearch, UserPlus } from "lucide-react";

import type { ConversionFunnelReport } from "@/lib/admin/conversion-funnel";

const formatNumber = new Intl.NumberFormat("en-US");

export function FunnelReport({ endpoint, compact = false }: { endpoint: string; compact?: boolean }) {
  const [report, setReport] = useState<ConversionFunnelReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load funnel metrics.");
        const next = await response.json() as ConversionFunnelReport;
        if (active) {
          setReport(next);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load funnel metrics.");
      }
    };
    void load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [endpoint]);

  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>;
  if (!report) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />;

  const stages = [
    { label: "Signed up", value: report.allTime.signUps, icon: UserPlus },
    { label: "Verified email", value: report.allTime.emailVerified, icon: CheckCircle2 },
    { label: "Started scanning", value: report.allTime.startedScanning, icon: ScanSearch },
    { label: "Checkout started", value: report.allTime.checkoutStarts, icon: Activity },
    { label: "Purchased", value: report.allTime.purchases, icon: CreditCard },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <section key={stage.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <Icon className="mb-4 h-4 w-4 text-teal" aria-hidden="true" />
              <p className="text-2xl font-semibold tabular-nums text-foreground">{formatNumber.format(stage.value)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stage.label}</p>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Last 30 days</h2>
            <p className="mt-1 text-sm text-muted-foreground">Verified user conversion and paid plan movement.</p>
          </div>
          <p className="text-xs text-muted-foreground">Refreshes every minute · {new Date(report.generatedAt).toLocaleString()}</p>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div><dt className="text-sm text-muted-foreground">Signup → verified</dt><dd className="mt-1 text-xl font-semibold">{report.conversionRates.verifiedFromSignup}%</dd></div>
          <div><dt className="text-sm text-muted-foreground">Verified → scanning</dt><dd className="mt-1 text-xl font-semibold">{report.conversionRates.scannedFromVerified}%</dd></div>
          <div><dt className="text-sm text-muted-foreground">Checkout → purchase</dt><dd className="mt-1 text-xl font-semibold">{report.conversionRates.purchaseFromCheckout}%</dd></div>
        </dl>
        {!compact && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr><th className="pb-3 font-medium">Date</th><th className="pb-3 font-medium">Signups</th><th className="pb-3 font-medium">Verified</th><th className="pb-3 font-medium">Scanned</th><th className="pb-3 font-medium">Checkout</th><th className="pb-3 font-medium">Purchases</th></tr>
              </thead>
              <tbody>
                {report.daily.slice(-7).reverse().map((day) => (
                  <tr key={day.date} className="border-b border-border/70 last:border-0"><td className="py-3">{day.date}</td><td className="py-3 tabular-nums">{day.signUps}</td><td className="py-3 tabular-nums">{day.emailVerified}</td><td className="py-3 tabular-nums">{day.startedScanning}</td><td className="py-3 tabular-nums">{day.checkoutStarts}</td><td className="py-3 tabular-nums">{day.purchases}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
