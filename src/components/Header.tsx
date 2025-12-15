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
        {/* Left side */}
        <div className="flex items-center gap-2">
          <SidebarToggle onClick={onSidebarToggle} />
          <Link href="/" className="flex items-center gap-2 ml-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold hidden sm:inline">ScamDunk</span>
          </Link>
        </div>

        {/* Center - Usage indicator */}
        {usage && (
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="px-2 py-1 rounded-lg bg-secondary text-xs font-medium">
              {usage.plan}
            </span>
            <span>
              {usage.scansUsedThisMonth}/{usage.scansLimitThisMonth} scans
            </span>
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Share button */}
          {showShare && onShare && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              className="gap-2 rounded-xl"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          )}

          {/* User menu */}
          {status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : session ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-secondary transition-smooth"
              >
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <User className="h-4 w-4" />
                </div>
                <ChevronDown className="h-4 w-4 hidden sm:block" />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-56 p-2 rounded-xl bg-card border border-border shadow-lg z-50 animate-fade-in">
                    <div className="px-3 py-2 border-b border-border mb-2">
                      <p className="font-medium text-sm truncate">
                        {session.user?.name || "User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {session.user?.email}
                      </p>
                    </div>

                    <Link href="/account">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-smooth"
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </button>
                    </Link>

                    <Link href="/account">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-smooth"
                      >
                        <CreditCard className="h-4 w-4" />
                        Subscription
                      </button>
                    </Link>

                    <Link href="/about">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-smooth"
                      >
                        <Info className="h-4 w-4" />
                        About
                      </button>
                    </Link>

                    <Link href="/disclaimer">
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-smooth"
                      >
                        <FileText className="h-4 w-4" />
                        Legal & Disclaimer
                      </button>
                    </Link>

                    <a
                      href="https://github.com/anthropics/claude-code/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <button
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-smooth"
                      >
                        <HelpCircle className="h-4 w-4" />
                        Help
                      </button>
                    </a>

                    <div className="border-t border-border mt-2 pt-2">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          signOut({ callbackUrl: "/" });
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-smooth"
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
                <Button variant="ghost" size="sm" className="rounded-xl">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="rounded-xl">
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
