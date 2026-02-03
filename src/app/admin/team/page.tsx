"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  UserPlus,
  MoreVertical,
  Check,
  X,
  Copy,
  Loader2,
  Mail,
  Shield,
  Clock,
} from "lucide-react";

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("ADMIN");
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchTeam();
  }, []);

  async function fetchTeam() {
    try {
      const res = await fetch("/api/admin/team");
      if (!res.ok) throw new Error("Failed to fetch team");
      const data = await res.json();
      setMembers(data.members);
      setPendingInvites(data.pendingInvites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  async function sendInvite() {
    setInviting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invite");
      }

      setInviteUrl(data.inviteUrl);
      setEmailSent(data.emailSent || false);
      setSuccess(
        data.emailSent
          ? `Invite email sent to ${inviteEmail}!`
          : "Invite created! Share the link below with the invitee."
      );
      fetchTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  async function updateMember(memberId: string, action: string, role?: string) {
    try {
      const res = await fetch("/api/admin/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, action, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update member");
      }

      setSuccess("Member updated successfully");
      fetchTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    }
    setMenuOpen(null);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setSuccess("Copied to clipboard!");
    setTimeout(() => setSuccess(""), 2000);
  }

  function getRoleBadge(role: string) {
    const colors: Record<string, string> = {
      OWNER: "bg-purple-100 text-purple-800",
      ADMIN: "bg-blue-100 text-blue-800",
      VIEWER: "bg-gray-100 text-gray-800",
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          colors[role] || colors.VIEWER
        }`}
      >
        {role}
      </span>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage admin users and invitations
            </p>
          </div>
          <button
            onClick={() => {
              setShowInviteModal(true);
              setInviteUrl("");
              setInviteEmail("");
              setEmailSent(false);
            }}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </button>
        </div>

        {error && (
          <AlertBanner type="error" title="Error" message={error} onDismiss={() => setError("")} />
        )}
        {success && (
          <AlertBanner
            type="success"
            title="Success"
            message={success}
            onDismiss={() => setSuccess("")}
          />
        )}

        {/* Role Legend */}
        <div className="bg-white rounded-lg shadow px-6 py-4">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Role Permissions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="border border-purple-200 rounded-md p-3 bg-purple-50">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mb-1">OWNER</span>
              <p className="text-gray-700 mt-1">Full control. Can manage team members, change dashboard structure, and configure all settings. Only one owner per instance.</p>
            </div>
            <div className="border border-blue-200 rounded-md p-3 bg-blue-50">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-1">ADMIN</span>
              <p className="text-gray-700 mt-1">Full usage access. Can use all dashboard features, run scans, view data, and perform lookups. Cannot manage team or change settings.</p>
            </div>
            <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 mb-1">VIEWER</span>
              <p className="text-gray-700 mt-1">Read-only access. Can view all dashboards and data but cannot make any changes or run scans.</p>
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Team Members</h2>
          </div>
          {loading ? (
            <div className="p-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {members.map((member) => (
                <li key={member.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-600 font-medium">
                          {(member.name || member.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center">
                          <p className="text-sm font-medium text-gray-900">
                            {member.name || "No name"}
                          </p>
                          {!member.isActive && (
                            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                              Deactivated
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {getRoleBadge(member.role)}
                      <div className="text-sm text-gray-500">
                        {member.lastLoginAt
                          ? `Last login: ${new Date(member.lastLoginAt).toLocaleDateString()}`
                          : "Never logged in"}
                      </div>
                      {member.role !== "OWNER" && (
                        <div className="relative">
                          <button
                            onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                            className="p-1 rounded hover:bg-gray-100"
                          >
                            <MoreVertical className="h-5 w-5 text-gray-400" />
                          </button>
                          {menuOpen === member.id && (
                            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                              <div className="py-1">
                                {member.isActive ? (
                                  <button
                                    onClick={() => updateMember(member.id, "deactivate")}
                                    className="block w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-gray-100"
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => updateMember(member.id, "activate")}
                                    className="block w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-gray-100"
                                  >
                                    Activate
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    updateMember(
                                      member.id,
                                      "updateRole",
                                      member.role === "ADMIN" ? "VIEWER" : "ADMIN"
                                    )
                                  }
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  Change to {member.role === "ADMIN" ? "Viewer" : "Admin"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Pending Invitations</h2>
            </div>
            <ul className="divide-y divide-gray-200">
              {pendingInvites.map((invite) => (
                <li key={invite.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{invite.email}</p>
                        <p className="text-xs text-gray-500">
                          Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getRoleBadge(invite.role)}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {inviteUrl ? "Invite Created" : "Invite New Admin"}
              </h3>

              {inviteUrl ? (
                <div className="space-y-4">
                  {emailSent ? (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                      <Check className="h-4 w-4 inline mr-2" />
                      Invite email sent to <strong>{inviteEmail}</strong>. They can also use the link below:
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                      <Mail className="h-4 w-4 inline mr-2" />
                      Email could not be sent automatically. Share this link with <strong>{inviteEmail}</strong> manually:
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={inviteUrl}
                      readOnly
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-50"
                    />
                    <button
                      onClick={() => copyToClipboard(inviteUrl)}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded"
                    >
                      <Copy className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                    <Shield className="h-4 w-4 inline mr-2" />
                    This link expires in 7 days and can only be used once.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="ADMIN">Admin - Full dashboard access</option>
                      <option value="VIEWER">Viewer - Read-only access</option>
                    </select>
                    <p className="mt-2 text-xs text-gray-500">
                      <strong>Admin:</strong> Can access and use all dashboard features (scans, lookups, data, etc.) but cannot modify dashboard structure or manage team members.
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      <strong>Viewer:</strong> Can view all dashboards and data in read-only mode.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {inviteUrl ? "Close" : "Cancel"}
                </button>
                {!inviteUrl && (
                  <button
                    onClick={sendInvite}
                    disabled={inviting || !inviteEmail}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {inviting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      "Send Invite"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
