"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Database,
  Upload,
  Check,
  Clock,
  AlertCircle,
  RefreshCw,
  Wrench,
  CheckCircle,
  XCircle,
} from "lucide-react";

// Helper to safely parse JSON response
async function safeJsonParse(res: Response): Promise<{ data: unknown; error?: string }> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return { data };
  } catch {
    // If not valid JSON, return the text as error
    return { data: null, error: text.substring(0, 200) };
  }
}

interface FileStatus {
  date: string;
  hasEvaluation: boolean;
  hasSummary: boolean;
  hasPromoted?: boolean;
  hasComparison?: boolean;
}

interface IngestionStatus {
  availableDates: string[];
  ingestedDates: string[];
  pendingDates: string[];
  fileStatus?: FileStatus[];
  debug?: {
    filesFound: number;
    evaluationFiles: number;
    summaryFiles: number;
    promotedFiles: number;
    comparisonFiles: number;
    allFileNames: string[];
  };
}

interface IngestionResult {
  success: boolean;
  date: string;
  stocksCreated: number;
  stocksUpdated: number;
  snapshotsCreated: number;
  alertsCreated: number;
  promotedStocksCreated?: number;
  totalProcessed: number;
}

interface DbStatus {
  status: "ready" | "empty" | "missing_tables";
  tables: Record<string, { exists: boolean; count?: number; error?: string }>;
  message: string;
}

export default function DataIngestionPage() {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [creatingTables, setCreatingTables] = useState(false);
  const [results, setResults] = useState<IngestionResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    checkDbStatus();
  }, []);

  async function checkDbStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/db-status");
      const { data, error: parseError } = await safeJsonParse(res);

      if (parseError) {
        throw new Error(`Server returned invalid response: ${parseError}`);
      }

      if (!res.ok) {
        const errData = data as { error?: string };
        throw new Error(errData?.error || "Failed to check database status");
      }

      setDbStatus(data as DbStatus);

      // If tables exist, fetch ingestion status
      if ((data as DbStatus).status !== "missing_tables") {
        await fetchStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check database");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/api/admin/ingest-evaluation");
      const { data, error: parseError } = await safeJsonParse(res);

      if (parseError) {
        throw new Error(`Server returned invalid response: ${parseError}`);
      }

      if (!res.ok) {
        const errData = data as { error?: string; details?: string };
        const errorMsg = typeof errData?.error === 'string' ? errData.error :
          (errData?.details ? String(errData.details) : "Failed to fetch status");
        throw new Error(errorMsg);
      }
      setStatus(data as IngestionStatus);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    }
  }

  async function createTables() {
    setCreatingTables(true);
    setError("");
    try {
      const res = await fetch("/api/admin/db-status", { method: "POST" });
      const { data, error: parseError } = await safeJsonParse(res);

      if (parseError) {
        throw new Error(`Server returned invalid response: ${parseError}`);
      }

      if (!res.ok) {
        const errData = data as { error?: string };
        throw new Error(errData?.error || "Failed to create tables");
      }
      // Refresh status
      await checkDbStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tables");
    } finally {
      setCreatingTables(false);
    }
  }

  async function ingestDate(date: string) {
    setIngesting(date);
    setError("");
    try {
      const res = await fetch("/api/admin/ingest-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const { data, error: parseError } = await safeJsonParse(res);

      if (parseError) {
        throw new Error(`Server returned invalid response: ${parseError}`);
      }

      if (!res.ok) {
        const errData = data as { error?: string; details?: string };
        const errorMsg = typeof errData?.error === 'string' ? errData.error :
          (errData?.details ? String(errData.details) : JSON.stringify(data));
        throw new Error(errorMsg);
      }
      setResults((prev) => [data as IngestionResult, ...prev]);
      await fetchStatus();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    } finally {
      setIngesting(null);
    }
  }

  async function ingestAll() {
    if (!status?.pendingDates.length) return;

    for (const date of status.pendingDates.sort()) {
      await ingestDate(date);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="bg-white rounded-lg shadow h-64" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Ingestion</h1>
            <p className="mt-1 text-sm text-gray-500">
              Import daily evaluation data into the history database
            </p>
          </div>
          <button
            onClick={checkDbStatus}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && <AlertBanner type="error" title="Error" message={error} />}

        {/* Database Status */}
        {dbStatus && (
          <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${
            dbStatus.status === "ready" ? "border-green-500" :
            dbStatus.status === "empty" ? "border-yellow-500" : "border-red-500"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className={`h-6 w-6 ${
                  dbStatus.status === "ready" ? "text-green-500" :
                  dbStatus.status === "empty" ? "text-yellow-500" : "text-red-500"
                }`} />
                <div>
                  <h3 className="font-medium text-gray-900">Database Status</h3>
                  <p className="text-sm text-gray-500">{dbStatus.message}</p>
                </div>
              </div>
              {dbStatus.status === "missing_tables" && (
                <button
                  onClick={createTables}
                  disabled={creatingTables}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {creatingTables ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Wrench className="h-4 w-4" />
                      Create Tables
                    </>
                  )}
                </button>
              )}
            </div>
            {/* Table Status Details */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
              {Object.entries(dbStatus.tables).map(([name, info]) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  {info.exists ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={info.exists ? "text-gray-700" : "text-red-600"}>
                    {name}
                    {info.exists && info.count !== undefined && (
                      <span className="text-gray-400 ml-1">({info.count})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Cards - only show if tables exist */}
        {dbStatus?.status !== "missing_tables" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-500">Available Evaluations</p>
                <p className="text-2xl font-bold">{status?.availableDates.length || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Check className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-500">Already Ingested</p>
                <p className="text-2xl font-bold">{status?.ingestedDates.length || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-500">Pending Import</p>
                <p className="text-2xl font-bold">{status?.pendingDates.length || 0}</p>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Pending Imports */}
        {status?.pendingDates && status.pendingDates.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Pending Imports</h3>
              <button
                onClick={ingestAll}
                disabled={!!ingesting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Import All ({status.pendingDates.length})
              </button>
            </div>
            <div className="divide-y divide-gray-200">
              {status.pendingDates.sort().reverse().map((date) => {
                const fileInfo = status.fileStatus?.find(f => f.date === date);
                return (
                  <div key={date} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-yellow-500" />
                      <div>
                        <span className="font-medium">{date}</span>
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <span className={fileInfo?.hasEvaluation ? "text-green-600" : "text-red-500"}>
                            {fileInfo?.hasEvaluation ? "✓" : "✗"} Evaluation
                          </span>
                          <span className={fileInfo?.hasSummary ? "text-green-600" : "text-yellow-600"}>
                            {fileInfo?.hasSummary ? "✓" : "○"} Summary
                          </span>
                          <span className={fileInfo?.hasPromoted ? "text-purple-600" : "text-gray-400"}>
                            {fileInfo?.hasPromoted ? "✓" : "○"} Promoted
                          </span>
                          <span className={fileInfo?.hasComparison ? "text-orange-600" : "text-gray-400"}>
                            {fileInfo?.hasComparison ? "✓" : "○"} Comparison
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => ingestDate(date)}
                      disabled={!!ingesting}
                      className="px-4 py-2 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 disabled:opacity-50 flex items-center gap-2"
                    >
                      {ingesting === date ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Import
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Already Ingested */}
        {status?.ingestedDates && status.ingestedDates.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Already Ingested</h3>
              <p className="text-sm text-gray-500 mt-1">Click on a date to re-import if needed</p>
            </div>
            <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
              {status.ingestedDates.map((date) => {
                const fileInfo = status.fileStatus?.find(f => f.date === date);
                return (
                  <div key={date} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-green-500" />
                      <span>{date}</span>
                    </div>
                    <button
                      onClick={() => ingestDate(date)}
                      disabled={!!ingesting}
                      className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                    >
                      {ingesting === date ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Re-importing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3" />
                          Re-import
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Files (not yet ingested, show import buttons) */}
        {status?.availableDates && status.availableDates.length > 0 && status.pendingDates.length === 0 && status.ingestedDates.length === 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Available Files</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {status.availableDates.map((date) => {
                const fileInfo = status.fileStatus?.find(f => f.date === date);
                return (
                  <div key={date} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Database className="h-5 w-5 text-blue-500" />
                      <div>
                        <span className="font-medium">{date}</span>
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <span className={fileInfo?.hasEvaluation ? "text-green-600" : "text-red-500"}>
                            {fileInfo?.hasEvaluation ? "✓" : "✗"} Evaluation
                          </span>
                          <span className={fileInfo?.hasSummary ? "text-green-600" : "text-yellow-600"}>
                            {fileInfo?.hasSummary ? "✓" : "○"} Summary
                          </span>
                          <span className={fileInfo?.hasPromoted ? "text-purple-600" : "text-gray-400"}>
                            {fileInfo?.hasPromoted ? "✓" : "○"} Promoted
                          </span>
                          <span className={fileInfo?.hasComparison ? "text-orange-600" : "text-gray-400"}>
                            {fileInfo?.hasComparison ? "✓" : "○"} Comparison
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => ingestDate(date)}
                      disabled={!!ingesting}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {ingesting === date ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Import
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Import Results</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {results.map((result, idx) => (
                <div key={idx} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{result.date}</span>
                    {result.success ? (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Success</span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Failed</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-gray-600">
                    <div>
                      <span className="text-gray-400">Processed:</span> {result.totalProcessed}
                    </div>
                    <div>
                      <span className="text-gray-400">Snapshots:</span> {result.snapshotsCreated}
                    </div>
                    <div>
                      <span className="text-gray-400">Stocks:</span> {result.stocksCreated} new
                    </div>
                    <div>
                      <span className="text-gray-400">Alerts:</span> {result.alertsCreated}
                    </div>
                    <div>
                      <span className="text-gray-400">Promoted:</span> {result.promotedStocksCreated || 0}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug Info */}
        {status?.debug && (
          <div className="bg-gray-50 rounded-lg shadow p-4 text-sm">
            <h4 className="font-medium text-gray-700 mb-2">Storage Debug Info</h4>
            <p className="text-gray-600">Total files in bucket: {status.debug.filesFound}</p>
            <p className="text-gray-600">Evaluation files: {status.debug.evaluationFiles}</p>
            <p className="text-gray-600">Summary files: {status.debug.summaryFiles}</p>
            <p className="text-gray-600">Promoted stocks files: {status.debug.promotedFiles}</p>
            <p className="text-gray-600">Comparison files: {status.debug.comparisonFiles}</p>
            {status.debug.allFileNames.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {status.debug.allFileNames.map((name, i) => (
                  <li key={i} className={`font-mono text-xs ${
                    name.startsWith('fmp-evaluation-') ? 'text-green-600' :
                    name.startsWith('fmp-summary-') ? 'text-blue-600' :
                    name.startsWith('promoted-stocks-') ? 'text-purple-600' :
                    name.startsWith('comparison-') ? 'text-orange-600' : 'text-gray-400'
                  }`}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-orange-600 mt-2">No files found. Either the bucket is empty or RLS policy is missing. Run: CREATE POLICY &quot;Allow public read access to evaluation-data&quot; ON storage.objects FOR SELECT USING (bucket_id = &apos;evaluation-data&apos;);</p>
            )}
          </div>
        )}

        {/* Empty State */}
        {status?.pendingDates.length === 0 && status?.ingestedDates.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Evaluation Data Found</h3>
            <p className="mt-2 text-gray-500">
              Upload evaluation files to Supabase Storage bucket &apos;evaluation-data&apos;.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
