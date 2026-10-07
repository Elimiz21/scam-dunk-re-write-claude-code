"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DashboardTelegramLink() {
  const [status, setStatus] = useState<"loading" | "available" | "linked" | "unavailable">("loading");
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paywallRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/user/telegram", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load Telegram access.");
        return response.json() as Promise<{ active: boolean; available: boolean; eligible: boolean }>;
      })
      .then(data => {
        if (active) {
          setEligible(data.eligible);
          setStatus(data.active ? "linked" : data.available ? "available" : "unavailable");
        }
      })
      .catch(() => { if (active) setStatus("unavailable"); });
    return () => { active = false; };
  }, []);

  async function connect() {
    if (!eligible) {
      paywallRef.current?.showModal();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/user/telegram", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (response.status === 403) {
        paywallRef.current?.showModal();
        return;
      }
      if (!response.ok || !data.url) throw new Error(data.error || "Unable to create a Telegram link.");
      const link = new URL(data.url);
      if (link.protocol !== "https:" || link.hostname !== "t.me") throw new Error("Invalid Telegram link. Please retry.");
      window.location.assign(link.href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create a Telegram link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:mt-4 sm:shrink-0">
      {status === "linked" ? (
        <Button asChild variant="outline" className="min-h-10 rounded-full text-xs">
          <Link href="/account#telegram"><Check className="mr-2 h-4 w-4" aria-hidden="true" />Telegram linked</Link>
        </Button>
      ) : (
        <Button variant="outline" className="min-h-10 rounded-full text-xs" disabled={busy || status !== "available"} onClick={() => void connect()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />}
          {busy ? "Connecting…" : "Connect Telegram"}
        </Button>
      )}
      {status === "unavailable" && !error && <p className="mt-2 max-w-44 text-xs text-muted-foreground">Telegram is temporarily unavailable.</p>}
      {error && <p className="mt-2 max-w-44 text-xs text-destructive" role="alert">{error}</p>}
      <dialog ref={paywallRef} aria-labelledby="telegram-paywall-title" className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60" onClick={event => { if (event.target === event.currentTarget) paywallRef.current?.close(); }}>
        <div className="space-y-4 p-6">
          <h2 id="telegram-paywall-title" className="font-editorial text-xl">Scan with Telegram on Pro</h2>
          <p className="text-sm text-muted-foreground">Upgrade to Pro or Pro Max to link your private Telegram chat. Bot scans use your plan&apos;s monthly scan credits.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/account#plans">See plans</Link></Button>
            <Button variant="outline" onClick={() => paywallRef.current?.close()}>Maybe later</Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
