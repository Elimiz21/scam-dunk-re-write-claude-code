"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatCard from "@/components/admin/StatCard";
import AlertBanner from "@/components/admin/AlertBanner";
import DataTable from "@/components/admin/DataTable";
import {
  Activity,
  DollarSign,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";

interface ApiUsageData {
  usageByService: {
    service: string;
    requests: number;
    tokensUsed: number;
    cost: number;
    avgResponseTime: number;
  }[];
  totalCost: number;
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  activeAlerts: {
    id: string;
    service: string;
    alertType: string;
    threshold: number;
    currentValue: number | null;
    isActive: boolean;
    lastTriggered: string | null;
  }[];
  triggeredAlerts: string[];
}

export default function ApiUsagePage() {
  const [data, setData] = useState<ApiUsageData | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({
    service: "ALL",
    alertType: "COST_THRESHOLD",
    threshold: 100,
  });
  const [savingAlert, setSavingAlert] = useState(false);

  useEffect(() => {
    fetchData();
  }, [period]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/api-usage?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch API usage");
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API usage");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAlert() {
    setSavingAlert(true);
    try {
      const res = await fetch("/api/admin/api-usage/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAlert),
      });
      if (!res.ok) throw new Error("Failed to create alert");
      setShowAddAlert(false);
      setNewAlert({ service: "ALL", alertType: "COST_THRESHOLD", threshold: 100 });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alert");
    } finally {
      setSavingAlert(false);
    }
  }

  async function handleDeleteAlert(id: string) {
    try {
      const res = await fetch("/api/admin/api-usage/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete alert");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete alert");
    }
  }

  const serviceColumns = [
    { key: "service", header: "Service" },
    {
      key: "requests",
      header: "Requests",
      render: (item: ApiUsageData["usageByService"][0]) => item.requests.toLocaleString(),
    },
    {
      key: "tokensUsed",
      header: "Tokens",
      render: (item: ApiUsageData["usageByService"][0]) =>
        item.tokensUsed > 0 ? item.tokensUsed.toLocaleString() : "-",
    },
    {
      key: "cost",
      header: "Est. Cost",
      render: (item: ApiUsageData["usageByService"][0]) => `$${item.cost.toFixed(2)}`,
    },
    {
      key: "avgResponseTime",
      header: "Avg Response",
      render: (item: ApiUsageData["usageByService"][0]) => `${item.avgResponseTime}ms`,
    },
  ];

  const alertColumns = [
    { key: "service", header: "Service" },
    {
      key: "alertType",
      header: "Type",
      render: (item: ApiUsageData["activeAlerts"][0]) =>
        item.alertType.replace("_", " ").toLowerCase(),
    },
    {
      key: "threshold",
      header: "Threshold",
      render: (item: ApiUsageData["activeAlerts"][0]) =>
        item.alertType === "COST_THRESHOLD" ? `$${item.threshold}` : item.threshold.toLocaleString(),
    },
    {
      key: "status",
      header: "Status",
      render: (item: ApiUsageData["activeAlerts"][0]) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            item.lastTriggered
              ? "bg-red-100 text-red-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {item.lastTriggered ? "Triggered" : "OK"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: ApiUsageData["activeAlerts"][0]) => (
        <button
          onClick={() => handleDeleteAlert(item.id)}
          className="text-red-600 hover:text-red-800"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Usage & Costs</h1>
            <p className="mt-1 text-sm text-gray-500">
              Monitor API usage, costs, and set up alerts
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as "day" | "week" | "month")}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {error && (
          <AlertBanner type="error" title="Error" message={error} onDismiss={() => setError("")} />
        )}

        {/* Triggered Alerts Warning */}
        {data && data.triggeredAlerts.length > 0 && (
          <AlertBanner
            type="warning"
            title="Alert Triggered"
            message={`${data.triggeredAlerts.length} alert(s) have been triggered. Review your API usage.`}
          />
        )}

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow h-32 animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard
                title="Total Requests"
                value={data.totalRequests}
                icon={Activity}
                color="blue"
              />
              <StatCard
                title="Estimated Cost"
                value={`$${data.totalCost.toFixed(2)}`}
                icon={DollarSign}
                color="green"
              />
              <StatCard
                title="Error Count"
                value={data.errorCount}
                icon={AlertTriangle}
                color={data.errorCount > 0 ? "red" : "green"}
              />
              <StatCard
                title="Error Rate"
                value={`${data.errorRate.toFixed(2)}%`}
                icon={Clock}
                color={data.errorRate > 5 ? "red" : "green"}
              />
            </div>

            {/* Usage by Service */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Usage by Service</h2>
              <DataTable columns={serviceColumns} data={data.usageByService} />
            </div>

            {/* Alerts Section */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Cost Alerts</h2>
                <button
                  onClick={() => setShowAddAlert(true)}
                  className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Alert
                </button>
              </div>

              {/* Add Alert Modal */}
              {showAddAlert && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                  <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Create Alert</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Service</label>
                        <select
                          value={newAlert.service}
                          onChange={(e) => setNewAlert({ ...newAlert, service: e.target.value })}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="ALL">All Services</option>
                          <option value="OPENAI">OpenAI</option>
                          <option value="ALPHA_VANTAGE">Alpha Vantage</option>
                          <option value="STRIPE">Stripe</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Alert Type</label>
                        <select
                          value={newAlert.alertType}
                          onChange={(e) => setNewAlert({ ...newAlert, alertType: e.target.value })}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="COST_THRESHOLD">Cost Threshold</option>
                          <option value="RATE_LIMIT">Rate Limit (per hour)</option>
                          <option value="ERROR_RATE">Error Rate (%)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Threshold {newAlert.alertType === "COST_THRESHOLD" ? "(USD)" : ""}
                        </label>
                        <input
                          type="number"
                          value={newAlert.threshold}
                          onChange={(e) =>
                            setNewAlert({ ...newAlert, threshold: parseFloat(e.target.value) })
                          }
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        onClick={() => setShowAddAlert(false)}
                        className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddAlert}
                        disabled={savingAlert}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingAlert ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          "Create Alert"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <DataTable
                columns={alertColumns}
                data={data.activeAlerts}
                emptyMessage="No alerts configured. Add an alert to monitor API costs."
              />
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
