"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, TrendingUp } from "lucide-react";

export function DashboardScanEntry() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return;
    router.push(`/?ticker=${encodeURIComponent(normalized)}&focus=scan`);
  }

  return (
    <form onSubmit={submit} className="mt-7 flex min-h-16 items-center rounded-full bg-white p-2 shadow-sm" aria-label="Start a stock scan">
      <span className="hidden items-center gap-2 border-r border-slate-200 px-4 text-[13px] font-medium text-slate-700 sm:flex">
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
        Stock
      </span>
      <label htmlFor="dashboard-ticker" className="sr-only">Stock ticker</label>
      <input
        id="dashboard-ticker"
        value={ticker}
        onChange={(event) => setTicker(event.target.value.toUpperCase())}
        placeholder="Enter stock ticker (e.g., AAPL, TSLA)"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={16}
        className="min-w-0 flex-1 bg-transparent px-4 text-[15px] text-slate-950 outline-none placeholder:text-slate-400"
      />
      <button
        type="submit"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition-colors hover:bg-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        aria-label="Continue to scan"
      >
        <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </form>
  );
}
