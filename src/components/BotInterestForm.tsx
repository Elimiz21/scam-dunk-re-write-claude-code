"use client";

import { useState } from "react";

type BotFeature = "WHATSAPP_BOT" | "TELEGRAM_BOT" | "MESSENGER_UPDATES";

export function BotInterestForm({ feature }: { feature: BotFeature }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      const response = await fetch("/api/feature-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, feature }),
      });
      if (!response.ok) throw new Error("signup failed");
      setStatus("saved");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "saved") {
    return <p className="mt-4 text-[12px] font-medium text-teal">You&apos;re on the launch list.</p>;
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor={`${feature}-email`}>Email for launch updates</label>
      <input
        id={`${feature}-email`}
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Your email for launch updates"
        className="min-w-0 flex-1 rounded-full border border-border bg-background px-3.5 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-teal"
        disabled={status === "saving"}
      />
      <button type="submit" className="btn-pill btn-pill-primary whitespace-nowrap px-4 py-2 text-[12px]" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Get launch updates"}
      </button>
      {status === "error" && <span className="text-[11px] text-destructive sm:absolute sm:mt-11">Please try again.</span>}
    </form>
  );
}
