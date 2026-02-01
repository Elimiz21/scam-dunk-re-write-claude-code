"use client";

import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import ChartCard from "@/components/admin/ChartCard";
import {
  Search,
  TrendingUp,
  AlertTriangle,
  Activity,
  DollarSign,
  BarChart3,
  Calendar,
  ExternalLink,
} from "lucide-react";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
}

interface StockData {
  stock: {
    symbol: string;
    name: string;
    exchange: string;
    sector: string | null;
    industry: string | null;
    isOTC: boolean;
  };
  current: {
    riskLevel: string;
    totalScore: number;
    lastPrice: number | null;
    priceChangePct: number | null;
    volume: number | null;
    volumeRatio: number | null;
    signalCount: number;
    signals: string;
    scanDate: string;
  } | null;
  riskHistory: {
    date: string;
    riskLevel: string;
    totalScore: number;
    price: number | null;
    volume: number | null;
  }[];
  riskCounts: Record<string, number>;
  alerts: {
    alertType: string;
    alertDate: string;
    previousRiskLevel: string | null;
    newRiskLevel: string;
    previousScore: number | null;
    newScore: number;
  }[];
  promotion: {
    promoterName: string;
    platform: string;
    entryPrice: number;
    addedDate: string;
    outcome: string | null;
    currentGainPct: number | null;
  } | null;
  daysTracked: number;
}

const riskLevelColors: Record<string, string> = {
  LOW: "bg-green-100 text-green-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-red-100 text-red-800",
  INSUFFICIENT: "bg-gray-100 text-gray-800",
};

export default function StockLookupPage() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState(90);

  async function handleSearch(searchQuery: string) {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/admin/stock-lookup?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Search error:", err);
    }
  }

  async function lookupStock(symbol: string) {
    setLoading(true);
    setError("");
    setSearchResults([]);
    setQuery(symbol);

    try {
      const res = await fetch(`/api/admin/stock-lookup?symbol=${symbol}&days=${days}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError(`Stock ${symbol} not found in tracking database`);
        } else {
          throw new Error("Failed to fetch");
        }
        setStockData(null);
        return;
      }
      const data = await res.json();
      setStockData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setStockData(null);
    } finally {
      setLoading(false);
    }
  }

  const scoreHistory = stockData?.riskHistory.map((h) => ({
    label: h.date.slice(5),
    value: h.totalScore,
  })) || [];

  const priceHistory = stockData?.riskHistory
    .filter((h) => h.price !== null)
    .map((h) => ({
      label: h.date.slice(5),
      value: h.price!,
    })) || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Lookup</h1>
          <p className="mt-1 text-sm text-gray-500">
            Search and analyze historical risk data for tracked stocks
          </p>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) {
                    lookupStock(query.trim().toUpperCase());
                  }
                }}
                placeholder="Search by symbol or company name..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.symbol}
                      onClick={() => lookupStock(result.symbol)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex justify-between items-center"
                    >
                      <div>
                        <span className="font-medium text-indigo-600">{result.symbol}</span>
                        <span className="ml-2 text-sm text-gray-600">{result.name}</span>
                      </div>
                      <span className="text-xs text-gray-400">{result.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-md"
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
            <button
              onClick={() => query.trim() && lookupStock(query.trim().toUpperCase())}
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Lookup"}
            </button>
          </div>
        </div>

        {error && <AlertBanner type="error" title="Error" message={error} />}

        {/* Stock Data */}
        {stockData && (
          <>
            {/* Stock Header */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-900">{stockData.stock.symbol}</h2>
                    {stockData.stock.isOTC && (
                      <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">OTC</span>
                    )}
                    <span className="text-sm text-gray-500">{stockData.stock.exchange}</span>
                  </div>
                  <p className="text-gray-600 mt-1">{stockData.stock.name}</p>
                  {stockData.stock.sector && (
                    <p className="text-sm text-gray-500 mt-1">
                      {stockData.stock.sector} {stockData.stock.industry && `• ${stockData.stock.industry}`}
                    </p>
                  )}
                </div>
                {stockData.current && (
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${riskLevelColors[stockData.current.riskLevel]}`}>
                      {stockData.current.riskLevel} RISK
                    </span>
                    <div className="mt-2 text-2xl font-bold">
                      Score: {stockData.current.totalScore}
                    </div>
                  </div>
                )}
              </div>

              {/* Current Stats */}
              {stockData.current && (
                <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center text-gray-500 text-sm">
                      <DollarSign className="h-4 w-4 mr-1" />
                      Price
                    </div>
                    <div className="mt-1 font-semibold">
                      {stockData.current.lastPrice ? `$${stockData.current.lastPrice.toFixed(2)}` : "-"}
                    </div>
                    {stockData.current.priceChangePct !== null && (
                      <div className={`text-xs ${stockData.current.priceChangePct >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {stockData.current.priceChangePct >= 0 ? "+" : ""}{stockData.current.priceChangePct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center text-gray-500 text-sm">
                      <BarChart3 className="h-4 w-4 mr-1" />
                      Volume
                    </div>
                    <div className="mt-1 font-semibold">
                      {stockData.current.volume ? stockData.current.volume.toLocaleString() : "-"}
                    </div>
                    {stockData.current.volumeRatio !== null && (
                      <div className="text-xs text-gray-500">
                        {stockData.current.volumeRatio.toFixed(1)}x avg
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center text-gray-500 text-sm">
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      Signals
                    </div>
                    <div className="mt-1 font-semibold">{stockData.current.signalCount}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center text-gray-500 text-sm">
                      <Calendar className="h-4 w-4 mr-1" />
                      Last Scan
                    </div>
                    <div className="mt-1 font-semibold text-sm">
                      {new Date(stockData.current.scanDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center text-gray-500 text-sm">
                      <Activity className="h-4 w-4 mr-1" />
                      Days Tracked
                    </div>
                    <div className="mt-1 font-semibold">{stockData.daysTracked}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Promotion Warning */}
            {stockData.promotion && (
              <AlertBanner
                type="warning"
                title="Promoted Stock"
                message={`This stock was promoted by ${stockData.promotion.promoterName} on ${stockData.promotion.platform} at $${stockData.promotion.entryPrice.toFixed(2)}. ${stockData.promotion.outcome ? `Outcome: ${stockData.promotion.outcome}` : ""}`}
              />
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {scoreHistory.length > 0 && (
                <ChartCard
                  title="Risk Score History"
                  data={scoreHistory}
                  type="line"
                  color="#ef4444"
                />
              )}
              {priceHistory.length > 0 && (
                <ChartCard
                  title="Price History"
                  data={priceHistory}
                  type="line"
                  color="#6366f1"
                />
              )}
            </div>

            {/* Risk Distribution */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Risk Level Distribution</h3>
              <div className="flex gap-4">
                {Object.entries(stockData.riskCounts).map(([level, count]) => (
                  <div
                    key={level}
                    className={`flex-1 p-4 rounded-lg ${riskLevelColors[level]} bg-opacity-50`}
                  >
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm">{level} days</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Alerts */}
            {stockData.alerts.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Recent Alerts</h3>
                </div>
                <div className="divide-y divide-gray-200">
                  {stockData.alerts.map((alert, idx) => (
                    <div key={idx} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{alert.alertType.replace(/_/g, " ")}</span>
                        <span className="text-gray-500 ml-2">
                          {alert.previousRiskLevel} → {alert.newRiskLevel}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(alert.alertDate).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signals */}
            {stockData.current && stockData.current.signals !== "[]" && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Current Signals</h3>
                <div className="flex flex-wrap gap-2">
                  {JSON.parse(stockData.current.signals).map((signal: { code: string; category: string; weight: number }, idx: number) => (
                    <span
                      key={idx}
                      className={`px-3 py-1 rounded-full text-sm ${
                        signal.weight >= 20 ? "bg-red-100 text-red-800" :
                        signal.weight >= 10 ? "bg-yellow-100 text-yellow-800" :
                        "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {signal.code} ({signal.weight})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!stockData && !loading && !error && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Search className="h-12 w-12 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Search for a Stock</h3>
            <p className="mt-2 text-gray-500">
              Enter a stock symbol or company name to view historical risk analysis
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
