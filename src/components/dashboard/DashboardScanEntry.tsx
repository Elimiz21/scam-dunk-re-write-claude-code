"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, TrendingUp } from "lucide-react";

import { readApiError } from "@/components/dashboard/types";

export function DashboardScanEntry({ onAdded }: { onAdded?: () => void | Promise<void> }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [tickerFocused, setTickerFocused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return;
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: normalized }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setError(readApiError(body, `${normalized} could not be added to your watchlist.`).message);
        return;
      }
      window.dispatchEvent(new Event("scamdunk:watchlist-updated"));
      await onAdded?.();
      router.push("/dashboard?filter=watching");
    } catch {
      setError(`${normalized} could not be added to your watchlist. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <form autoComplete="off" onSubmit={submit} className="mt-4 flex min-h-10 max-w-lg items-center rounded-full border border-border bg-card p-1 shadow-sm focus-within:border-teal" aria-label="Add a ticker to your watchlist">
        <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[12px] font-medium text-foreground/80 sm:flex">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          Stock
        </span>
        <label htmlFor="dashboard-ticker" className="sr-only">Stock ticker</label>
        <input
          id="dashboard-ticker"
          name="stock-ticker"
          type="search"
          readOnly={!tickerFocused}
          onFocus={(event) => {
            event.currentTarget.readOnly = false;
            setTickerFocused(true);
          }}
          data-1p-ignore
          data-lpignore="true"
          spellCheck={false}
          value={ticker}
          onChange={(event) => setTicker(event.target.value.toUpperCase())}
          placeholder="Add a ticker to track (e.g., AAPL, TSLA)"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={16}
          disabled={isSaving}
          className="min-w-0 flex-1 bg-transparent px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add ticker to watchlist"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
