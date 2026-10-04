"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TelegramAccountCard() {
  const [status, setStatus] = useState<{ active: boolean; available: boolean } | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/user/telegram");
      if (!response.ok) throw new Error("Unable to load Telegram access.");
      setStatus(await response.json()); setError("");
    } catch { setError("Unable to load Telegram access. Please retry."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!url) return;
    const interval = setInterval(() => void load(), 5000);
    const expiry = setTimeout(() => { setUrl(""); clearInterval(interval); }, 600_000);
    return () => { clearInterval(interval); clearTimeout(expiry); };
  }, [url, load]);
  useEffect(() => { if (status?.active) setUrl(""); }, [status?.active]);
  async function action(method: "POST" | "DELETE") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/user/telegram", { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update Telegram access.");
      setUrl(data.url || ""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update Telegram access."); }
    finally { setBusy(false); }
  }
  return <Card><CardHeader><CardTitle>Telegram scans</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Link your private Telegram chat, then send AAPL or scan AAPL. An active subscription is required. Scans use your monthly ScamDunk allowance.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
      {!status ? <p>Loading Telegram access…</p> : !status.available ? <p>Telegram linking opens when the bot launches.</p> : status.active ? <>
        <p>Telegram is linked.</p><Button variant="outline" disabled={busy} onClick={() => void action("DELETE")}>Unlink Telegram</Button>
      </> : <>
        <Button disabled={busy} onClick={() => void action("POST")}>{busy ? "Creating link…" : "Link Telegram"}</Button>
        {url && <div className="space-y-2"><a className="text-primary underline" href={url} target="_blank" rel="noopener noreferrer">Open ScamDunk in Telegram</a><p className="text-sm text-muted-foreground">Press Start in Telegram. Keep this link private; it expires in 10 minutes. This page updates when linking completes.</p></div>}
      </>}
    </CardContent></Card>;
}
