"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function GoogleSignInButton({ callbackUrl = "/dashboard" }: { callbackUrl?: string }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/auth/options").then(r => r.json()).then(data => {
      if (active) setAvailable(data.google === true);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!available) return null;
  return <div className="space-y-2">
    <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await signIn("google", { callbackUrl }); }
      catch { setError("Google sign-in is unavailable. Please try again."); setBusy(false); }
    }}>{busy ? "Connecting to Google…" : "Continue with Google"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
