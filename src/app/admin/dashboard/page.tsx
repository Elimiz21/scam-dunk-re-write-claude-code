"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatCard from "@/components/admin/StatCard";
import ChartCard from "@/components/admin/ChartCard";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Users,
  Activity,
  TrendingUp,
  Clock,
  UserPlus,
  CreditCard,
  AlertTriangle,
  Shield,
} from "lucide-react";

interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  monthlyScans: number;
  scansToday: number;
  paidUsers: number;
  freeUsers: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    insufficient: number;
  };
  dailyTrend: { dateKey: string; totalScans: number }[];
  newUsersToday: number;
  newUsersThisMonth: number;
  avgProcessingTime: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMetrics();
  }, []);

  async function fetchMetrics() {
    try {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow h-32" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <AlertBanner type="error" title="Error Loading Dashboard" message={error} />
      </AdminLayout>
    );
  }

  if (!metrics) return null;

  const riskData = [
    { label: "Low Risk", value: metrics.riskDistribution.low },
    { label: "Medium Risk", value: metrics.riskDistribution.medium },
    { label: "High Risk", value: metrics.riskDistribution.high },
    { label: "Insufficient", value: metrics.riskDistribution.insufficient },
  ];

  const trendData = metrics.dailyTrend.map((d) => ({
    label: d.dateKey.split("-").slice(1).join("/"),
    value: d.totalScans,
  }));

  const conversionRate = metrics.totalUsers > 0
    ? ((metrics.paidUsers / metrics.totalUsers) * 100).toFixed(1)
    : "0";

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of Scam Dunk application metrics
          </p>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Users"
            value={metrics.totalUsers}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Active Users (30d)"
            value={metrics.activeUsers}
            icon={Activity}
            color="green"
          />
          <StatCard
            title="Monthly Scans"
            value={metrics.monthlyScans}
            icon={TrendingUp}
            color="indigo"
          />
          <StatCard
            title="Scans Today"
            value={metrics.scansToday}
            icon={Shield}
            color="purple"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="New Users Today"
            value={metrics.newUsersToday}
            icon={UserPlus}
            color="green"
          />
          <StatCard
            title="New Users (Month)"
            value={metrics.newUsersThisMonth}
            icon={UserPlus}
            color="blue"
          />
          <StatCard
            title="Paid Subscribers"
            value={metrics.paidUsers}
            icon={CreditCard}
            color="yellow"
          />
          <StatCard
            title="Avg Processing Time"
            value={`${Math.round(metrics.avgProcessingTime)}ms`}
            icon={Clock}
            color="purple"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            title="Risk Distribution (Last 30 Days)"
            data={riskData}
            type="bar"
            color="#6366f1"
          />
          <ChartCard
            title="Daily Scan Trend (Last 7 Days)"
            data={trendData}
            type="line"
            color="#10b981"
          />
        </div>

        {/* User Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">User Plan Breakdown</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Free Users</span>
                  <span className="font-medium">{metrics.freeUsers}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-gray-500 h-3 rounded-full"
                    style={{
                      width: `${(metrics.freeUsers / Math.max(metrics.totalUsers, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Paid Users</span>
                  <span className="font-medium">{metrics.paidUsers}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-indigo-500 h-3 rounded-full"
                    style={{
                      width: `${(metrics.paidUsers / Math.max(metrics.totalUsers, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-gray-500">
                  Conversion Rate: <span className="font-medium text-indigo-600">{conversionRate}%</span>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Risk Detection Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="h-3 w-3 bg-green-500 rounded-full mr-2" />
                  <span className="text-sm font-medium text-green-700">Low Risk</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-green-900">
                  {metrics.riskDistribution.low}
                </p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="h-3 w-3 bg-yellow-500 rounded-full mr-2" />
                  <span className="text-sm font-medium text-yellow-700">Medium Risk</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-yellow-900">
                  {metrics.riskDistribution.medium}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertTriangle className="h-3 w-3 text-red-500 mr-2" />
                  <span className="text-sm font-medium text-red-700">High Risk</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-red-900">
                  {metrics.riskDistribution.high}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="h-3 w-3 bg-gray-500 rounded-full mr-2" />
                  <span className="text-sm font-medium text-gray-700">Insufficient</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {metrics.riskDistribution.insufficient}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
