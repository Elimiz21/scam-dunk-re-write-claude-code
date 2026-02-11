"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatCard from "@/components/admin/StatCard";
import DataTable from "@/components/admin/DataTable";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Headphones,
  MessageSquare,
  CheckCircle,
  Clock,
  AlertTriangle,
  Search,
  MoreVertical,
  X,
  Loader2,
  Eye,
  Send,
  Mail,
  Bug,
  Lightbulb,
  CreditCard,
  HelpCircle,
  ArrowUp,
  ArrowDown,
  Filter,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface Ticket {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
}

interface TicketDetails {
  ticket: {
    id: string;
    name: string;
    email: string;
    userId: string | null;
    subject: string;
    message: string;
    category: string;
    status: string;
    priority: string;
    assignedTo: string | null;
    internalNotes: string | null;
    createdAt: string;
    updatedAt: string;
    lastActivityAt: string;
    resolvedAt: string | null;
    closedAt: string | null;
    ipAddress: string | null;
    assignedAdmin: {
      id: string;
      name: string | null;
      email: string;
    } | null;
    responses: {
      id: string;
      message: string;
      isFromAdmin: boolean;
      responderName: string | null;
      responderEmail: string | null;
      emailSent: boolean;
      createdAt: string;
    }[];
  };
}

interface Stats {
  total: number;
  new: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  ticketsLast7Days: number;
  urgentTickets: number;
  byCategory: {
    support: number;
    feedback: number;
    bugReport: number;
    featureRequest: number;
  };
}

const categoryLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  SUPPORT: { label: "Technical Support", icon: <HelpCircle className="h-4 w-4" />, color: "text-blue-600" },
  FEEDBACK: { label: "Feedback", icon: <Lightbulb className="h-4 w-4" />, color: "text-yellow-600" },
  BUG_REPORT: { label: "Bug Report", icon: <Bug className="h-4 w-4" />, color: "text-red-600" },
  FEATURE_REQUEST: { label: "Feature Request", icon: <MessageSquare className="h-4 w-4" />, color: "text-purple-600" },
  BILLING: { label: "Billing", icon: <CreditCard className="h-4 w-4" />, color: "text-green-600" },
  OTHER: { label: "Other", icon: <Mail className="h-4 w-4" />, color: "text-muted-foreground" },
};

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-purple-100 text-purple-800",
  WAITING_ON_USER: "bg-orange-100 text-orange-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-secondary text-foreground",
};

const priorityColors: Record<string, string> = {
  LOW: "bg-secondary text-foreground",
  NORMAL: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800",
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetails | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, [pagination.page, statusFilter, categoryFilter, priorityFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (pagination.page === 1) {
        fetchTickets();
      } else {
        setPagination((p) => ({ ...p, page: 1 }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function fetchTickets() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: "15",
      });
      if (search) params.append("search", search);
      if (statusFilter) params.append("status", statusFilter);
      if (categoryFilter) params.append("category", categoryFilter);
      if (priorityFilter) params.append("priority", priorityFilter);

      const res = await fetch(`/api/admin/support?${params}`);
      if (!res.ok) throw new Error("Failed to fetch tickets");
      const data = await res.json();
      setTickets(data.tickets);
      setPagination(data.pagination);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTicketDetails(ticketId: string) {
    setLoadingTicket(true);
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`);
      if (!res.ok) throw new Error("Failed to fetch ticket details");
      const data = await res.json();
      setSelectedTicket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket details");
    } finally {
      setLoadingTicket(false);
    }
  }

  async function performAction(ticketId: string, action: string, value?: string) {
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setSuccess(data.message);
      setMenuOpen(null);
      fetchTickets();
      if (selectedTicket?.ticket.id === ticketId) {
        fetchTicketDetails(ticketId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function sendResponse(ticketId: string) {
    if (!responseText.trim() || responseText.trim().length < 10) {
      setError("Response must be at least 10 characters");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: responseText.trim(), sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send response");
      setSuccess(data.message);
      setResponseText("");
      fetchTicketDetails(ticketId);
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send response");
    } finally {
      setActionLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || "bg-secondary text-foreground"}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  }

  function getPriorityBadge(priority: string) {
    const Icon = priority === "URGENT" ? AlertTriangle : priority === "HIGH" ? ArrowUp : priority === "LOW" ? ArrowDown : null;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[priority] || "bg-secondary text-foreground"}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {priority}
      </span>
    );
  }

  function getCategoryBadge(category: string) {
    const cat = categoryLabels[category] || { label: category, icon: <Mail className="h-4 w-4" />, color: "text-muted-foreground" };
    return (
      <span className={`inline-flex items-center gap-1 text-sm ${cat.color}`}>
        {cat.icon}
        {cat.label}
      </span>
    );
  }

  function formatDate(dateString: string) {
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

  const ticketColumns = [
    {
      key: "subject",
      header: "Ticket",
      render: (item: Ticket) => (
        <div className="max-w-xs">
          <p className="font-medium text-foreground truncate">{item.subject}</p>
          <p className="text-sm text-muted-foreground truncate">{item.name} &lt;{item.email}&gt;</p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (item: Ticket) => getCategoryBadge(item.category),
    },
    {
      key: "status",
      header: "Status",
      render: (item: Ticket) => getStatusBadge(item.status),
    },
    {
      key: "priority",
      header: "Priority",
      render: (item: Ticket) => getPriorityBadge(item.priority),
    },
    {
      key: "responseCount",
      header: "Replies",
      render: (item: Ticket) => (
        <span className="text-muted-foreground">{item.responseCount}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (item: Ticket) => (
        <span className="text-muted-foreground text-sm">{formatDate(item.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: Ticket) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchTicketDetails(item.id)}
            className="p-1 text-muted-foreground hover:text-primary rounded"
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
              className="p-1 text-muted-foreground hover:text-muted-foreground rounded"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen === item.id && (
              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-card ring-1 ring-black ring-opacity-5 z-10">
                <div className="py-1">
                  <div className="px-4 py-2 text-xs text-muted-foreground uppercase">Status</div>
                  {["NEW", "OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"].map((status) => (
                    <button
                      key={status}
                      onClick={() => performAction(item.id, "updateStatus", status)}
                      disabled={actionLoading || item.status === status}
                      className={`flex items-center w-full px-4 py-2 text-sm hover:bg-secondary ${
                        item.status === status ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {status.replace(/_/g, " ")}
                      {item.status === status && <CheckCircle className="h-3 w-3 ml-auto text-green-500" />}
                    </button>
                  ))}
                  <hr className="my-1" />
                  <div className="px-4 py-2 text-xs text-muted-foreground uppercase">Priority</div>
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => (
                    <button
                      key={priority}
                      onClick={() => performAction(item.id, "updatePriority", priority)}
                      disabled={actionLoading || item.priority === priority}
                      className={`flex items-center w-full px-4 py-2 text-sm hover:bg-secondary ${
                        item.priority === priority ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {priority}
                      {item.priority === priority && <CheckCircle className="h-3 w-3 ml-auto text-green-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customer Support</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage support tickets and user feedback
            </p>
          </div>
          <button
            onClick={() => fetchTickets()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground bg-card border border-border rounded-md hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && (
          <AlertBanner type="error" title="Error" message={error} onDismiss={() => setError("")} />
        )}
        {success && (
          <AlertBanner type="success" title="Success" message={success} onDismiss={() => setSuccess("")} />
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard title="Total Tickets" value={stats.total} icon={Headphones} color="blue" />
            <StatCard
              title="New / Open"
              value={stats.new + stats.open}
              icon={Clock}
              color="yellow"
            />
            <StatCard
              title="Resolved"
              value={stats.resolved}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              title="Urgent"
              value={stats.urgentTickets}
              icon={AlertTriangle}
              color="red"
            />
          </div>
        )}

        {/* Category Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <HelpCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Support</span>
              </div>
              <p className="text-2xl font-bold">{stats.byCategory.support}</p>
            </div>
            <div className="bg-card rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-yellow-600 mb-1">
                <Lightbulb className="h-4 w-4" />
                <span className="text-sm font-medium">Feedback</span>
              </div>
              <p className="text-2xl font-bold">{stats.byCategory.feedback}</p>
            </div>
            <div className="bg-card rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <Bug className="h-4 w-4" />
                <span className="text-sm font-medium">Bug Reports</span>
              </div>
              <p className="text-2xl font-bold">{stats.byCategory.bugReport}</p>
            </div>
            <div className="bg-card rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm font-medium">Feature Requests</span>
              </div>
              <p className="text-2xl font-bold">{stats.byCategory.featureRequest}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by email, name, subject, or ticket ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-card text-foreground placeholder:text-muted-foreground focus:ring-primary focus:border-primary/50"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground"
            >
              <option value="">All Status</option>
              <option value="NEW">New</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING_ON_USER">Waiting on User</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground"
            >
              <option value="">All Categories</option>
              <option value="SUPPORT">Technical Support</option>
              <option value="FEEDBACK">Feedback</option>
              <option value="BUG_REPORT">Bug Report</option>
              <option value="FEATURE_REQUEST">Feature Request</option>
              <option value="BILLING">Billing</option>
              <option value="OTHER">Other</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground"
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        {/* Tickets Table */}
        <DataTable
          columns={ticketColumns}
          data={tickets}
          loading={loading}
          pagination={{
            ...pagination,
            onPageChange: (page) => setPagination((p) => ({ ...p, page })),
          }}
          emptyMessage="No support tickets found"
        />

        {/* Ticket Details Modal */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium text-foreground">Ticket Details</h3>
                  <p className="text-sm text-muted-foreground font-mono">{selectedTicket.ticket.id}</p>
                </div>
                <button onClick={() => setSelectedTicket(null)} className="text-muted-foreground hover:text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingTicket ? (
                <div className="p-6 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-6">
                    {/* Ticket Info */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Subject</p>
                          <p className="font-medium text-lg">{selectedTicket.ticket.subject}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">From</p>
                            <p className="font-medium">{selectedTicket.ticket.name}</p>
                            <p className="text-sm text-muted-foreground">{selectedTicket.ticket.email}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Created</p>
                            <p className="font-medium">{new Date(selectedTicket.ticket.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          {getCategoryBadge(selectedTicket.ticket.category)}
                          {getStatusBadge(selectedTicket.ticket.status)}
                          {getPriorityBadge(selectedTicket.ticket.priority)}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Quick Actions</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedTicket.ticket.status !== "RESOLVED" && (
                              <button
                                onClick={() => performAction(selectedTicket.ticket.id, "updateStatus", "RESOLVED")}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Mark Resolved
                              </button>
                            )}
                            {selectedTicket.ticket.status === "NEW" && (
                              <button
                                onClick={() => performAction(selectedTicket.ticket.id, "updateStatus", "IN_PROGRESS")}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
                              >
                                <Clock className="h-4 w-4" />
                                Start Working
                              </button>
                            )}
                            {selectedTicket.ticket.priority !== "URGENT" && (
                              <button
                                onClick={() => performAction(selectedTicket.ticket.id, "updatePriority", "URGENT")}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                              >
                                <AlertTriangle className="h-4 w-4" />
                                Mark Urgent
                              </button>
                            )}
                          </div>
                        </div>
                        {selectedTicket.ticket.assignedAdmin && (
                          <div>
                            <p className="text-sm text-muted-foreground">Assigned To</p>
                            <p className="font-medium">
                              {selectedTicket.ticket.assignedAdmin.name || selectedTicket.ticket.assignedAdmin.email}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Original Message */}
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Original Message</p>
                      <div className="bg-secondary/50 rounded-2xl p-4">
                        <p className="text-foreground whitespace-pre-wrap">{selectedTicket.ticket.message}</p>
                      </div>
                    </div>

                    {/* Conversation Thread */}
                    {selectedTicket.ticket.responses.length > 0 && (
                      <div className="border-t pt-4">
                        <p className="text-sm text-muted-foreground mb-3">Conversation ({selectedTicket.ticket.responses.length} replies)</p>
                        <div className="space-y-4">
                          {selectedTicket.ticket.responses.map((response) => (
                            <div
                              key={response.id}
                              className={`p-4 rounded-2xl ${
                                response.isFromAdmin ? "bg-primary/5 ml-4" : "bg-secondary/50 mr-4"
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  {response.isFromAdmin ? (
                                    <span className="text-sm font-medium text-primary">
                                      {response.responderName || "Support Team"}
                                    </span>
                                  ) : (
                                    <span className="text-sm font-medium text-foreground">
                                      {selectedTicket.ticket.name}
                                    </span>
                                  )}
                                  {response.isFromAdmin && response.emailSent && (
                                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                      <Mail className="h-3 w-3" />
                                      Emailed
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(response.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-foreground whitespace-pre-wrap">{response.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reply Form */}
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Send a Reply</p>
                      <textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        rows={4}
                        className="w-full border border-border rounded-2xl p-3 bg-card text-foreground placeholder:text-muted-foreground focus:ring-primary focus:border-primary/50"
                        placeholder="Type your response..."
                      />
                      <div className="flex items-center justify-between mt-3">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={sendEmail}
                            onChange={(e) => setSendEmail(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          Send email notification to user
                        </label>
                        <button
                          onClick={() => sendResponse(selectedTicket.ticket.id)}
                          disabled={actionLoading || !responseText.trim()}
                          className="inline-flex items-center gap-2 px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50"
                        >
                          {actionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Send Reply
                        </button>
                      </div>
                    </div>

                    {/* Internal Notes */}
                    {selectedTicket.ticket.internalNotes && (
                      <div className="border-t pt-4">
                        <p className="text-sm text-muted-foreground mb-2">Internal Notes</p>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                          <p className="text-foreground whitespace-pre-wrap text-sm">{selectedTicket.ticket.internalNotes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
