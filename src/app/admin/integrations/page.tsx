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
  Bot,
  User,
  AlertTriangle,
  KeyRound,
  Database,
  Cloud,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

interface CredentialField {
  key: string;
  label: string;
  envVar: string;
  sensitive?: boolean;
}

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
  credentialFields: CredentialField[];
  hasDbCredentials: boolean;
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
  const [success, setSuccess] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [credentialsIntegration, setCredentialsIntegration] = useState<Integration | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

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

  function openCredentialsModal(integration: Integration) {
    setCredentialsIntegration(integration);
    setCredentialValues({});
    setShowPasswords({});
    setError("");
    setSuccess("");
  }

  async function saveCredentials() {
    if (!credentialsIntegration) return;

    // Filter out empty values
    const nonEmpty: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentialValues)) {
      if (value.trim()) nonEmpty[key] = value.trim();
    }

    if (Object.keys(nonEmpty).length === 0) {
      setError("Please enter at least one credential value");
      return;
    }

    setSavingCredentials(true);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: credentialsIntegration.name,
          credentials: nonEmpty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save credentials");

      setSuccess(`Credentials saved for ${credentialsIntegration.displayName}`);
      setCredentialsIntegration(null);
      setCredentialValues({});
      await fetchIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setSavingCredentials(false);
    }
  }

  async function clearCredentials(integration: Integration) {
    if (!confirm(`Clear all stored credentials for ${integration.displayName}? It will revert to environment variables.`)) {
      return;
    }
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: integration.name, clear: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear credentials");
      setSuccess(`Credentials cleared for ${integration.displayName}`);
      await fetchIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear credentials");
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
        {success && (
          <AlertBanner type="success" title="Success" message={success} onDismiss={() => setSuccess("")} />
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
              <h2 className="text-lg font-medium text-foreground">
                {category === "BROWSER_AGENT"
                  ? "Personal Account Credentials (Browser Agents)"
                  : category === "SOCIAL_SCAN"
                    ? "Social Media Scan APIs"
                    : `${category.charAt(0) + category.slice(1).toLowerCase()} Integrations`}
              </h2>
              {category === "BROWSER_AGENT" && (
                <p className="text-sm text-muted-foreground -mt-2">
                  Your personal social media accounts used by browser agents to scan platforms that don&apos;t have public APIs.
                </p>
              )}
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
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-medium text-foreground">
                              {integration.displayName}
                            </h3>
                            {integration.name === "DISCORD_BOT" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                <Bot className="h-3 w-3" />
                                Bot
                              </span>
                            )}
                            {integration.category === "BROWSER_AGENT" && integration.name !== "BROWSER_ENCRYPTION_KEY" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                <User className="h-3 w-3" />
                                Personal
                              </span>
                            )}
                          </div>
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

                    {/* Special notes for specific integrations */}
                    {integration.name === "DISCORD_BOT" && integration.apiKeyMasked !== "Not configured" && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>Bot is set up but not linked to any Discord servers yet. Invite the bot to target servers to start monitoring.</span>
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {integration.category === "BROWSER_AGENT" && integration.name !== "BROWSER_ENCRYPTION_KEY"
                            ? "Account"
                            : integration.name === "DISCORD_BOT"
                              ? "Bot Token"
                              : "API Key"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground">
                            {integration.apiKeyMasked?.startsWith("FREE")
                              ? "Free Public API"
                              : integration.apiKeyMasked || "Not configured"}
                          </span>
                          {/* Source indicator */}
                          {integration.apiKeyMasked && integration.apiKeyMasked !== "Not configured" && (
                            <span
                              title={integration.hasDbCredentials ? "Stored in database (set via dashboard)" : "From environment variable"}
                              className="inline-flex items-center"
                            >
                              {integration.hasDbCredentials ? (
                                <Database className="h-3.5 w-3.5 text-blue-500" />
                              ) : (
                                <Cloud className="h-3.5 w-3.5 text-gray-400" />
                              )}
                            </span>
                          )}
                        </div>
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
                        {integration.credentialFields.length > 0 && (
                          <button
                            onClick={() => openCredentialsModal(integration)}
                            className="inline-flex items-center px-3 py-1 text-sm text-amber-600 hover:text-amber-700"
                          >
                            <KeyRound className="h-4 w-4 mr-1" />
                            {integration.apiKeyMasked === "Not configured"
                              ? "Set Credentials"
                              : "Update Credentials"}
                          </button>
                        )}
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

        {/* Configure Modal (rate limits, budgets, enable/disable) */}
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
                    className="mt-1 block w-full border border-border rounded-md px-3 py-2 bg-card text-foreground"
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
                    className="mt-1 block w-full border border-border rounded-md px-3 py-2 bg-card text-foreground"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {editingIntegration.category === "REGULATORY"
                    ? "Note: Uses free public APIs by default. Set API key for paid tier access."
                    : "Use the \"Set Credentials\" button on the card to update API keys."}
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

        {/* Credentials Modal */}
        {credentialsIntegration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-foreground">
                  <KeyRound className="h-5 w-5 inline mr-2 text-amber-600" />
                  {credentialsIntegration.displayName} Credentials
                </h3>
                {credentialsIntegration.hasDbCredentials && (
                  <button
                    onClick={() => {
                      clearCredentials(credentialsIntegration);
                      setCredentialsIntegration(null);
                    }}
                    className="inline-flex items-center px-2 py-1 text-xs text-red-600 hover:text-red-700 border border-red-200 rounded hover:bg-red-50"
                    title="Clear stored credentials and revert to environment variables"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear Stored
                  </button>
                )}
              </div>

              {credentialsIntegration.hasDbCredentials && (
                <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 flex items-start gap-2">
                  <Database className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>This integration has credentials stored in the database. New values will overwrite them.</span>
                </div>
              )}

              <div className="space-y-4">
                {credentialsIntegration.credentialFields.map((field) => {
                  const isSensitive = field.sensitive !== false;
                  const isVisible = showPasswords[field.key];
                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        {field.label}
                      </label>
                      <div className="relative">
                        <input
                          type={isSensitive && !isVisible ? "password" : "text"}
                          value={credentialValues[field.key] || ""}
                          onChange={(e) =>
                            setCredentialValues({
                              ...credentialValues,
                              [field.key]: e.target.value,
                            })
                          }
                          className="block w-full border border-border rounded-md px-3 py-2 pr-10 bg-card text-foreground font-mono text-sm"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                          autoComplete="off"
                        />
                        {isSensitive && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowPasswords({
                                ...showPasswords,
                                [field.key]: !isVisible,
                              })
                            }
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                          >
                            {isVisible ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Env var: <code className="text-xs">{field.envVar}</code>
                      </p>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Credentials are encrypted with AES-256-GCM and stored in the database. They take
                priority over environment variables. Leave a field empty to keep its current value.
              </p>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setCredentialsIntegration(null);
                    setCredentialValues({});
                  }}
                  className="px-4 py-2 text-foreground border border-border rounded-md hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCredentials}
                  disabled={savingCredentials}
                  className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50 inline-flex items-center"
                >
                  {savingCredentials && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Credentials
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
