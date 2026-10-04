"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import { FunnelReport } from "@/components/FunnelReport";

export default function ConversionFunnelPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Conversion Funnel</h1>
          <p className="mt-1 text-sm text-muted-foreground">First-party signup, verification, scanning, checkout, and purchase metrics.</p>
        </header>
        <FunnelReport endpoint="/api/admin/funnel" />
      </div>
    </AdminLayout>
  );
}
