"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  User,
  Settings,
  LogOut,
  HelpCircle,
  Share2,
  ChevronDown,
  CreditCard,
  Info,
  FileText,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarToggle } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { UsageInfo } from "@/lib/types";

const NAV_LINKS = [
  { href: "/about", label: "About" },
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
  const { data: session, status } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const usagePercent = usage
    ? Math.round((usage.scansUsedThisMonth / usage.scansLimitThisMonth) * 100)
    : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="flex items-center justify-between px-4 h-16 max-w-6xl mx-auto">
        {/* Left side - Brand */}
        <div className="flex items-center gap-3">
          {session && <SidebarToggle onClick={onSidebarToggle} />}
          <Logo size={40} className="ml-1" priority />
        </div>

        {/* Center - Marketing nav (logged-out only) */}
        {!session && status !== "loading" && (
          <nav className="hidden items-center gap-8 lg:flex">
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
        )}

        {/* Center - Usage indicator */}
        {usage && (
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-secondary/80 border border-border/50">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  {usage.plan}
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
                  {usage.scansUsedThisMonth}/{usage.scansLimitThisMonth}
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
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-secondary transition-smooth"
              >
                <div className="h-8 w-8 rounded-xl gradient-brand-subtle flex items-center justify-center border border-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
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
                  <div className="absolute right-0 top-full mt-2 w-60 p-2 rounded-2xl bg-card border border-border shadow-lg shadow-black/5 dark:shadow-black/20 z-50 animate-fade-in-scale">
                    <div className="px-3 py-2.5 border-b border-border mb-1.5">
                      <p className="font-semibold text-sm truncate">
                        {session.user?.name || "User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {session.user?.email}
                      </p>
                    </div>

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
