"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  Shield,
  PanelLeftClose,
  PanelLeft,
  Settings,
  HelpCircle,
  LogOut,
  User,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  HelpCircle as HelpIcon,
  Loader2,
  Info,
  FileText,
  MessageCircleQuestion,
  Scale,
  Newspaper,
  Mail,
  Sparkles,
  Eye,
  EyeOff,
  X,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { cn, formatRelativeDate } from "@/lib/utils";

interface WatchlistItem {
  id: string;
  ticker: string;
  assetType: string;
  lastRiskLevel: string | null;
  lastScore: number | null;
  scanCount: number;
  isHidden: boolean;
  lastScannedAt: string;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewScan: () => void;
  /**
   * Re-run a scan for a watchlist ticker. The home page passes a direct
   * handler; on other pages the sidebar falls back to navigating to
   * /?scan=TICKER, which the home page picks up and runs automatically.
   */
  onScanTicker?: (ticker: string, assetType: string) => void;
  refreshKey?: number;
}

function getRiskIcon(riskLevel: string) {
  switch (riskLevel) {
    case "LOW":
      return <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />;
    case "MEDIUM":
      return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
    case "HIGH":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    default:
      return <HelpIcon className="h-3.5 w-3.5 text-gray-400" />;
  }
}

function getRiskColor(riskLevel: string) {
  switch (riskLevel) {
    case "LOW":
      return "text-emerald-600 dark:text-emerald-400";
    case "MEDIUM":
      return "text-amber-600 dark:text-amber-400";
    case "HIGH":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-gray-500 dark:text-gray-400";
  }
}

function getRiskBg(riskLevel: string) {
  switch (riskLevel) {
    case "LOW":
      return "bg-emerald-500/8";
    case "MEDIUM":
      return "bg-amber-500/8";
    case "HIGH":
      return "bg-red-500/8";
    default:
      return "bg-gray-500/8";
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function Sidebar({
  isOpen,
  onToggle,
  onNewScan,
  onScanTicker,
  refreshKey = 0,
}: SidebarProps) {
  const { data: session } = useSession();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const fetchControllerRef = useRef<AbortController | null>(null);

  const fetchWatchlist = useCallback(async () => {
    if (!session?.user) return;

    // Cancel any in-flight request to avoid stale data overwriting fresh data
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/watchlist?_t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (controller.signal.aborted) return;
      if (response.ok) {
        const data = await response.json();
        setWatchlist(data.items || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch watchlist:", err);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [session?.user]);

  // Fetch when sidebar opens
  useEffect(() => {
    if (session?.user && isOpen) {
      fetchWatchlist();
    }
  }, [session?.user, isOpen, fetchWatchlist]);

  // Re-fetch when a new scan completes (refreshKey changes), even if sidebar is closed
  useEffect(() => {
    if (session?.user && refreshKey > 0) {
      fetchWatchlist();
    }
  }, [refreshKey, session?.user, fetchWatchlist]);

  // Re-fetch when user returns to the tab (catches stale data after background time)
  useEffect(() => {
    if (!session?.user) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchWatchlist();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [session?.user, fetchWatchlist]);

  const handleRescan = (item: WatchlistItem) => {
    if (onScanTicker) {
      onScanTicker(item.ticker, item.assetType);
    } else {
      window.location.href = `/?scan=${encodeURIComponent(item.ticker)}&type=${encodeURIComponent(item.assetType)}`;
    }
  };

  // Optimistic hide/unhide — revert by refetching on failure.
  const handleToggleHidden = async (item: WatchlistItem) => {
    setWatchlist((list) =>
      list.map((w) =>
        w.id === item.id ? { ...w, isHidden: !item.isHidden } : w,
      ),
    );
    try {
      const response = await fetch("/api/user/watchlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, isHidden: !item.isHidden }),
      });
      if (!response.ok) fetchWatchlist();
    } catch {
      fetchWatchlist();
    }
  };

  // Optimistic remove — revert by refetching on failure.
  const handleRemove = async (item: WatchlistItem) => {
    setWatchlist((list) => list.filter((w) => w.id !== item.id));
    try {
      const response = await fetch(
        `/api/user/watchlist?id=${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) fetchWatchlist();
    } catch {
      fetchWatchlist();
    }
  };

  const visibleItems = watchlist.filter((w) => !w.isHidden);
  const hiddenItems = watchlist.filter((w) => w.isHidden);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full bg-card border-r border-border z-50 flex flex-col transition-all duration-300 ease-out",
          isOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full lg:w-0",
        )}
      >
        <div className={cn("flex flex-col h-full", !isOpen && "invisible")}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <Logo size={32} href="/" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* New Scan Button */}
          <div className="p-3">
            <Button
              onClick={onNewScan}
              className="w-full justify-center gap-2"
              variant="brand"
              size="default"
            >
              <Sparkles className="h-4 w-4" />
              New Scan
            </Button>
          </div>

          {/* Watchlist */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
            <p className="text-[11px] font-bold text-muted-foreground/70 px-2 py-2.5 uppercase tracking-widest">
              Watchlist
            </p>

            {!session ? (
              <div className="text-sm text-muted-foreground px-2 py-3">
                <Link
                  href="/login"
                  className="text-primary hover:underline font-medium"
                >
                  Log in
                </Link>{" "}
                to see your watchlist
              </div>
            ) : isLoading && watchlist.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : watchlist.length === 0 ? (
              <div className="text-sm text-muted-foreground/60 px-2 py-3">
                Stocks you scan are saved here so you can re-check them any
                time.
              </div>
            ) : (
              <>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <WatchlistRow
                      key={item.id}
                      item={item}
                      onRescan={handleRescan}
                      onToggleHidden={handleToggleHidden}
                      onRemove={handleRemove}
                    />
                  ))}
                </ul>

                {hiddenItems.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowHidden((v) => !v)}
                      className="flex items-center gap-1.5 w-full px-2.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 hover:text-foreground hover:bg-secondary transition-all duration-150"
                    >
                      {showHidden ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Hidden ({hiddenItems.length})
                    </button>
                    {showHidden && (
                      <ul className="space-y-0.5 opacity-70">
                        {hiddenItems.map((item) => (
                          <WatchlistRow
                            key={item.id}
                            item={item}
                            onRescan={handleRescan}
                            onToggleHidden={handleToggleHidden}
                            onRemove={handleRemove}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </nav>

          {/* Bottom Navigation */}
          <div className="border-t border-border/50 p-3 space-y-0.5">
            <p className="text-[11px] font-bold text-muted-foreground/70 px-2 py-1.5 uppercase tracking-widest">
              Navigation
            </p>

            {[
              { href: "/about", icon: Info, label: "About" },
              { href: "/news", icon: Newspaper, label: "News" },
              {
                href: "/how-it-works",
                icon: HelpCircle,
                label: "How It Works",
              },
              {
                href: "/help",
                icon: MessageCircleQuestion,
                label: "Help & FAQ",
              },
              { href: "/contact", icon: Mail, label: "Contact" },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href}>
                <button className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150">
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              </Link>
            ))}

            <div className="pt-2 mt-2 border-t border-border/50 space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground/70 px-2 py-1.5 uppercase tracking-widest">
                Legal
              </p>
              {[
                { href: "/disclaimer", icon: FileText, label: "Disclaimer" },
                { href: "/privacy", icon: Shield, label: "Privacy" },
                { href: "/terms", icon: Scale, label: "Terms" },
              ].map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href}>
                  <button className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150">
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                </Link>
              ))}
            </div>

            {session && (
              <div className="pt-3 mt-2 border-t border-border/50">
                <div className="flex items-center gap-3 px-2.5 py-2.5">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center border border-border bg-secondary">
                    <User className="h-4 w-4 text-teal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {session.user?.name || session.user?.email}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {session.user?.email}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 mt-1">
                  <Link href="/account" className="flex-1">
                    <button className="flex items-center justify-center gap-1.5 w-full px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150">
                      <Settings className="h-3.5 w-3.5" />
                      Settings
                    </button>
                  </Link>
                  <button
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 transition-all duration-150"
                    onClick={() => signOut({ callbackUrl: "/" })}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function WatchlistRow({
  item,
  onRescan,
  onToggleHidden,
  onRemove,
}: {
  item: WatchlistItem;
  onRescan: (item: WatchlistItem) => void;
  onToggleHidden: (item: WatchlistItem) => void;
  onRemove: (item: WatchlistItem) => void;
}) {
  const riskLevel = item.lastRiskLevel || "UNKNOWN";
  return (
    <li className="group relative flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl hover:bg-secondary transition-all duration-150">
      {/* Main hit area — re-runs the scan */}
      <button
        onClick={() => onRescan(item)}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        title={`Scan ${item.ticker} again`}
      >
        <div
          className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0",
            getRiskBg(riskLevel),
          )}
        >
          {getRiskIcon(riskLevel)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{item.ticker}</span>
            {item.lastRiskLevel && (
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  getRiskColor(riskLevel),
                )}
              >
                {item.lastRiskLevel}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
            {formatRelativeDate(item.lastScannedAt)}
            <RefreshCw className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
          </p>
        </div>
      </button>

      {/* Row actions: hide/unhide + remove. Always visible on touch screens
          (no hover), revealed on hover for pointer devices. */}
      <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden(item);
          }}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-border/60 transition-colors"
          title={item.isHidden ? "Unhide" : "Hide from watchlist"}
          aria-label={
            item.isHidden
              ? `Unhide ${item.ticker}`
              : `Hide ${item.ticker} from watchlist`
          }
        >
          {item.isHidden ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item);
          }}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove from watchlist"
          aria-label={`Remove ${item.ticker} from watchlist`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
      aria-label="Open sidebar"
    >
      <PanelLeft className="h-4.5 w-4.5" />
    </Button>
  );
}
