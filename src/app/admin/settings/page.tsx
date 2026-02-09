"use client";

import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Eye, EyeOff, Loader2, CheckCircle, KeyRound, Mail } from "lucide-react";

interface AdminSession {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default function SettingsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Email change state
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  useEffect(() => {
    fetchSession();
  }, []);

  async function fetchSession() {
    try {
      const res = await fetch("/api/admin/auth/session");
      const data = await res.json();
      if (data.authenticated) {
        setSession(data.admin);
      }
    } catch {
      // Session check handled by AdminLayout
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }

    setPwLoading(true);

    try {
      const res = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setPwSuccess("Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPwError(data.error || "Failed to change password");
      }
    } catch {
      setPwError("Failed to change password. Please try again.");
    } finally {
      setPwLoading(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailSuccess("");

    if (!newEmail) {
      setEmailError("Please enter a new email address");
      return;
    }

    if (!emailPassword) {
      setEmailError("Please enter your current password to confirm");
      return;
    }

    setEmailLoading(true);

    try {
      const res = await fetch("/api/admin/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, password: emailPassword }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setEmailSuccess("Email changed successfully. You may need to log in again with your new email.");
        setNewEmail("");
        setEmailPassword("");
        fetchSession(); // Refresh session display
      } else {
        setEmailError(data.error || "Failed to change email");
      }
    } catch {
      setEmailError("Failed to change email. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  const isOwner = session?.role === "OWNER";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your admin account settings
          </p>
        </div>

        {/* Current Account Info */}
        {session && (
          <div className="bg-card rounded-2xl shadow px-6 py-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Current Account</h2>
            <div className="mt-2 flex items-center space-x-4">
              <div className="h-10 w-10 rounded-full gradient-brand flex items-center justify-center">
                <span className="text-white font-medium">
                  {session.email[0].toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{session.name || "No name set"}</p>
                <p className="text-sm text-muted-foreground">{session.email}</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                {session.role}
              </span>
            </div>
          </div>
        )}

        {/* Change Email Section - Owner Only */}
        {isOwner && (
          <div className="bg-card rounded-2xl shadow">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center">
                <Mail className="h-5 w-5 text-muted-foreground mr-2" />
                <h2 className="text-lg font-medium text-foreground">
                  Change Login Email
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Update the email address you use to log in
              </p>
            </div>

            <form onSubmit={handleChangeEmail} className="px-6 py-6 space-y-5">
              {emailError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {emailError}
                </div>
              )}

              {emailSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                  {emailSuccess}
                </div>
              )}

              <div>
                <label
                  htmlFor="newEmail"
                  className="block text-sm font-medium text-foreground"
                >
                  New Email Address
                </label>
                <div className="mt-1">
                  <input
                    id="newEmail"
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                    placeholder="newemail@example.com"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="emailPassword"
                  className="block text-sm font-medium text-foreground"
                >
                  Current Password (to confirm)
                </label>
                <div className="mt-1 relative">
                  <input
                    id="emailPassword"
                    type={showEmailPassword ? "text" : "password"}
                    required
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm pr-10"
                    placeholder="Enter your current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmailPassword(!showEmailPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-muted-foreground"
                  >
                    {showEmailPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white gradient-brand hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {emailLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Email"
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Change Password Section */}
        <div className="bg-card rounded-2xl shadow">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center">
              <KeyRound className="h-5 w-5 text-muted-foreground mr-2" />
              <h2 className="text-lg font-medium text-foreground">
                Change Password
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Update your admin account password
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="px-6 py-6 space-y-5">
            {pwError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {pwError}
              </div>
            )}

            {pwSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm flex items-center">
                <CheckCircle className="h-4 w-4 mr-2" />
                {pwSuccess}
              </div>
            )}

            {/* Current Password */}
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-foreground"
              >
                Current Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm pr-10"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-muted-foreground"
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-foreground"
              >
                New Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm pr-10"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-muted-foreground"
                >
                  {showNew ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-foreground"
              >
                Confirm New Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm pr-10"
                  placeholder="Re-enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-muted-foreground"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={pwLoading}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white gradient-brand hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pwLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Changing...
                  </>
                ) : (
                  "Change Password"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
