"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type WhatsAppStatus = "loading" | "available" | "linked" | "unavailable";

export function DashboardWhatsAppLink() {
  const [status, setStatus] = useState<WhatsAppStatus>("loading");
  const [eligible, setEligible] = useState(false);
  const paywallRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/user/whatsapp", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load WhatsApp access.");
        return response.json() as Promise<{ active: boolean; available: boolean; eligible: boolean }>;
      })
      .then((data) => {
        if (!active) return;
        setEligible(data.eligible);
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
    window.location.assign("/account#whatsapp");
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
