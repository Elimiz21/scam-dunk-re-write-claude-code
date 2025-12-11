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
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        FREE
      </span>
    );
  }

  function getRiskBadge(level: string) {
    const colors: Record<string, string> = {
      LOW: "bg-green-100 text-green-800",
      MEDIUM: "bg-yellow-100 text-yellow-800",
      HIGH: "bg-red-100 text-red-800",
      INSUFFICIENT: "bg-gray-100 text-gray-800",
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
          <p className="font-medium text-gray-900">{item.email}</p>
          {item.name && <p className="text-sm text-gray-500">{item.name}</p>}
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
        <span className="text-gray-900">{item.scansThisMonth}</span>
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
            className="p-1 text-gray-400 hover:text-indigo-600 rounded"
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen === item.id && (
              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                <div className="py-1">
                  {item.plan === "FREE" ? (
                    <button
                      onClick={() => performAction(item.id, "upgradeToPaid")}
                      disabled={actionLoading}
                      className="flex items-center w-full px-4 py-2 text-sm text-green-700 hover:bg-gray-100"
                    >
                      <ArrowUpCircle className="h-4 w-4 mr-2" />
                      Upgrade to Paid
                    </button>
                  ) : (
                    <button
                      onClick={() => performAction(item.id, "downgradeToFree")}
                      disabled={actionLoading}
                      className="flex items-center w-full px-4 py-2 text-sm text-orange-700 hover:bg-gray-100"
                    >
                      <ArrowDownCircle className="h-4 w-4 mr-2" />
                      Downgrade to Free
                    </button>
                  )}
                  <button
                    onClick={() => performAction(item.id, "resetScans")}
                    disabled={actionLoading}
                    className="flex items-center w-full px-4 py-2 text-sm text-blue-700 hover:bg-gray-100"
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
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Set Scan Count
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
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
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
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
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
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">User Details</h3>
                <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingUser ? (
                <div className="p-6 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* User Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{selectedUser.user.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Name</p>
                      <p className="font-medium">{selectedUser.user.name || "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Plan</p>
                      <p>{getPlanBadge(selectedUser.user.plan)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Joined</p>
                      <p className="font-medium">{new Date(selectedUser.user.createdAt).toLocaleDateString()}</p>
                    </div>
                    {selectedUser.user.billingCustomerId && (
                      <div className="col-span-2">
                        <p className="text-sm text-gray-500">Stripe Customer ID</p>
                        <p className="font-mono text-sm">{selectedUser.user.billingCustomerId}</p>
                      </div>
                    )}
                  </div>

                  {/* Usage Stats */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-900 mb-3">Usage Statistics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-500">This Month</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {selectedUser.usage.currentMonth.scansUsed}
                          <span className="text-sm font-normal text-gray-500">
                            /{selectedUser.usage.currentMonth.scanLimit}
                          </span>
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-500">Remaining</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {selectedUser.usage.currentMonth.remaining}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-500">All Time</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {selectedUser.usage.totalAllTime}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-500">Avg/Month</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {selectedUser.usage.avgPerMonth}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recent Scans */}
                  {selectedUser.recentScans.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-gray-900 mb-3">Recent Scans</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedUser.recentScans.slice(0, 10).map((scan) => (
                          <div key={scan.id} className="flex items-center justify-between py-2 border-b">
                            <div className="flex items-center space-x-3">
                              <span className="font-mono font-medium">{scan.ticker}</span>
                              {getRiskBadge(scan.riskLevel)}
                            </div>
                            <span className="text-sm text-gray-500">
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
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Set Scan Count
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
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editModal.type === "setScans" ? "Set Scan Count" : "Edit Value"}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {editModal.type === "setScans" ? "Monthly Scan Count" : "Value"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editValue}
                    onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Current value: {editModal.currentValue}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setEditModal(null)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => performAction(editModal.userId, editModal.type, editValue)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
