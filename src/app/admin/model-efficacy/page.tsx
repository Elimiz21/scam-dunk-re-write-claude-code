"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatCard from "@/components/admin/StatCard";
import ChartCard from "@/components/admin/ChartCard";
import DataTable from "@/components/admin/DataTable";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Shield,
  Target,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface ModelMetrics {
  totals: {
    totalScans: number;
    lowRisk: number;
    mediumRisk: number;
    highRisk: number;
    insufficient: number;
    legitDetected: number;
    falsePositives: number;
    falseNegatives: number;
  };
  dailyMetrics: {
    dateKey: string;
    totalScans: number;
    lowRiskCount: number;
    mediumRiskCount: number;
    highRiskCount: number;
    insufficientCount: number;
  }[];
  topTickers: { ticker: string; count: number }[];
  highRiskRate: number;
  accuracy: number | null;
  avgProcessingTime: number;
  avgScore: number;
}

interface Scan {
  id: string;
  ticker: string;
  assetType: string;
  riskLevel: string;
  totalScore: number;
  signalsCount: number;
  processingTime: number | null;
  isLegitimate: boolean | null;
  createdAt: string;
}

export default function ModelEfficacyPage() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [filterRisk, setFilterRisk] = useState("");

  useEffect(() => {
    fetchMetrics();
  }, [days]);

  useEffect(() => {
    fetchScans();
  }, [pagination.page, filterRisk]);

  async function fetchMetrics() {
    try {
      const res = await fetch(`/api/admin/model-efficacy?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }

  async function fetchScans() {
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: "10",
      });
      if (filterRisk) params.append("riskLevel", filterRisk);

      const res = await fetch(`/api/admin/model-efficacy/scans?${params}`);
      if (!res.ok) throw new Error("Failed to fetch scans");
      const data = await res.json();
      setScans(data.scans);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scans");
    }
  }

  async function submitFeedback(scanId: string, feedbackType: string) {
    try {
      const res = await fetch("/api/admin/model-efficacy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId, feedbackType }),
      });
      if (!res.ok) throw new Error("Failed to submit feedback");
      await fetchMetrics();
      await fetchScans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    }
  }

  function getRiskBadge(level: string) {
    const colors: Record<string, string> = {
      LOW: "bg-green-100 text-green-800",
      MEDIUM: "bg-yellow-100 text-yellow-800",
      HIGH: "bg-red-100 text-red-800",
      INSUFFICIENT: "bg-secondary text-foreground",
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          colors[level] || colors.INSUFFICIENT
        }`}
      >
        {level}
      </span>
    );
  }

  const scanColumns = [
    {
      key: "ticker",
      header: "Ticker",
      render: (item: Scan) => <span className="font-mono font-medium">{item.ticker}</span>,
    },
    {
      key: "riskLevel",
      header: "Risk Level",
      render: (item: Scan) => getRiskBadge(item.riskLevel),
    },
    {
      key: "totalScore",
      header: "Score",
      render: (item: Scan) => item.totalScore,
    },
    {
      key: "signalsCount",
      header: "Signals",
      render: (item: Scan) => item.signalsCount,
    },
    {
      key: "processingTime",
      header: "Time",
      render: (item: Scan) => (item.processingTime ? `${item.processingTime}ms` : "-"),
    },
    {
      key: "createdAt",
      header: "Date",
      render: (item: Scan) => new Date(item.createdAt).toLocaleDateString(),
    },
    {
      key: "feedback",
      header: "Feedback",
      render: (item: Scan) => (
        <div className="flex space-x-1">
          <button
            onClick={() => submitFeedback(item.id, "CORRECT")}
            className="p-1 text-green-600 hover:bg-green-50 rounded"
            title="Mark as correct"
          >
            <CheckCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => submitFeedback(item.id, "FALSE_POSITIVE")}
            className="p-1 text-yellow-600 hover:bg-yellow-50 rounded"
            title="Mark as false positive"
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
          <button
            onClick={() => submitFeedback(item.id, "FALSE_NEGATIVE")}
            className="p-1 text-red-600 hover:bg-red-50 rounded"
            title="Mark as false negative"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const trendData =
    metrics?.dailyMetrics.slice(-7).map((d) => ({
      label: d.dateKey.split("-").slice(1).join("/"),
      value: d.totalScans,
    })) || [];

  const riskDistData = metrics
    ? [
        { label: "Low Risk", value: metrics.totals.lowRisk },
        { label: "Medium Risk", value: metrics.totals.mediumRisk },
        { label: "High Risk", value: metrics.totals.highRisk },
        { label: "Insufficient", value: metrics.totals.insufficient },
      ]
    : [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Model Efficacy</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor and improve scam detection accuracy
            </p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {error && (
          <AlertBanner type="error" title="Error" message={error} onDismiss={() => setError("")} />
        )}

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card rounded-2xl shadow h-32 animate-pulse" />
            ))}
          </div>
        ) : metrics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard
                title="Total Scans"
                value={metrics.totals.totalScans}
                icon={Shield}
                color="blue"
              />
              <StatCard
                title="High Risk Rate"
                value={`${metrics.highRiskRate.toFixed(1)}%`}
                icon={AlertTriangle}
                color="red"
              />
              <StatCard
                title="Avg Processing Time"
                value={`${Math.round(metrics.avgProcessingTime)}ms`}
                icon={Clock}
                color="purple"
              />
              <StatCard
                title="Average Score"
                value={metrics.avgScore.toFixed(1)}
                icon={TrendingUp}
                color="indigo"
              />
            </div>

            {/* Accuracy Card */}
            {metrics.accuracy !== null && (
              <div className="bg-card rounded-2xl shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-foreground">Model Accuracy</h3>
                    <p className="text-sm text-muted-foreground">Based on manual feedback</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-bold text-primary">
                      {metrics.accuracy.toFixed(1)}%
                    </p>
                    <div className="mt-2 flex space-x-4 text-sm">
                      <span className="text-yellow-600">
                        {metrics.totals.falsePositives} false positives
                      </span>
                      <span className="text-red-600">
                        {metrics.totals.falseNegatives} false negatives
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title="Daily Scan Volume"
                data={trendData}
                type="line"
                color="#6366f1"
              />
              <ChartCard
                title="Risk Distribution"
                data={riskDistData}
                type="bar"
                color="#10b981"
              />
            </div>

            {/* Top Tickers */}
            <div className="bg-card rounded-2xl shadow p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Most Scanned Tickers</h3>
              <div className="flex flex-wrap gap-2">
                {metrics.topTickers.map((ticker) => (
                  <span
                    key={ticker.ticker}
                    className="inline-flex items-center px-3 py-1 rounded-full bg-secondary text-sm"
                  >
                    <span className="font-mono font-medium">{ticker.ticker}</span>
                    <span className="ml-2 text-muted-foreground">{ticker.count}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Recent Scans for Review */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-foreground">Recent Scans</h3>
                <select
                  value={filterRisk}
                  onChange={(e) => setFilterRisk(e.target.value)}
                  className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground"
                >
                  <option value="">All Risk Levels</option>
                  <option value="LOW">Low Risk</option>
                  <option value="MEDIUM">Medium Risk</option>
                  <option value="HIGH">High Risk</option>
                  <option value="INSUFFICIENT">Insufficient</option>
                </select>
              </div>
              <DataTable
                columns={scanColumns}
                data={scans}
                pagination={{
                  ...pagination,
                  onPageChange: (page) => setPagination((p) => ({ ...p, page })),
                }}
                emptyMessage="No scans found"
              />
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
