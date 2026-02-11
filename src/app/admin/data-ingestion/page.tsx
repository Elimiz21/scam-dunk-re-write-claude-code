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
  lastIngestion?: {
    createdAt: string;
    details: string | null;
  } | null;
  debug?: {
    filesFound: number;
    evaluationFiles: number;
    enhancedEvaluationFiles: number;
    legacyEvaluationFiles: number;
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

interface BackfillResult {
  success: boolean;
  totalScanHistory: number;
  modelMetricsDays: number;
  scanUsageEntries: number;
  lastUpdated: string;
}

export default function DataIngestionPage() {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [creatingTables, setCreatingTables] = useState(false);
  const [results, setResults] = useState<IngestionResult[]>([]);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfilling, setBackfilling] = useState(false);
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

  async function runBackfill() {
    setBackfilling(true);
    setError("");
    try {
      const res = await fetch("/api/admin/backfill", { method: "POST" });
      const { data, error: parseError } = await safeJsonParse(res);

      if (parseError) {
        throw new Error(`Server returned invalid response: ${parseError}`);
      }

      if (!res.ok) {
        const errData = data as { error?: string; details?: string };
        const errorMsg = typeof errData?.error === "string"
          ? errData.error
          : (errData?.details ? String(errData.details) : "Failed to backfill metrics");
        throw new Error(errorMsg);
      }

      setBackfillResult(data as BackfillResult);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to backfill metrics");
    } finally {
      setBackfilling(false);
    }
  }

  const lastIngestionDetails = (() => {
    if (!status?.lastIngestion?.details) return null;
    try {
      return JSON.parse(status.lastIngestion.details) as {
        status?: string;
        date?: string;
        errorType?: string;
        error?: string;
        durationMs?: number;
      };
    } catch {
      return null;
    }
  })();

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="bg-card rounded-2xl shadow h-64" />
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
            <h1 className="text-2xl font-bold text-foreground">Data Ingestion</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Import daily evaluation data into the history database
            </p>
          </div>
          <button
            onClick={checkDbStatus}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && <AlertBanner type="error" title="Error" message={error} />}

        {/* Database Status */}
        {dbStatus && (
          <div className={`bg-card rounded-2xl shadow p-6 border-l-4 ${
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
                  <h3 className="font-medium text-foreground">Database Status</h3>
                  <p className="text-sm text-muted-foreground">{dbStatus.message}</p>
                </div>
              </div>
              {dbStatus.status === "missing_tables" && (
                <button
                  onClick={createTables}
                  disabled={creatingTables}
                  className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
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
                  <span className={info.exists ? "text-foreground" : "text-red-600"}>
                    {name}
                    {info.exists && info.count !== undefined && (
                      <span className="text-muted-foreground ml-1">({info.count})</span>
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
          <div className="bg-card rounded-2xl shadow p-6">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm text-muted-foreground">Available Evaluations</p>
                <p className="text-2xl font-bold">{status?.availableDates.length || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow p-6">
            <div className="flex items-center">
              <Check className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm text-muted-foreground">Already Ingested</p>
                <p className="text-2xl font-bold">{status?.ingestedDates.length || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm text-muted-foreground">Pending Import</p>
                <p className="text-2xl font-bold">{status?.pendingDates.length || 0}</p>
              </div>
            </div>
          </div>
        </div>
        )}

        {(status?.lastIngestion || backfillResult) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {status?.lastIngestion && (
              <div className="bg-card rounded-2xl shadow p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-foreground">Last Ingestion Status</h3>
                  <span className="text-xs text-muted-foreground">
                    {new Date(status.lastIngestion.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 text-sm text-foreground space-y-1">
                  <div>
                    Status:{" "}
                    <span className={`font-medium ${
                      lastIngestionDetails?.status === "SUCCESS" ? "text-green-600" : "text-red-600"
                    }`}>
                      {lastIngestionDetails?.status || "Unknown"}
                    </span>
                  </div>
                  {lastIngestionDetails?.date && (
                    <div>Date: <span className="font-medium">{lastIngestionDetails.date}</span></div>
                  )}
                  {lastIngestionDetails?.error && (
                    <div className="text-red-600">
                      Error: {lastIngestionDetails.errorType ? `${lastIngestionDetails.errorType} - ` : ""}{lastIngestionDetails.error}
                    </div>
                  )}
                  {lastIngestionDetails?.durationMs !== undefined && (
                    <div>Duration: {Math.round(lastIngestionDetails.durationMs)}ms</div>
                  )}
                </div>
              </div>
            )}
            {backfillResult && (
              <div className="bg-card rounded-2xl shadow p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-foreground">Last Backfill</h3>
                  <span className="text-xs text-muted-foreground">
                    {new Date(backfillResult.lastUpdated).toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 text-sm text-foreground space-y-1">
                  <div>Total Scan History: <span className="font-medium">{backfillResult.totalScanHistory}</span></div>
                  <div>Model Metrics Days: <span className="font-medium">{backfillResult.modelMetricsDays}</span></div>
                  <div>Scan Usage Entries: <span className="font-medium">{backfillResult.scanUsageEntries}</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-card rounded-2xl shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-foreground">Backfill Metrics</h3>
              <p className="text-sm text-muted-foreground">
                Rebuild ModelMetrics and ScanUsage from ScanHistory for live data consistency.
              </p>
            </div>
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {backfilling ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Backfilling...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run Backfill
                </>
              )}
            </button>
          </div>
        </div>

        {/* Pending Imports */}
        {status?.pendingDates && status.pendingDates.length > 0 && (
          <div className="bg-card rounded-2xl shadow">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h3 className="text-lg font-medium text-foreground">Pending Imports</h3>
              <button
                onClick={ingestAll}
                disabled={!!ingesting}
                className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Import All ({status.pendingDates.length})
              </button>
            </div>
            <div className="divide-y divide-border">
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
                          <span className={fileInfo?.hasPromoted ? "text-purple-600" : "text-muted-foreground"}>
                            {fileInfo?.hasPromoted ? "✓" : "○"} Promoted
                          </span>
                          <span className={fileInfo?.hasComparison ? "text-orange-600" : "text-muted-foreground"}>
                            {fileInfo?.hasComparison ? "✓" : "○"} Comparison
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => ingestDate(date)}
                      disabled={!!ingesting}
                      className="px-4 py-2 text-sm bg-primary/10 text-primary rounded-xl hover:bg-primary/15 disabled:opacity-50 flex items-center gap-2"
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
          <div className="bg-card rounded-2xl shadow">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Already Ingested</h3>
              <p className="text-sm text-muted-foreground mt-1">Click on a date to re-import if needed</p>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
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
                      className="px-3 py-1 text-xs bg-secondary text-muted-foreground rounded hover:bg-secondary disabled:opacity-50 flex items-center gap-1"
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
          <div className="bg-card rounded-2xl shadow">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Available Files</h3>
            </div>
            <div className="divide-y divide-border">
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
                          <span className={fileInfo?.hasPromoted ? "text-purple-600" : "text-muted-foreground"}>
                            {fileInfo?.hasPromoted ? "✓" : "○"} Promoted
                          </span>
                          <span className={fileInfo?.hasComparison ? "text-orange-600" : "text-muted-foreground"}>
                            {fileInfo?.hasComparison ? "✓" : "○"} Comparison
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => ingestDate(date)}
                      disabled={!!ingesting}
                      className="px-4 py-2 text-sm gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
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
          <div className="bg-card rounded-2xl shadow">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Import Results</h3>
            </div>
            <div className="divide-y divide-border">
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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-muted-foreground">
                    <div>
                      <span className="text-muted-foreground">Processed:</span> {result.totalProcessed}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Snapshots:</span> {result.snapshotsCreated}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Stocks:</span> {result.stocksCreated} new
                    </div>
                    <div>
                      <span className="text-muted-foreground">Alerts:</span> {result.alertsCreated}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Promoted:</span> {result.promotedStocksCreated || 0}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug Info */}
        {status?.debug && (
          <div className="bg-secondary/50 rounded-2xl shadow p-4 text-sm">
            <h4 className="font-medium text-foreground mb-2">Storage Debug Info</h4>
            <p className="text-muted-foreground">Total files in bucket: {status.debug.filesFound}</p>
            <p className="text-muted-foreground">Evaluation files: {status.debug.evaluationFiles} (enhanced: {status.debug.enhancedEvaluationFiles}, legacy: {status.debug.legacyEvaluationFiles})</p>
            <p className="text-muted-foreground">Summary files: {status.debug.summaryFiles}</p>
            <p className="text-muted-foreground">Promoted stocks files: {status.debug.promotedFiles}</p>
            <p className="text-muted-foreground">Comparison files: {status.debug.comparisonFiles}</p>
            {status.debug.allFileNames.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {status.debug.allFileNames.map((name, i) => (
                  <li key={i} className={`font-mono text-xs ${
                    name.startsWith('enhanced-evaluation-') ? 'text-green-600' :
                    name.startsWith('fmp-evaluation-') ? 'text-green-600' :
                    name.startsWith('fmp-summary-') ? 'text-blue-600' :
                    name.startsWith('promoted-stocks-') ? 'text-purple-600' :
                    name.startsWith('comparison-') ? 'text-orange-600' :
                    name.startsWith('enhanced-high-risk-') ? 'text-red-600' :
                    name.startsWith('suspicious-stocks-') ? 'text-red-600' :
                    name.startsWith('daily-report-') ? 'text-blue-600' :
                    name.startsWith('social-media-scan-') ? 'text-cyan-600' : 'text-muted-foreground'
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
          <div className="bg-card rounded-2xl shadow p-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No Evaluation Data Found</h3>
            <p className="mt-2 text-muted-foreground">
              Upload evaluation files to Supabase Storage bucket &apos;evaluation-data&apos;.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
