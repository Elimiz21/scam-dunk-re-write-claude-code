"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, X } from "lucide-react";

import { DASHBOARD_NAV_ITEMS } from "@/components/dashboard/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NavigationLogo } from "./Logo";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Retained for public-page callers; the final dashboard sidebar has no scan CTA. */
  onNewScan?: () => void;
  /** Retained for compatibility with public-page callers. */
  refreshKey?: number;
  persistent?: boolean;
}

export function Sidebar({ isOpen, onToggle, persistent = false }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [pumpRadarCount, setPumpRadarCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    const controller = new AbortController();
    fetch("/api/pump-radar?limit=50", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const radar = (await response.json()) as { rows?: unknown[] };
        setPumpRadarCount(Array.isArray(radar.rows) ? radar.rows.length : 0);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to load Pump Radar count", error);
        }
      });
    return () => controller.abort();
  }, [session?.user]);

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
          "fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col border-r border-dashboard-border bg-dashboard text-dashboard-foreground transition-transform duration-300",
          persistent
            ? "lg:sticky lg:top-[108px] lg:z-20 lg:h-[calc(100vh-108px)] lg:w-64 lg:shrink-0 lg:translate-x-0"
            : "lg:top-[108px] lg:h-[calc(100vh-108px)]",
          isOpen && "translate-x-0",
        )}
        aria-label="Dashboard navigation"
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4 lg:hidden">
          <NavigationLogo href="/dashboard" onDarkSurface />
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={onToggle} aria-label="Close menu">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

            <div className="flex h-full flex-col p-4">
              <nav className="flex-1 space-y-1">
                {DASHBOARD_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <div
                      key={href}
                      className={cn(label === "Pump Radar" && "mt-6 border-t border-dashboard-border pt-5")}
                    >
                      <Link
                        href={href}
                        onClick={() => isOpen && onToggle()}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-dashboard-active text-dashboard-foreground ring-1 ring-inset ring-dashboard-border"
                            : "text-dashboard-foreground/60 hover:bg-white/10 hover:text-dashboard-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1">{label}</span>
                        {label === "Pump Radar" && (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">{pumpRadarCount ?? "…"}</span>
                        )}
                      </Link>
                    </div>
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
