"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatCard from "@/components/admin/StatCard";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Mail,
  Send,
  Settings,
  Users,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Star,
  ToggleLeft,
  ToggleRight,
  TestTube,
  Clock,
} from "lucide-react";

// ============ Types ============

interface EmailConfig {
  isValid: boolean;
  isTestMode: boolean;
  fromEmail: string;
  appUrl: string;
  warnings: string[];
  errors: string[];
}

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  isPrimary: boolean;
  categories: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

interface EmailLogEntry {
  id: string;
  recipientEmail: string;
  subject: string;
  emailType: string;
  status: string;
  fromEmail: string | null;
  resendId: string | null;
  errorMessage: string | null;
  relatedTicketId: string | null;
  createdAt: string;
}

interface LogStats {
  total: { sent: number; failed: number };
  last24h: { sent: number; failed: number };
  last7d: { sent: number; failed: number };
}

// ============ Constants ============

const CATEGORIES = [
  { id: "SUPPORT", label: "Technical Support" },
  { id: "FEEDBACK", label: "Feedback" },
  { id: "BUG_REPORT", label: "Bug Report" },
  { id: "FEATURE_REQUEST", label: "Feature Request" },
  { id: "BILLING", label: "Billing" },
  { id: "OTHER", label: "Other" },
];

const EMAIL_TYPE_LABELS: Record<string, string> = {
  TEST: "Test Email",
  CUSTOM: "Custom Email",
  TICKET_NOTIFICATION: "Ticket Notification",
  TICKET_CONFIRMATION: "Ticket Confirmation",
  TICKET_RESPONSE: "Ticket Response",
  VERIFICATION: "Email Verification",
  PASSWORD_RESET: "Password Reset",
  ADMIN_INVITE: "Admin Invite",
  API_ALERT: "API Alert",
};

const STATUS_STYLES: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  SKIPPED: "bg-yellow-100 text-yellow-800",
};

type TabId = "config" | "recipients" | "compose" | "logs";

// ============ Component ============

export default function EmailManagementPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("config");

  // Global state
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  // Config state
  const [config, setConfig] = useState<EmailConfig | null>(null);

  // Recipients state
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [editingRecipient, setEditingRecipient] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    email: string;
    name: string;
    isActive: boolean;
    isPrimary: boolean;
    categories: string[];
  }>({ email: "", name: "", isActive: true, isPrimary: false, categories: [] });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    email: "",
    name: "",
    isActive: true,
    isPrimary: false,
    categories: [] as string[],
  });
  const [recipientActionLoading, setRecipientActionLoading] = useState(false);

  // Compose state
  const [composeForm, setComposeForm] = useState({
    to: "",
    subject: "",
    message: "",
    replyTo: "",
  });
  const [composeSending, setComposeSending] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  // Log state
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const [logPagination, setLogPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [logTypeFilter, setLogTypeFilter] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  // ============ Data Loading ============

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email-management?section=overview");
      if (!res.ok) throw new Error("Failed to load email management data");
      const data = await res.json();
      setConfig(data.config);
      setRecipients(data.recipients || []);
      setLogStats(data.logStats);
      setLogs(data.recentLogs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecipients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email-management?section=recipients");
      if (!res.ok) throw new Error("Failed to load recipients");
      const data = await res.json();
      setRecipients(data.recipients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipients");
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        section: "logs",
        page: logPagination.page.toString(),
        limit: "25",
      });
      if (logTypeFilter) params.append("emailType", logTypeFilter);
      if (logStatusFilter) params.append("status", logStatusFilter);
      if (logSearch) params.append("search", logSearch);

      const res = await fetch(`/api/admin/email-management?${params}`);
      if (!res.ok) throw new Error("Failed to load email logs");
      const data = await res.json();
      setLogs(data.logs || []);
      setLogPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLogsLoading(false);
    }
  }, [logPagination.page, logTypeFilter, logStatusFilter, logSearch]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === "logs") {
      loadLogs();
    }
  }, [activeTab, loadLogs]);

  // ============ Recipient Actions ============

  async function addRecipient() {
    if (!addForm.email) {
      setError("Email is required");
      return;
    }
    setRecipientActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/support/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add recipient");
      setSuccess("Recipient added successfully");
      setShowAddForm(false);
      setAddForm({ email: "", name: "", isActive: true, isPrimary: false, categories: [] });
      await loadRecipients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recipient");
    } finally {
      setRecipientActionLoading(false);
    }
  }

  async function updateRecipient(id: string) {
    setRecipientActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/support/recipients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update recipient");
      setSuccess("Recipient updated successfully");
      setEditingRecipient(null);
      await loadRecipients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update recipient");
    } finally {
      setRecipientActionLoading(false);
    }
  }

  async function deleteRecipient(id: string) {
    if (!confirm("Are you sure you want to remove this email recipient?")) return;
    setRecipientActionLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/support/recipients?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete recipient");
      setSuccess("Recipient removed successfully");
      await loadRecipients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recipient");
    } finally {
      setRecipientActionLoading(false);
    }
  }

  async function toggleRecipientActive(recipient: Recipient) {
    setRecipientActionLoading(true);
    try {
      const res = await fetch("/api/admin/support/recipients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipient.id, isActive: !recipient.isActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle recipient");
      await loadRecipients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle recipient");
    } finally {
      setRecipientActionLoading(false);
    }
  }

  function startEditRecipient(r: Recipient) {
    setEditingRecipient(r.id);
    let cats: string[] = [];
    if (r.categories) {
      try {
        cats = JSON.parse(r.categories);
      } catch {
        cats = [];
      }
    }
    setEditForm({
      email: r.email,
      name: r.name || "",
      isActive: r.isActive,
      isPrimary: r.isPrimary,
      categories: cats,
    });
  }

  // ============ Email Actions ============

  async function handleSendTestEmail() {
    if (!testEmail) {
      setError("Please enter an email address");
      return;
    }
    setTestSending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/email-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", to: testEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Test email sent to ${testEmail}${data.resendId ? ` (ID: ${data.resendId})` : ""}`);
      } else {
        setError(data.message || "Failed to send test email");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setTestSending(false);
    }
  }

  async function handleComposeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!composeForm.to || !composeForm.subject || !composeForm.message) {
      setError("To, Subject, and Message are required");
      return;
    }
    setComposeSending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/email-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "compose",
          to: composeForm.to,
          subject: composeForm.subject,
          message: composeForm.message,
          replyTo: composeForm.replyTo || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Email sent to ${composeForm.to}`);
        setComposeForm({ to: "", subject: "", message: "", replyTo: "" });
      } else {
        setError(data.message || "Failed to send email");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setComposeSending(false);
    }
  }

  // ============ Helpers ============

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
  }

  function formatRelativeDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function parseCategories(cats: string | null): string[] {
    if (!cats) return [];
    try {
      return JSON.parse(cats);
    } catch {
      return [];
    }
  }

  function toggleCategory(categories: string[], cat: string): string[] {
    return categories.includes(cat)
      ? categories.filter((c) => c !== cat)
      : [...categories, cat];
  }

  // ============ Tabs ============

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "config", label: "Configuration", icon: <Settings className="h-4 w-4" /> },
    { id: "recipients", label: "Email Recipients", icon: <Users className="h-4 w-4" /> },
    { id: "compose", label: "Compose Email", icon: <Send className="h-4 w-4" /> },
    { id: "logs", label: "Email Logs", icon: <FileText className="h-4 w-4" /> },
  ];

  // ============ Render ============

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Email Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Configure email routing, manage recipients, send emails, and monitor delivery
            </p>
          </div>
          <button
            onClick={loadOverview}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Alerts */}
        {error && <AlertBanner type="error" title="Error" message={error} onDismiss={() => setError("")} />}
        {success && <AlertBanner type="success" title="Success" message={success} onDismiss={() => setSuccess("")} />}

        {/* Quick Stats */}
        {logStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard
              title="Emails Sent (24h)"
              value={logStats.last24h.sent}
              icon={Send}
              color="green"
            />
            <StatCard
              title="Failed (24h)"
              value={logStats.last24h.failed}
              icon={XCircle}
              color="red"
            />
            <StatCard
              title="Sent (7 days)"
              value={logStats.last7d.sent}
              icon={Mail}
              color="blue"
            />
            <StatCard
              title="Active Recipients"
              value={recipients.filter((r) => r.isActive).length}
              icon={Users}
              color="purple"
            />
          </div>
        )}

        {/* Config Warnings */}
        {config?.isTestMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-900">Test Mode Active</h3>
                <p className="text-sm text-amber-800 mt-1">
                  Resend is using the test domain (<code className="bg-amber-100 px-1 rounded">onboarding@resend.dev</code>).
                  Emails can only be sent to the Resend account owner&apos;s email.
                  To send to all users, verify a custom domain at{" "}
                  <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    resend.com/domains
                  </a>{" "}
                  and set the <code className="bg-amber-100 px-1 rounded">EMAIL_FROM</code> environment variable.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg border shadow-sm">
          {/* ==================== Config Tab ==================== */}
          {activeTab === "config" && (
            <div className="p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Email Configuration</h2>

              {/* Status */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${config?.isValid ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="font-medium">
                      {config?.isValid ? "Email service configured" : "Email service has errors"}
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">From Address:</span>
                      <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{config?.fromEmail}</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">App URL:</span>
                      <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{config?.appUrl}</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Mode:</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        config?.isTestMode ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                      }`}>
                        {config?.isTestMode ? "Test Mode" : "Production"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Test Email */}
                <div className="bg-indigo-50 rounded-lg p-4">
                  <h3 className="font-medium text-indigo-900 mb-3 flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Send Test Email
                  </h3>
                  <p className="text-sm text-indigo-700 mb-3">
                    Verify your email configuration by sending a test email.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="flex-1 px-3 py-2 border border-indigo-200 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      onClick={handleSendTestEmail}
                      disabled={testSending || !testEmail}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {testSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send Test
                    </button>
                  </div>
                </div>
              </div>

              {/* Warnings & Errors */}
              {config?.warnings && config.warnings.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">Warnings</h3>
                  {config.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {config?.errors && config.errors.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">Errors</h3>
                  {config.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 p-3 rounded">
                      <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      {e}
                    </div>
                  ))}
                </div>
              )}

              {/* Routing Explanation */}
              <div className="border-t pt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">How Email Routing Works</h3>
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-2">
                  <p>When a support ticket is submitted via the Contact Us form:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li><strong>Primary recipients</strong> always receive notifications for all ticket categories</li>
                    <li><strong>Category-specific recipients</strong> only receive notifications for their assigned categories</li>
                    <li><strong>Recipients with no categories set</strong> receive all ticket notifications</li>
                    <li>If no recipients are configured, emails fall back to the default admin email</li>
                    <li>The user who submitted the ticket receives a confirmation email</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* ==================== Recipients Tab ==================== */}
          {activeTab === "recipients" && (
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Email Recipients</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Manage who receives support ticket notifications and which categories they handle
                  </p>
                </div>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Recipient
                </button>
              </div>

              {/* Add Form */}
              {showAddForm && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium text-indigo-900">Add New Recipient</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        value={addForm.email}
                        onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        placeholder="admin@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
                      <input
                        type="text"
                        value={addForm.name}
                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addForm.isPrimary}
                        onChange={(e) => setAddForm({ ...addForm, isPrimary: e.target.checked })}
                        className="rounded border-gray-300 text-indigo-600"
                      />
                      Primary recipient (receives all categories)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addForm.isActive}
                        onChange={(e) => setAddForm({ ...addForm, isActive: e.target.checked })}
                        className="rounded border-gray-300 text-indigo-600"
                      />
                      Active
                    </label>
                  </div>
                  {!addForm.isPrimary && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Category Routing (leave empty for all)</label>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() =>
                              setAddForm({
                                ...addForm,
                                categories: toggleCategory(addForm.categories, cat.id),
                              })
                            }
                            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                              addForm.categories.includes(cat.id)
                                ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                                : "bg-white border-gray-300 text-gray-600 hover:border-indigo-300"
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={addRecipient}
                      disabled={recipientActionLoading || !addForm.email}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {recipientActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setAddForm({ email: "", name: "", isActive: true, isPrimary: false, categories: [] });
                      }}
                      className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Recipients List */}
              {recipients.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="font-medium">No email recipients configured</p>
                  <p className="text-sm mt-1">Add recipients to start routing support ticket notifications</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recipients.map((r) => (
                    <div
                      key={r.id}
                      className={`border rounded-lg p-4 transition-colors ${
                        r.isActive ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-60"
                      }`}
                    >
                      {editingRecipient === r.id ? (
                        /* Edit Mode */
                        <div className="space-y-4">
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                              <input
                                type="email"
                                value={editForm.email}
                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                              <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editForm.isPrimary}
                                onChange={(e) => setEditForm({ ...editForm, isPrimary: e.target.checked })}
                                className="rounded border-gray-300 text-indigo-600"
                              />
                              Primary
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editForm.isActive}
                                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                                className="rounded border-gray-300 text-indigo-600"
                              />
                              Active
                            </label>
                          </div>
                          {!editForm.isPrimary && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Categories</label>
                              <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map((cat) => (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() =>
                                      setEditForm({
                                        ...editForm,
                                        categories: toggleCategory(editForm.categories, cat.id),
                                      })
                                    }
                                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                      editForm.categories.includes(cat.id)
                                        ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                                        : "bg-white border-gray-300 text-gray-600 hover:border-indigo-300"
                                    }`}
                                  >
                                    {cat.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateRecipient(r.id)}
                              disabled={recipientActionLoading}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                              {recipientActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRecipient(null)}
                              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View Mode */
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{r.email}</span>
                                {r.isPrimary && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    <Star className="h-3 w-3" />
                                    Primary
                                  </span>
                                )}
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  r.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                                }`}>
                                  {r.isActive ? "Active" : "Inactive"}
                                </span>
                              </div>
                              {r.name && <p className="text-sm text-gray-500">{r.name}</p>}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {parseCategories(r.categories).length > 0 ? (
                                  parseCategories(r.categories).map((cat) => {
                                    const label = CATEGORIES.find((c) => c.id === cat)?.label || cat;
                                    return (
                                      <span
                                        key={cat}
                                        className="inline-block px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700"
                                      >
                                        {label}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-xs text-gray-400">All categories</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleRecipientActive(r)}
                              disabled={recipientActionLoading}
                              className="p-2 text-gray-400 hover:text-gray-600 rounded"
                              title={r.isActive ? "Deactivate" : "Activate"}
                            >
                              {r.isActive ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5" />}
                            </button>
                            <button
                              onClick={() => startEditRecipient(r)}
                              className="p-2 text-gray-400 hover:text-indigo-600 rounded"
                              title="Edit"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteRecipient(r.id)}
                              disabled={recipientActionLoading}
                              className="p-2 text-gray-400 hover:text-red-600 rounded"
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== Compose Tab ==================== */}
          {activeTab === "compose" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Compose Email</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Send an email directly from the admin dashboard using your configured email service
                </p>
              </div>

              <form onSubmit={handleComposeSubmit} className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
                  <input
                    type="email"
                    value={composeForm.to}
                    onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="recipient@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                  <input
                    type="text"
                    value={composeForm.subject}
                    onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Email subject"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To (optional)</label>
                  <input
                    type="email"
                    value={composeForm.replyTo}
                    onChange={(e) => setComposeForm({ ...composeForm, replyTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="reply-to@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                  <textarea
                    value={composeForm.message}
                    onChange={(e) => setComposeForm({ ...composeForm, message: e.target.value })}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Your email message..."
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    The message will be wrapped in a branded ScamDunk email template.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={composeSending || !composeForm.to || !composeForm.subject || !composeForm.message}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {composeSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send Email
                </button>
              </form>
            </div>
          )}

          {/* ==================== Logs Tab ==================== */}
          {activeTab === "logs" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Email Delivery Log</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Track all emails sent from the system and monitor delivery status
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => {
                      setLogSearch(e.target.value);
                      setLogPagination((p) => ({ ...p, page: 1 }));
                    }}
                    placeholder="Search by email or subject..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <select
                  value={logTypeFilter}
                  onChange={(e) => {
                    setLogTypeFilter(e.target.value);
                    setLogPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">All Types</option>
                  {Object.entries(EMAIL_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <select
                  value={logStatusFilter}
                  onChange={(e) => {
                    setLogStatusFilter(e.target.value);
                    setLogPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">All Status</option>
                  <option value="SENT">Sent</option>
                  <option value="FAILED">Failed</option>
                  <option value="SKIPPED">Skipped</option>
                </select>
              </div>

              {/* Logs Table */}
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="font-medium">No email logs found</p>
                  <p className="text-sm mt-1">Email delivery logs will appear here once emails are sent</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {logs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[log.status] || "bg-gray-100 text-gray-800"}`}>
                                {log.status === "SENT" && <CheckCircle className="h-3 w-3" />}
                                {log.status === "FAILED" && <XCircle className="h-3 w-3" />}
                                {log.status === "SKIPPED" && <Clock className="h-3 w-3" />}
                                {log.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm text-gray-600">
                                {EMAIL_TYPE_LABELS[log.emailType] || log.emailType}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm text-gray-900">{log.recipientEmail}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600 truncate block max-w-xs">
                                {log.subject}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm text-gray-500" title={formatDate(log.createdAt)}>
                                {formatRelativeDate(log.createdAt)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {log.errorMessage ? (
                                <span className="text-xs text-red-600 truncate block max-w-xs" title={log.errorMessage}>
                                  {log.errorMessage.substring(0, 50)}...
                                </span>
                              ) : log.resendId ? (
                                <span className="text-xs text-gray-400 font-mono" title={log.resendId}>
                                  {log.resendId.substring(0, 12)}...
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {logPagination.pages > 1 && (
                    <div className="flex items-center justify-between border-t pt-4">
                      <p className="text-sm text-gray-500">
                        Showing {(logPagination.page - 1) * 25 + 1} to{" "}
                        {Math.min(logPagination.page * 25, logPagination.total)} of {logPagination.total}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLogPagination((p) => ({ ...p, page: p.page - 1 }))}
                          disabled={logPagination.page <= 1}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </button>
                        <button
                          onClick={() => setLogPagination((p) => ({ ...p, page: p.page + 1 }))}
                          disabled={logPagination.page >= logPagination.pages}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
