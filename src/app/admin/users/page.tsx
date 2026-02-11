"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatCard from "@/components/admin/StatCard";
import DataTable from "@/components/admin/DataTable";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Users,
  UserPlus,
  CreditCard,
  Search,
  MoreVertical,
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  Edit,
  X,
  Loader2,
  Eye,
  Key,
  Trash2,
  Mail,
  AlertTriangle,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  billingCustomerId: string | null;
  createdAt: string;
  scansThisMonth: number;
  totalMonthsActive: number;
}

interface UserDetails {
  user: {
    id: string;
    email: string;
    name: string | null;
    plan: string;
    billingCustomerId: string | null;
    emailVerified: string | null;
    createdAt: string;
    updatedAt: string;
    authProviders: string[];
  };
  usage: {
    currentMonth: {
      monthKey: string;
      scansUsed: number;
      scanLimit: number;
      remaining: number;
    };
    history: { monthKey: string; scanCount: number }[];
    totalAllTime: number;
    avgPerMonth: number;
  };
  recentScans: {
    id: string;
    ticker: string;
    riskLevel: string;
    totalScore: number;
    createdAt: string;
  }[];
}

interface Stats {
  totalUsers: number;
  freeUsers: number;
  paidUsers: number;
  newUsersLast30Days: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editModal, setEditModal] = useState<{ type: string; userId: string; currentValue?: string | number } | null>(null);
  const [editValue, setEditValue] = useState<string | number>("");
  const [confirmModal, setConfirmModal] = useState<{ type: string; userId: string; userEmail: string } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [pagination.page, planFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (pagination.page === 1) {
        fetchUsers();
      } else {
        setPagination((p) => ({ ...p, page: 1 }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: "15",
      });
      if (search) params.append("search", search);
      if (planFilter) params.append("plan", planFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.users);
      setPagination(data.pagination);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserDetails(userId: string) {
    setLoadingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user details");
      const data = await res.json();
      setSelectedUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user details");
    } finally {
      setLoadingUser(false);
    }
  }

  async function performAction(userId: string, action: string, value?: string | number) {
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setSuccess(data.message);
      setMenuOpen(null);
      setEditModal(null);
      fetchUsers();
      if (selectedUser?.user.id === userId) {
        fetchUserDetails(userId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  function getPlanBadge(plan: string) {
    return plan === "PAID" ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CreditCard className="h-3 w-3 mr-1" />
        PAID
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-foreground">
        FREE
      </span>
    );
  }

  function getRiskBadge(level: string) {
    const colors: Record<string, string> = {
      LOW: "bg-green-100 text-green-800",
      MEDIUM: "bg-yellow-100 text-yellow-800",
      HIGH: "bg-red-100 text-red-800",
      INSUFFICIENT: "bg-secondary text-foreground",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors.INSUFFICIENT}`}>
        {level}
      </span>
    );
  }

  const userColumns = [
    {
      key: "email",
      header: "User",
      render: (item: User) => (
        <div>
          <p className="font-medium text-foreground">{item.email}</p>
          {item.name && <p className="text-sm text-muted-foreground">{item.name}</p>}
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (item: User) => getPlanBadge(item.plan),
    },
    {
      key: "scansThisMonth",
      header: "Scans (Month)",
      render: (item: User) => (
        <span className="text-foreground">{item.scansThisMonth}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (item: User) => new Date(item.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      render: (item: User) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchUserDetails(item.id)}
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
                  {item.plan === "FREE" ? (
                    <button
                      onClick={() => performAction(item.id, "upgradeToPaid")}
                      disabled={actionLoading}
                      className="flex items-center w-full px-4 py-2 text-sm text-green-700 hover:bg-secondary"
                    >
                      <ArrowUpCircle className="h-4 w-4 mr-2" />
                      Upgrade to Paid
                    </button>
                  ) : (
                    <button
                      onClick={() => performAction(item.id, "downgradeToFree")}
                      disabled={actionLoading}
                      className="flex items-center w-full px-4 py-2 text-sm text-orange-700 hover:bg-secondary"
                    >
                      <ArrowDownCircle className="h-4 w-4 mr-2" />
                      Downgrade to Free
                    </button>
                  )}
                  <button
                    onClick={() => performAction(item.id, "resetScans")}
                    disabled={actionLoading}
                    className="flex items-center w-full px-4 py-2 text-sm text-blue-700 hover:bg-secondary"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Monthly Scans
                  </button>
                  <button
                    onClick={() => {
                      setEditModal({ type: "setScans", userId: item.id, currentValue: item.scansThisMonth });
                      setEditValue(item.scansThisMonth);
                      setMenuOpen(null);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-foreground hover:bg-secondary"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Set Scan Count
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => {
                      performAction(item.id, "resetPassword");
                    }}
                    disabled={actionLoading}
                    className="flex items-center w-full px-4 py-2 text-sm text-purple-700 hover:bg-secondary"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Send Password Reset
                  </button>
                  <button
                    onClick={() => {
                      performAction(item.id, "resetVerification");
                    }}
                    disabled={actionLoading}
                    className="flex items-center w-full px-4 py-2 text-sm text-primary hover:bg-secondary"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Resend Verification
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => {
                      setConfirmModal({ type: "deleteUser", userId: item.id, userEmail: item.email });
                      setMenuOpen(null);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete User
                  </button>
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage application users and their subscriptions
          </p>
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
            <StatCard title="Total Users" value={stats.totalUsers} icon={Users} color="blue" />
            <StatCard title="Free Users" value={stats.freeUsers} icon={Users} color="gray" />
            <StatCard title="Paid Users" value={stats.paidUsers} icon={CreditCard} color="green" />
            <StatCard title="New (30 days)" value={stats.newUsersLast30Days} icon={UserPlus} color="indigo" />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-card text-foreground placeholder:text-muted-foreground focus:ring-primary focus:border-primary/50"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="border border-border rounded-md px-3 py-2 bg-card text-foreground"
          >
            <option value="">All Plans</option>
            <option value="FREE">Free</option>
            <option value="PAID">Paid</option>
          </select>
        </div>

        {/* Users Table */}
        <DataTable
          columns={userColumns}
          data={users}
          loading={loading}
          pagination={{
            ...pagination,
            onPageChange: (page) => setPagination((p) => ({ ...p, page })),
          }}
          emptyMessage="No users found"
        />

        {/* User Details Modal */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-medium text-foreground">User Details</h3>
                <button onClick={() => setSelectedUser(null)} className="text-muted-foreground hover:text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingUser ? (
                <div className="p-6 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* User Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedUser.user.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{selectedUser.user.name || "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Plan</p>
                      <p>{getPlanBadge(selectedUser.user.plan)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Joined</p>
                      <p className="font-medium">{new Date(selectedUser.user.createdAt).toLocaleDateString()}</p>
                    </div>
                    {selectedUser.user.billingCustomerId && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Stripe Customer ID</p>
                        <p className="font-mono text-sm">{selectedUser.user.billingCustomerId}</p>
                      </div>
                    )}
                  </div>

                  {/* Usage Stats */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-foreground mb-3">Usage Statistics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-secondary/50 rounded-2xl p-3">
                        <p className="text-sm text-muted-foreground">This Month</p>
                        <p className="text-2xl font-bold text-foreground">
                          {selectedUser.usage.currentMonth.scansUsed}
                          <span className="text-sm font-normal text-muted-foreground">
                            /{selectedUser.usage.currentMonth.scanLimit}
                          </span>
                        </p>
                      </div>
                      <div className="bg-secondary/50 rounded-2xl p-3">
                        <p className="text-sm text-muted-foreground">Remaining</p>
                        <p className="text-2xl font-bold text-foreground">
                          {selectedUser.usage.currentMonth.remaining}
                        </p>
                      </div>
                      <div className="bg-secondary/50 rounded-2xl p-3">
                        <p className="text-sm text-muted-foreground">All Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {selectedUser.usage.totalAllTime}
                        </p>
                      </div>
                      <div className="bg-secondary/50 rounded-2xl p-3">
                        <p className="text-sm text-muted-foreground">Avg/Month</p>
                        <p className="text-2xl font-bold text-foreground">
                          {selectedUser.usage.avgPerMonth}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recent Scans */}
                  {selectedUser.recentScans.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-foreground mb-3">Recent Scans</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedUser.recentScans.slice(0, 10).map((scan) => (
                          <div key={scan.id} className="flex items-center justify-between py-2 border-b">
                            <div className="flex items-center space-x-3">
                              <span className="font-mono font-medium">{scan.ticker}</span>
                              {getRiskBadge(scan.riskLevel)}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {new Date(scan.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="border-t pt-4 flex flex-wrap gap-2">
                    {selectedUser.user.plan === "FREE" ? (
                      <button
                        onClick={() => performAction(selectedUser.user.id, "upgradeToPaid")}
                        disabled={actionLoading}
                        className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                        Upgrade to Paid
                      </button>
                    ) : (
                      <button
                        onClick={() => performAction(selectedUser.user.id, "downgradeToFree")}
                        disabled={actionLoading}
                        className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                      >
                        <ArrowDownCircle className="h-4 w-4 mr-2" />
                        Downgrade to Free
                      </button>
                    )}
                    <button
                      onClick={() => performAction(selectedUser.user.id, "resetScans")}
                      disabled={actionLoading}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset Scans
                    </button>
                    <button
                      onClick={() => {
                        setEditModal({
                          type: "setScans",
                          userId: selectedUser.user.id,
                          currentValue: selectedUser.usage.currentMonth.scansUsed,
                        });
                        setEditValue(selectedUser.usage.currentMonth.scansUsed);
                      }}
                      disabled={actionLoading}
                      className="inline-flex items-center px-4 py-2 border border-border text-foreground rounded-md hover:bg-secondary disabled:opacity-50"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Set Scan Count
                    </button>
                  </div>

                  {/* Additional Actions */}
                  <div className="border-t pt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => performAction(selectedUser.user.id, "resetPassword")}
                      disabled={actionLoading}
                      className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Send Password Reset
                    </button>
                    <button
                      onClick={() => performAction(selectedUser.user.id, "resetVerification")}
                      disabled={actionLoading}
                      className="inline-flex items-center px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Resend Verification
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          type: "deleteUser",
                          userId: selectedUser.user.id,
                          userEmail: selectedUser.user.email,
                        });
                      }}
                      disabled={actionLoading}
                      className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete User
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-foreground mb-4">
                {editModal.type === "setScans" ? "Set Scan Count" : "Edit Value"}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    {editModal.type === "setScans" ? "Monthly Scan Count" : "Value"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editValue}
                    onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                    className="mt-1 block w-full border border-border rounded-md px-3 py-2 bg-card text-foreground"
                  />
                  <p className="mt-1 text-sm text-muted-foreground">
                    Current value: {editModal.currentValue}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setEditModal(null)}
                  className="px-4 py-2 text-foreground border border-border rounded-md hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => performAction(editModal.userId, editModal.type, editValue)}
                  disabled={actionLoading}
                  className="px-4 py-2 gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal (for delete) */}
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="ml-3 text-lg font-medium text-foreground">
                  {confirmModal.type === "deleteUser" ? "Delete User" : "Confirm Action"}
                </h3>
              </div>
              <div className="mb-4">
                {confirmModal.type === "deleteUser" && (
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">
                      Are you sure you want to delete the user <strong>{confirmModal.userEmail}</strong>?
                    </p>
                    <p className="text-red-600 font-medium">
                      This action cannot be undone. All user data including scan history, usage records, and account information will be permanently deleted.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 text-foreground border border-border rounded-md hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await performAction(confirmModal.userId, confirmModal.type);
                    setConfirmModal(null);
                    if (selectedUser?.user.id === confirmModal.userId) {
                      setSelectedUser(null);
                    }
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Delete User"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
