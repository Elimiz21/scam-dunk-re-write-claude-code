import { Gauge, Zap } from "lucide-react";

import type { DashboardPayload } from "@/components/dashboard/types";
import { buildUsageView } from "@/components/dashboard/view-model";
import { Card, CardContent } from "@/components/ui/card";

type UsageSummaryProps = Pick<
  DashboardPayload,
  "plan" | "usage" | "monitorSlots"
>;

export function UsageSummary({
  plan,
  usage,
  monitorSlots,
}: UsageSummaryProps) {
  const usedPercent = usage.creditsLimit > 0
    ? Math.min(100, Math.round((usage.creditsUsed / usage.creditsLimit) * 100))
    : 100;
  const noCredits = usage.creditsRemaining === 0;
  const view = buildUsageView({ usage, monitorSlots });

  return (
    <section aria-labelledby="usage-summary-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{plan.displayName} plan</p>
          <h2 id="usage-summary-title" className="mt-1 font-editorial text-xl">Usage this month</h2>
        </div>
        {noCredits && <span className="text-xs font-semibold text-destructive">{view.quotaLabel}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-primary"><Zap className="h-4 w-4" aria-hidden="true" /><span className="text-xs font-bold uppercase tracking-wider">Scan credits</span></div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{usage.creditsRemaining}</p>
            <p className="mt-1 text-xs text-muted-foreground">{view.creditsLabel}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <div className="h-full rounded-full gradient-brand" style={{ width: `${usedPercent}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-primary"><Gauge className="h-4 w-4" aria-hidden="true" /><span className="text-xs font-bold uppercase tracking-wider">Monitoring</span></div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{monitorSlots.full.remaining}</p>
            <p className="mt-1 text-xs text-muted-foreground">{view.fullMonitorLabel}</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
