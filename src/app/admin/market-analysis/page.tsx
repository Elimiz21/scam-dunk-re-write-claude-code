"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatCard from "@/components/admin/StatCard";
import ChartCard from "@/components/admin/ChartCard";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Target,
  Calendar,
} from "lucide-react";

interface MarketAnalysisData {
  stats: {
    totalStocksTracked: number;
    highRiskCount: number;
    highRiskChange: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    lastScanDate: string | null;
    promotedCount: number;
  };
  riskTrend: {
    date: string;
    low: number;
    medium: number;
    high: number;
    total: number;
  }[];
  highRiskStocks: {
    symbol: string;
    name: string;
    totalScore: number;
    signalCount: number;
    lastPrice: number | null;
    priceChangePct: number | null;
  }[];
  promotedStocks: {
    symbol: string;
    promoterName: string;
    promotionPlatform: string;
    entryPrice: number;
    currentPrice: number | null;
    outcome: string | null;
    currentGainPct: number | null;
  }[];
}

export default function MarketAnalysisPage() {
  const [data, setData] = useState<MarketAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchData();
  }, [days]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/market-analysis?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card rounded-2xl shadow h-32" />
            ))}
          </div>
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

  if (!data) return null;

  const trendData = data.riskTrend.map((d) => ({
    label: d.date.slice(5),
    value: d.high,
  }));

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Market Analysis</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily stock risk evaluation trends and high-risk stocks
            </p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-4 py-2 border border-border rounded-md text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Tracked"
            value={data.stats.totalStocksTracked}
            icon={Activity}
            color="blue"
          />
          <StatCard
            title="High Risk"
            value={data.stats.highRiskCount}
            icon={AlertTriangle}
            color="red"
            change={data.stats.highRiskChange !== 0 ? data.stats.highRiskChange : undefined}
            changeLabel="vs yesterday"
          />
          <StatCard
            title="Medium Risk"
            value={data.stats.mediumRiskCount}
            icon={Target}
            color="yellow"
          />
          <StatCard
            title="Promoted Stocks"
            value={data.stats.promotedCount}
            icon={TrendingUp}
            color="purple"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            title="High Risk Stock Trend"
            data={trendData}
            type="line"
            color="#ef4444"
          />
          <div className="bg-card rounded-2xl shadow p-6">
            <h3 className="text-lg font-medium text-foreground mb-4">Risk Distribution</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-600">Low Risk</span>
                  <span className="font-medium">{data.stats.lowRiskCount}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-3">
                  <div
                    className="bg-green-500 h-3 rounded-full"
                    style={{
                      width: `${(data.stats.lowRiskCount / Math.max(data.stats.totalStocksTracked, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-yellow-600">Medium Risk</span>
                  <span className="font-medium">{data.stats.mediumRiskCount}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-3">
                  <div
                    className="bg-yellow-500 h-3 rounded-full"
                    style={{
                      width: `${(data.stats.mediumRiskCount / Math.max(data.stats.totalStocksTracked, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-red-600">High Risk</span>
                  <span className="font-medium">{data.stats.highRiskCount}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-3">
                  <div
                    className="bg-red-500 h-3 rounded-full"
                    style={{
                      width: `${(data.stats.highRiskCount / Math.max(data.stats.totalStocksTracked, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            {data.stats.lastScanDate && (
              <p className="mt-4 text-xs text-muted-foreground flex items-center">
                <Calendar className="h-3 w-3 mr-1" />
                Last scan: {new Date(data.stats.lastScanDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* High Risk Stocks Table */}
        <div className="bg-card rounded-2xl shadow">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-medium text-foreground">Top High Risk Stocks</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Signals</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Change</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {data.highRiskStocks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No high risk stocks found. Run a daily evaluation to populate data.
                    </td>
                  </tr>
                ) : (
                  data.highRiskStocks.map((stock) => (
                    <tr key={stock.symbol} className="hover:bg-secondary">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-primary">{stock.symbol}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground max-w-xs truncate">
                        {stock.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                          {stock.totalScore}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {stock.signalCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {stock.lastPrice ? `$${stock.lastPrice.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {stock.priceChangePct !== null ? (
                          <span className={stock.priceChangePct >= 0 ? "text-green-600" : "text-red-600"}>
                            {stock.priceChangePct >= 0 ? "+" : ""}{stock.priceChangePct.toFixed(2)}%
                          </span>
                        ) : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Promoted Stocks */}
        {data.promotedStocks.length > 0 && (
          <div className="bg-card rounded-2xl shadow">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Promoted Stock Watchlist</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Promoter</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Platform</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Entry Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Current</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Outcome</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {data.promotedStocks.map((stock, idx) => (
                    <tr key={idx} className="hover:bg-secondary">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-primary">
                        {stock.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {stock.promoterName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {stock.promotionPlatform}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        ${stock.entryPrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {stock.currentPrice ? (
                          <span className={stock.currentGainPct && stock.currentGainPct >= 0 ? "text-green-600" : "text-red-600"}>
                            ${stock.currentPrice.toFixed(2)}
                            {stock.currentGainPct && ` (${stock.currentGainPct >= 0 ? "+" : ""}${stock.currentGainPct.toFixed(1)}%)`}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {stock.outcome && (
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            stock.outcome === "DUMPED" ? "bg-red-100 text-red-800" :
                            stock.outcome === "PUMPING" ? "bg-yellow-100 text-yellow-800" :
                            stock.outcome === "PEAKED" ? "bg-orange-100 text-orange-800" :
                            "bg-secondary text-foreground"
                          }`}>
                            {stock.outcome}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
