"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Bell,
  Check,
  Filter,
} from "lucide-react";

interface RiskAlert {
  id: string;
  symbol: string;
  stockName: string;
  alertType: string;
  alertDate: string;
  previousRiskLevel: string | null;
  newRiskLevel: string;
  previousScore: number | null;
  newScore: number;
  priceAtAlert: number | null;
  triggeringSignals: string | null;
  isAcknowledged: boolean;
  notes: string | null;
}

interface AlertsData {
  alerts: RiskAlert[];
  countsByType: Record<string, number>;
  unacknowledgedCount: number;
  totalCount: number;
}

const alertTypeLabels: Record<string, { label: string; color: string }> = {
  NEW_HIGH_RISK: { label: "New High Risk", color: "bg-red-100 text-red-800" },
  RISK_INCREASED: { label: "Risk Increased", color: "bg-orange-100 text-orange-800" },
  RISK_DECREASED: { label: "Risk Decreased", color: "bg-green-100 text-green-800" },
  PUMP_DETECTED: { label: "Pump Detected", color: "bg-purple-100 text-purple-800" },
  DUMP_DETECTED: { label: "Dump Detected", color: "bg-red-100 text-red-800" },
};

const riskLevelColors: Record<string, string> = {
  LOW: "text-green-600",
  MEDIUM: "text-yellow-600",
  HIGH: "text-red-600",
  INSUFFICIENT: "text-muted-foreground",
};

export default function RiskAlertsPage() {
  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(7);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showAcknowledged, setShowAcknowledged] = useState(true);

  useEffect(() => {
    fetchData();
  }, [days, typeFilter, showAcknowledged]);

  async function fetchData() {
    setLoading(true);
    try {
      let url = `/api/admin/risk-alerts?days=${days}`;
      if (typeFilter) url += `&type=${typeFilter}`;
      if (!showAcknowledged) url += `&acknowledged=false`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function acknowledgeAlert(alertId: string) {
    try {
      const res = await fetch("/api/admin/risk-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, isAcknowledged: true }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to acknowledge:", err);
    }
  }

  if (loading && !data) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="bg-card rounded-2xl shadow h-64" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <AlertBanner type="error" title="Error" message={error} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Risk Alerts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor stocks crossing risk thresholds
            </p>
          </div>
          <div className="flex items-center gap-4">
            {data && data.unacknowledgedCount > 0 && (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                {data.unacknowledgedCount} unread
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl shadow p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filters:</span>
            </div>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-1.5 border border-border rounded-md text-sm bg-card text-foreground"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-md text-sm bg-card text-foreground"
            >
              <option value="">All Types</option>
              <option value="NEW_HIGH_RISK">New High Risk</option>
              <option value="RISK_INCREASED">Risk Increased</option>
              <option value="RISK_DECREASED">Risk Decreased</option>
              <option value="PUMP_DETECTED">Pump Detected</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded border-border"
              />
              Show acknowledged
            </label>
          </div>
        </div>

        {/* Alert Type Summary */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(alertTypeLabels).map(([type, { label, color }]) => (
              <div
                key={type}
                className={`p-4 rounded-2xl ${color.replace('text-', 'bg-').split(' ')[0]} bg-opacity-50`}
              >
                <div className="text-2xl font-bold">{data.countsByType[type] || 0}</div>
                <div className="text-sm">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Alerts Table */}
        <div className="bg-card rounded-2xl shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Alert Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Risk Change</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {!data || data.alerts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      No alerts found. Run daily evaluations to generate alerts.
                    </td>
                  </tr>
                ) : (
                  data.alerts.map((alert) => (
                    <tr
                      key={alert.id}
                      className={`hover:bg-secondary/50 ${!alert.isAcknowledged ? "bg-yellow-50" : ""}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        {alert.isAcknowledged ? (
                          <Check className="h-5 w-5 text-green-500" />
                        ) : (
                          <div className="h-2 w-2 bg-red-500 rounded-full" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-primary">{alert.symbol}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {alert.stockName}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          alertTypeLabels[alert.alertType]?.color || "bg-secondary text-foreground"
                        }`}>
                          {alertTypeLabels[alert.alertType]?.label || alert.alertType}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {alert.previousRiskLevel && (
                            <>
                              <span className={riskLevelColors[alert.previousRiskLevel]}>
                                {alert.previousRiskLevel}
                              </span>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <span className={riskLevelColors[alert.newRiskLevel]}>
                            {alert.newRiskLevel}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {alert.previousScore !== null && (
                          <span className="text-muted-foreground">{alert.previousScore} → </span>
                        )}
                        <span className="font-medium">{alert.newScore}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {alert.priceAtAlert ? `$${alert.priceAtAlert.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(alert.alertDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {!alert.isAcknowledged && (
                          <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="text-primary hover:text-primary/80 text-sm font-medium"
                          >
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
