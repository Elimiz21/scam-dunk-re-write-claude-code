"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import MonitoringHealthPanel from "@/components/admin/MonitoringHealthPanel";

export default function AdminMonitoringPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Social & publication operations
          </p>
          <h1 className="mt-2 text-2xl font-bold font-display italic text-foreground">
            Monitoring health
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Read-only operational summaries for publication freshness, monitor execution, notification delivery, social scans, and billing configuration.
          </p>
        </div>
        <MonitoringHealthPanel />
      </div>
    </AdminLayout>
  );
}
