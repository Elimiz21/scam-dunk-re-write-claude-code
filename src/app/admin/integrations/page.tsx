"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Settings,
  Loader2,
} from "lucide-react";

interface Integration {
  id: string;
  name: string;
  displayName: string;
  category: string;
  isEnabled: boolean;
  apiKeyMasked: string | null;
  rateLimit: number | null;
  monthlyBudget: number | null;
  status: string;
  lastCheckedAt: string | null;
  errorMessage: string | null;
  description: string;
  documentation: string;
}

interface HealthSummary {
  total: number;
  connected: number;
  errors: number;
  unknown: number;
  disabled: number;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  async function fetchIntegrations() {
    try {
      const res = await fetch("/api/admin/integrations");
      if (!res.ok) throw new Error("Failed to fetch integrations");
      const data = await res.json();
      setIntegrations(data.integrations);
      setHealthSummary(data.healthSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }

  async function testIntegration(name: string) {
    setTesting(name);
    try {
      const res = await fetch("/api/admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to test integration");
      await fetchIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(null);
    }
  }

  async function testAllIntegrations() {
    setTesting("ALL");
    try {
      const res = await fetch("/api/admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ALL" }),
      });
      if (!res.ok) throw new Error("Failed to test integrations");
      await fetchIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(null);
    }
  }

  async function updateIntegration(updates: Partial<Integration>) {
    if (!editingIntegration) return;
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingIntegration.name, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update integration");
      setEditingIntegration(null);
      await fetchIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "CONNECTED":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "ERROR":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "CONNECTED":
        return "bg-green-100 text-green-800";
      case "ERROR":
        return "bg-red-100 text-red-800";
      default:
        return "bg-secondary text-foreground";
    }
  }

  const groupedIntegrations = integrations.reduce(
    (acc, integration) => {
      const category = integration.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(integration);
      return acc;
    },
    {} as Record<string, Integration[]>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage and monitor API integrations
            </p>
          </div>
          <button
            onClick={testAllIntegrations}
            disabled={testing !== null}
            className="inline-flex items-center px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {testing === "ALL" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Test All Connections
          </button>
        </div>

        {error && (
          <AlertBanner type="error" title="Error" message={error} onDismiss={() => setError("")} />
        )}

        {/* Health Summary */}
        {healthSummary && (
          <div className="bg-card rounded-2xl shadow p-6">
            <h2 className="text-lg font-medium text-foreground mb-4">Connection Health</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{healthSummary.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{healthSummary.connected}</p>
                <p className="text-sm text-muted-foreground">Connected</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{healthSummary.errors}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-muted-foreground">{healthSummary.unknown}</p>
                <p className="text-sm text-muted-foreground">Unknown</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-muted-foreground">{healthSummary.disabled}</p>
                <p className="text-sm text-muted-foreground">Disabled</p>
              </div>
            </div>
          </div>
        )}

        {/* Integrations by Category */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-2xl shadow h-40 animate-pulse" />
            ))}
          </div>
        ) : (
          Object.entries(groupedIntegrations).map(([category, items]) => (
            <div key={category} className="space-y-4">
              <h2 className="text-lg font-medium text-foreground capitalize">
                {category.toLowerCase()} Integrations
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((integration) => (
                  <div
                    key={integration.id}
                    className={`bg-card rounded-2xl shadow p-6 ${
                      !integration.isEnabled ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center">
                        {getStatusIcon(integration.status)}
                        <div className="ml-3">
                          <h3 className="text-lg font-medium text-foreground">
                            {integration.displayName}
                          </h3>
                          <p className="text-sm text-muted-foreground">{integration.description}</p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          integration.status
                        )}`}
                      >
                        {integration.status}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">API Key</span>
                        <span className="font-mono text-foreground">
                          {integration.apiKeyMasked || "Not configured"}
                        </span>
                      </div>
                      {integration.rateLimit && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Rate Limit</span>
                          <span className="text-foreground">{integration.rateLimit}/min</span>
                        </div>
                      )}
                      {integration.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                          {integration.errorMessage}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => testIntegration(integration.name)}
                          disabled={testing !== null}
                          className="inline-flex items-center px-3 py-1 text-sm text-primary hover:text-primary/80"
                        >
                          {testing === integration.name ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Test
                        </button>
                        <button
                          onClick={() => setEditingIntegration(integration)}
                          className="inline-flex items-center px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Configure
                        </button>
                      </div>
                      {integration.documentation && (
                        <a
                          href={integration.documentation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                        >
                          Docs
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Edit Modal */}
        {editingIntegration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-foreground mb-4">
                Configure {editingIntegration.displayName}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Enabled</span>
                  <button
                    onClick={() =>
                      updateIntegration({ isEnabled: !editingIntegration.isEnabled })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                      editingIntegration.isEnabled ? "gradient-brand" : "bg-secondary"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        editingIntegration.isEnabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Monthly Budget (USD)
                  </label>
                  <input
                    type="number"
                    defaultValue={editingIntegration.monthlyBudget || ""}
                    onChange={(e) =>
                      setEditingIntegration({
                        ...editingIntegration,
                        monthlyBudget: parseFloat(e.target.value) || null,
                      })
                    }
                    className="mt-1 block w-full border border-border rounded-md px-3 py-2"
                    placeholder="No limit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Rate Limit (requests/min)
                  </label>
                  <input
                    type="number"
                    defaultValue={editingIntegration.rateLimit || ""}
                    onChange={(e) =>
                      setEditingIntegration({
                        ...editingIntegration,
                        rateLimit: parseInt(e.target.value) || null,
                      })
                    }
                    className="mt-1 block w-full border border-border rounded-md px-3 py-2"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Note: To update API keys, modify the environment variables directly.
                </p>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setEditingIntegration(null)}
                  className="px-4 py-2 text-foreground border border-border rounded-md hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    updateIntegration({
                      monthlyBudget: editingIntegration.monthlyBudget,
                      rateLimit: editingIntegration.rateLimit,
                    })
                  }
                  className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
