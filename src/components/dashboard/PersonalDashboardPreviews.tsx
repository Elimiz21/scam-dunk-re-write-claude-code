import Link from "next/link";
import { Clock3, Star } from "lucide-react";

import type { RecentScanDto, WatchlistEntryDto } from "@/components/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function checkedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeZone: "UTC",
  }).format(date);
}

export function PersonalDashboardPreviews({ watchlist, recentScans }: {
  watchlist: WatchlistEntryDto[];
  recentScans: RecentScanDto[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="home-watchlist-title" className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-watchlist-title" className="flex items-center gap-3 text-[15px] font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400"><Star className="h-4 w-4" aria-hidden="true" /></span>
            Your watchlist
          </h2>
          <Link href="/watchlist" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="View all watchlist stocks">View all</Link>
        </div>
        {watchlist.length === 0 ? (
          <div className="py-7 text-sm">
            <p className="font-medium">Your watchlist is empty</p>
            <p className="mt-2 text-muted-foreground">Save stocks you want to keep an eye on.</p>
            <Button asChild variant="outline" className="mt-4 min-h-11"><Link href="/watchlist">Add a stock</Link></Button>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {watchlist.slice(0, 3).map((entry) => (
              <li key={entry.id}>
                <Link href="/watchlist" className="flex min-h-16 flex-wrap items-center justify-between gap-2 rounded-md py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  <span className="font-semibold">{entry.ticker}</span>
                  <span className="text-xs text-muted-foreground">{entry.lastScanAt ? `Checked ${checkedDate(entry.lastScanAt)}` : "Not scanned yet"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="home-scans-title" className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-scans-title" className="flex items-center gap-3 text-[15px] font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clock3 className="h-4 w-4" aria-hidden="true" /></span>
            Recent scans
          </h2>
          <Link href="/recent-scans" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="View all recent scans">View all</Link>
        </div>
        {recentScans.length === 0 ? (
          <div className="py-7 text-sm">
            <p className="font-medium">No scans yet</p>
            <p className="mt-2 text-muted-foreground">Your completed scans will appear here.</p>
            <Button asChild variant="outline" className="mt-4 min-h-11"><Link href="/check">Scan a stock</Link></Button>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {recentScans.slice(0, 3).map((scan) => (
              <li key={scan.id}>
                <Link href={`/recent-scans?scan=${encodeURIComponent(scan.id)}`} className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-md py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label={`View ${scan.ticker} scan details`}>
                  <span><span className="block font-semibold">{scan.ticker}</span><span className="mt-1 block text-xs text-muted-foreground">{checkedDate(scan.scannedAt)}</span></span>
                  <Badge variant={scan.riskLabel === "High risk" ? "high" : scan.riskLabel === "Caution" ? "medium" : "low"}>{scan.riskLabel}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
