"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  Settings,
  LogOut,
  HelpCircle,
  Share2,
  ChevronDown,
  CreditCard,
  Info,
  FileText,
  Zap,
  History,
  LayoutDashboard,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarToggle } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { UsageInfo } from "@/lib/types";

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/news", label: "News" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/help", label: "Help & FAQ" },
  { href: "/contact", label: "Contact" },
];

interface HeaderProps {
  onSidebarToggle: () => void;
  usage?: UsageInfo | null;
  onShare?: () => void;
  showShare?: boolean;
}

export function Header({
  onSidebarToggle,
  usage,
  onShare,
  showShare,
}: HeaderProps) {
  const { data: session } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loadedUsage, setLoadedUsage] = useState<UsageInfo | null>(null);
  const effectiveUsage = usage ?? loadedUsage;

  useEffect(() => {
    if (!session?.user || usage) return;
    const controller = new AbortController();
    fetch("/api/user/usage", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setLoadedUsage((await response.json()) as UsageInfo);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to load usage", error);
        }
      });
    return () => controller.abort();
  }, [session?.user, usage]);

  const usagePercent = effectiveUsage?.scansLimitThisMonth
    ? Math.round((effectiveUsage.scansUsedThisMonth / effectiveUsage.scansLimitThisMonth) * 100)
    : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4">
        {/* Left side - Brand */}
        <div className="flex items-center gap-3">
          {session && <SidebarToggle onClick={onSidebarToggle} />}
          <Logo size={30} className="ml-1" priority />
        </div>

        {/* Alon's shell keeps the public navigation visible after login. */}
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[13px] font-medium text-foreground/70 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Center - Usage indicator */}
        {effectiveUsage && (
          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex items-center gap-2.5 rounded-full border border-border/70 bg-secondary/80 px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  {String(effectiveUsage.plan).replaceAll("_", " ")}
                </span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full gradient-brand transition-all duration-500"
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {effectiveUsage.scansUsedThisMonth}/{effectiveUsage.scansLimitThisMonth}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-1.5">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Share button */}
          {showShare && onShare && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              className="gap-2 rounded-xl text-muted-foreground hover:text-foreground"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          )}

          {/* User menu */}
          {session ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-secondary transition-smooth"
                aria-label="Open account menu"
                aria-expanded={showUserMenu}
                aria-controls="account-menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold uppercase text-background">
                  {(session.user?.name || session.user?.email || "U").slice(0, 1)}
                </span>
                <span className="hidden max-w-24 truncate text-[13px] font-medium sm:inline">
                  {session.user?.name || session.user?.email?.split("@")[0] || "User"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 hidden sm:block text-muted-foreground transition-transform duration-200",
                    showUserMenu && "rotate-180",
                  )}
                />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div id="account-menu" className="absolute right-0 top-full mt-2 w-60 p-2 rounded-2xl bg-card border border-border shadow-lg shadow-black/5 dark:shadow-black/20 z-50 animate-fade-in-scale">
                    <div className="px-3 py-2.5 border-b border-border mb-1.5">
                      <p className="font-semibold text-sm truncate">
                        {session.user?.name || "User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {session.user?.email}
                      </p>
                    </div>

                    <Link href="/dashboard">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                        Dashboard
                      </button>
                    </Link>

                    <Link href="/watchlist">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <ListChecks className="h-4 w-4 text-muted-foreground" />
                        Watchlist
                      </button>
                    </Link>

                    <Link href="/recent-scans">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <History className="h-4 w-4 text-muted-foreground" />
                        Recent scans
                      </button>
                    </Link>

                    <Link href="/account">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        Settings
                      </button>
                    </Link>

                    <Link href="/account">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        Subscription
                      </button>
                    </Link>

                    <Link href="/about">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <Info className="h-4 w-4 text-muted-foreground" />
                        About
                      </button>
                    </Link>

                    <Link href="/disclaimer">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Legal & Disclaimer
                      </button>
                    </Link>

                    <Link href="/help">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-secondary transition-smooth"
                      >
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        Help
                      </button>
                    </Link>

                    <div className="border-t border-border mt-1.5 pt-1.5">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          signOut({ callbackUrl: "/" });
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-smooth"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 ml-1">
              <Link
                href="/login"
                className="hidden text-[13px] font-medium text-foreground/70 hover:text-foreground md:inline-block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="btn-pill btn-pill-primary px-5 py-2 text-[13px]"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
