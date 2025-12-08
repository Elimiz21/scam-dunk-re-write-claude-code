"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  Shield,
  PanelLeftClose,
  PanelLeft,
  History,
  Settings,
  HelpCircle,
  LogOut,
  Plus,
  Search,
  User,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewScan: () => void;
}

export function Sidebar({ isOpen, onToggle, onNewScan }: SidebarProps) {
  const { data: session } = useSession();

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full bg-card border-r border-border z-50 flex flex-col transition-all duration-300 ease-out",
          isOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full lg:w-0"
        )}
      >
        <div className={cn("flex flex-col h-full", !isOpen && "invisible")}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Link href="/" className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-semibold">ScamDunk</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* New Scan Button */}
          <div className="p-3">
            <Button
              onClick={onNewScan}
              className="w-full justify-start gap-2 rounded-xl"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              New Scan
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-3 py-2">
              Recent Scans
            </p>
            <div className="text-sm text-muted-foreground px-3 py-2">
              No recent scans
            </div>
          </nav>

          {/* Bottom Menu */}
          <div className="border-t border-border p-3 space-y-1">
            <Link href="/account">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-xl h-10"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>
            <Link href="/account">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-xl h-10"
              >
                <CreditCard className="h-4 w-4" />
                Subscription
              </Button>
            </Link>
            <a
              href="https://github.com/anthropics/claude-code/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-xl h-10"
              >
                <HelpCircle className="h-4 w-4" />
                Help & FAQ
              </Button>
            </a>

            {session && (
              <div className="pt-2 border-t border-border mt-2">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {session.user?.name || session.user?.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {session.user?.email}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 rounded-xl h-10 text-destructive hover:text-destructive"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="h-10 w-10 rounded-xl"
    >
      <PanelLeft className="h-5 w-5" />
    </Button>
  );
}
