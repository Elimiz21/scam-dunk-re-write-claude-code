"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, X } from "lucide-react";

import { DASHBOARD_NAV_ITEMS } from "@/components/dashboard/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewScan: () => void;
  refreshKey?: number;
  persistent?: boolean;
}

export function Sidebar({ isOpen, onToggle, onNewScan: _onNewScan, refreshKey = 0, persistent = false }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [pumpRadarCount, setPumpRadarCount] = useState<number | null>(null);

  const loadWatchlistCount = useCallback(async (signal?: AbortSignal) => {
    if (!session?.user) return;
    try {
      const [response, radarResponse] = await Promise.all([
        fetch("/api/watchlist?countOnly=1", { cache: "no-store", signal }),
        fetch("/api/pump-radar?limit=50", { cache: "no-store", signal }),
      ]);
      if (!response.ok) return;
      const data = (await response.json()) as { watchlistCount?: number; entries?: unknown[] };
      setWatchlistCount(
        typeof data.watchlistCount === "number"
          ? data.watchlistCount
          : Array.isArray(data.entries)
            ? data.entries.length
            : 0,
      );
      if (radarResponse.ok) {
        const radar = (await radarResponse.json()) as { rows?: unknown[] };
        setPumpRadarCount(Array.isArray(radar.rows) ? radar.rows.length : 0);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Failed to load watchlist count", error);
      }
    }
  }, [session?.user]);

  useEffect(() => {
    const controller = new AbortController();
    void loadWatchlistCount(controller.signal);
    return () => controller.abort();
  }, [loadWatchlistCount, refreshKey]);

  useEffect(() => {
    const refresh = () => void loadWatchlistCount();
    window.addEventListener("scamdunk:watchlist-updated", refresh);
    return () => window.removeEventListener("scamdunk:watchlist-updated", refresh);
  }, [loadWatchlistCount]);

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] lg:hidden"
          onClick={onToggle}
          aria-label="Close navigation menu"
        />
      )}
      <aside
        id="dashboard-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col border-r border-[#29445d] bg-[#19324b] text-white transition-transform duration-300",
          persistent
            ? "lg:sticky lg:top-[108px] lg:z-20 lg:h-[calc(100vh-108px)] lg:w-64 lg:shrink-0 lg:translate-x-0"
            : "lg:top-[108px] lg:h-[calc(100vh-108px)]",
          isOpen && "translate-x-0",
        )}
        aria-label="Dashboard navigation"
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4 lg:hidden">
          <Logo size={30} href="/dashboard" />
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={onToggle} aria-label="Close menu">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex h-full flex-col p-4">
          <nav className="flex-1 space-y-1">
            {DASHBOARD_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => isOpen && onToggle()}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium transition-colors",
                    active
                      ? "bg-[#204f7d] text-white ring-1 ring-inset ring-brand-blue"
                      : "text-white/60 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {label === "Watchlist" && (
                    <span
                      id="watchlist-count"
                      className="min-w-6 rounded-full bg-white/10 px-2 py-0.5 text-center text-[11px] font-semibold text-white shadow-sm"
                      aria-label={`${watchlistCount ?? 0} stocks in watchlist`}
                    >
                      {watchlistCount ?? "…"}
                    </span>
                  )}
                  {label === "Pump Radar" && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">{pumpRadarCount ?? "…"}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="h-11 w-11 lg:hidden"
      aria-label="Open menu"
      aria-controls="dashboard-sidebar"
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
