"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function AdminResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("This reset link is invalid or expired.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Password reset failed.");
      setMessage("Password updated. You can now sign in to the admin dashboard.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password reset failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl bg-card p-8 shadow">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reset admin password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a new password for your ScamDunk dashboard account.</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        {!message && <>
          <label className="block text-sm font-medium text-foreground">
            New password
            <input required type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-foreground" />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Confirm new password
            <input required type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-foreground" />
          </label>
          <button disabled={saving} className="w-full rounded-md gradient-brand px-4 py-2 font-medium text-white disabled:opacity-60">
            {saving ? "Updating…" : "Set new password"}
          </button>
        </>}
        {message && <Link href="/admin/login" className="inline-block text-sm text-primary hover:underline">Go to admin sign in</Link>}
      </form>
    </main>
  );
}
