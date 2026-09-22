"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TrendingUp } from "lucide-react";

export function DashboardScanEntry() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [tickerFocused, setTickerFocused] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return;
    router.push(`/?ticker=${encodeURIComponent(normalized)}&focus=scan&auto=1`);
  }

  return (
    <form autoComplete="off" onSubmit={submit} className="mt-5 flex min-h-11 max-w-xl items-center rounded-full border border-border bg-card p-1.5 shadow-sm focus-within:border-teal" aria-label="Start a stock scan">
      <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 text-[13px] font-medium text-foreground/80 sm:flex">
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
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
        className="min-w-0 flex-1 bg-transparent px-2 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60"
      />
      <button
        type="submit"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
        aria-label="Add ticker and continue to scan"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
