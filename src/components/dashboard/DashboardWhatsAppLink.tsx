"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WhatsAppStatus = "loading" | "available" | "linked" | "unavailable";
type WhatsAppResponse = {
  active?: boolean;
  available?: boolean;
  eligible?: boolean;
  pending?: boolean;
  maskedPhone?: string;
  error?: string;
  retryAt?: string;
};

export function DashboardWhatsAppLink() {
  const [status, setStatus] = useState<WhatsAppStatus>("loading");
  const [eligible, setEligible] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const paywallRef = useRef<HTMLDialogElement>(null);
  const connectRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/user/whatsapp", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load WhatsApp access.");
        return response.json() as Promise<WhatsAppResponse>;
      })
      .then((data) => {
        if (!active) return;
        setEligible(Boolean(data.eligible));
        setMaskedPhone(data.maskedPhone || "");
        setStatus(data.active ? "linked" : data.available ? "available" : "unavailable");
      })
      .catch(() => { if (active) setStatus("unavailable"); });
    return () => { active = false; };
  }, []);

  function connect() {
    if (!eligible) {
      paywallRef.current?.showModal();
      return;
    }
    setPhone("");
    setCode("");
    setCodeSent(false);
    setError("");
    connectRef.current?.showModal();
  }

  async function sendCode() {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/user/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "begin", phoneNumber: phone, resend: false }),
      });
      const data = await response.json() as WhatsAppResponse;
      if (data.pending) setCodeSent(true);
      if (!response.ok) {
        const retryHint = data.retryAt
          ? ` Request another code after ${new Date(data.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
          : "";
        setError((data.error || "Couldn’t send a code.") + retryHint);
        return;
      }
      setMaskedPhone(data.maskedPhone || "");
      setCodeSent(true);
    } catch {
      setError("Couldn’t send a code. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    setConfirming(true);
    setError("");
    try {
      const response = await fetch("/api/user/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", code }),
      });
      const data = await response.json() as WhatsAppResponse;
      if (!response.ok) throw new Error(data.error || "Couldn’t verify the code. Try again.");
      setMaskedPhone(data.maskedPhone || maskedPhone);
      setStatus("linked");
      setCode("");
      connectRef.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t verify the code. Try again.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="sm:mt-4 sm:shrink-0">
      {status === "linked" ? (
        <Button asChild variant="outline" className="min-h-10 rounded-full text-xs">
          <Link href="/account#whatsapp"><Check className="mr-2 h-4 w-4" aria-hidden="true" />WhatsApp linked</Link>
        </Button>
      ) : (
        <Button variant="outline" className="min-h-10 rounded-full text-xs" disabled={status !== "available"} onClick={connect}>
          {status === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />}
          Connect to WhatsApp
        </Button>
      )}
      {status === "unavailable" && <p className="mt-2 max-w-44 text-xs text-muted-foreground">WhatsApp is temporarily unavailable.</p>}

      <dialog ref={connectRef} aria-labelledby="whatsapp-connect-title" className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60" onClick={(event) => { if (event.target === event.currentTarget) connectRef.current?.close(); }}>
        <div className="space-y-4 p-6">
          <h2 id="whatsapp-connect-title" className="font-editorial text-xl">Connect WhatsApp</h2>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!codeSent ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="dashboard-whatsapp-phone">WhatsApp phone number</Label>
                <Input id="dashboard-whatsapp-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+12125550199" disabled={sending} />
                <p className="text-xs text-muted-foreground">Use international format (for Israel, +972 without the leading 0). We’ll send a code in WhatsApp. Enter it here to finish linking.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void sendCode()} disabled={sending || !phone.trim()}>
                  {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Sending code…</> : "Send verification code"}
                </Button>
                <Button variant="outline" onClick={() => connectRef.current?.close()} disabled={sending}>Cancel</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Enter the latest six-digit code sent to WhatsApp{maskedPhone ? ` at ${maskedPhone}` : ""}.</p>
              <div className="space-y-2">
                <Label htmlFor="dashboard-whatsapp-code">Six-digit verification code</Label>
                <Input id="dashboard-whatsapp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" disabled={confirming} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void verifyCode()} disabled={confirming || code.length !== 6}>
                  {confirming ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Verifying…</> : "Verify and link"}
                </Button>
                <Button variant="outline" onClick={() => { setCodeSent(false); setCode(""); setError(""); }} disabled={confirming}>Change number</Button>
              </div>
            </>
          )}
        </div>
      </dialog>

      <dialog ref={paywallRef} aria-labelledby="whatsapp-paywall-title" className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60" onClick={(event) => { if (event.target === event.currentTarget) paywallRef.current?.close(); }}>
        <div className="space-y-4 p-6">
          <h2 id="whatsapp-paywall-title" className="font-editorial text-xl">Scan with WhatsApp on Pro</h2>
          <p className="text-sm text-muted-foreground">Upgrade to Pro or Pro Max to connect WhatsApp. Bot scans use your plan&apos;s monthly scan credits.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/account#plans">See plans</Link></Button>
            <Button variant="outline" onClick={() => paywallRef.current?.close()}>Maybe later</Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
