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

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left side - Brand */}
        <div className="flex items-center gap-3">
          <SidebarToggle onClick={onSidebarToggle} />
          <Link href="/" className="flex items-center gap-2 ml-1 group">
            <div className="h-7 w-7 rounded-md gradient-brand flex items-center justify-center group-hover:shadow-glow transition-all duration-150">
              <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-mono text-sm font-bold hidden sm:inline tracking-tight">
              SCAM<span className="gradient-brand-text">DUNK</span>
            </span>
          </Link>
        </div>

        {/* Center - Usage indicator */}
        {usage && (
          <div className="hidden md:flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary border border-border">
              <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-primary">
                {usage.plan}
              </span>
              <div className="w-px h-3 bg-border" />
              <span className="text-xs font-mono text-muted-foreground tabular-nums">
                {usage.scansUsedThisMonth}/{usage.scansLimitThisMonth}
              </span>
            </div>
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-1.5">
          {/* About button */}
          <Link href="/about">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md"
              aria-label="About"
            >
              <Info className="h-4 w-4" />
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
              className="gap-1.5 rounded-md font-mono"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">SHARE</span>
            </Button>
          )}

          {/* User menu */}
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : session ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 rounded-md hover:bg-secondary transition-smooth"
              >
                <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <ChevronDown className="h-3 w-3 hidden sm:block text-muted-foreground" />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-56 p-1.5 rounded-lg bg-card border border-border shadow-lg z-50 animate-fade-in">
                    <div className="px-3 py-2 border-b border-border mb-1.5">
                      <p className="font-semibold text-sm truncate">
                        {session.user?.name || "User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {session.user?.email}
                      </p>
                    </div>

                    <Link href="/account">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-secondary transition-smooth"
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </button>
                    </Link>

                    <Link href="/account">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-secondary transition-smooth"
                      >
                        <CreditCard className="h-4 w-4" />
                        Subscription
                      </button>
                    </Link>

                    <Link href="/about">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-secondary transition-smooth"
                      >
                        <Info className="h-4 w-4" />
                        About
                      </button>
                    </Link>

                    <Link href="/disclaimer">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-secondary transition-smooth"
                      >
                        <FileText className="h-4 w-4" />
                        Legal & Disclaimer
                      </button>
                    </Link>

                    <Link href="/help">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-secondary transition-smooth"
                      >
                        <HelpCircle className="h-4 w-4" />
                        Help
                      </button>
                    </Link>

                    <div className="border-t border-border mt-1.5 pt-1.5">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          signOut({ callbackUrl: "/" });
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-smooth"
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
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="rounded-md font-mono text-xs">
                  LOG IN
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="rounded-md font-mono text-xs">
                  SIGN UP
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
