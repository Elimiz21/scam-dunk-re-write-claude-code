"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  Shield,
  User,
  Settings,
  LogOut,
  HelpCircle,
  Share2,
  ChevronDown,
  CreditCard,
  Loader2,
  Info,
  FileText,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarToggle } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";
import { UsageInfo } from "@/lib/types";

interface HeaderProps {
  onSidebarToggle: () => void;
  usage?: UsageInfo | null;
  onShare?: () => void;
  showShare?: boolean;
}

export function Header({ onSidebarToggle, usage, onShare, showShare }: HeaderProps) {
  const { data: session, status } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const usagePercent = usage
    ? Math.round((usage.scansUsedThisMonth / usage.scansLimitThisMonth) * 100)
    : 0;

  return (
    <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
      <div className="flex items-center justify-between px-4 h-16">
        {/* Left side - Brand */}
        <div className="flex items-center gap-3">
          <SidebarToggle onClick={onSidebarToggle} />
          <Link href="/" className="flex items-center gap-2.5 ml-1 group">
            <div className="h-8 w-8 rounded-xl gradient-brand flex items-center justify-center shadow-sm shadow-primary/20 group-hover:shadow-md group-hover:shadow-primary/30 transition-all duration-200">
              <Shield className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg hidden sm:inline tracking-tight">
              Scam<span className="gradient-brand-text">Dunk</span>
            </span>
          </Link>
        </div>

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
          {/* About */}
          <Link href="/about">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
              aria-label="About"
            >
              <Info className="h-4.5 w-4.5" />
            </Button>
          </Link>

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
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : session ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-secondary transition-smooth"
              >
                <div className="h-8 w-8 rounded-xl gradient-brand-subtle flex items-center justify-center border border-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <ChevronDown className={cn(
                  "h-3.5 w-3.5 hidden sm:block text-muted-foreground transition-transform duration-200",
                  showUserMenu && "rotate-180"
                )} />
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
            <div className="flex items-center gap-2 ml-1">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="rounded-xl font-semibold">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="brand" size="sm" className="rounded-xl">
                  Sign up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
