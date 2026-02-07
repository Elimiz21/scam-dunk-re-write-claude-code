"use client";

import { useState, useEffect } from "react";
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
  TrendingUp,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScanHistoryItem {
  id: string;
  ticker: string;
  assetType: string;
  riskLevel: string;
  totalScore: number;
  createdAt: string;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewScan: () => void;
}

function getRiskIcon(riskLevel: string) {
  switch (riskLevel) {
    case "LOW":
      return <CheckCircle className="h-3 w-3 text-emerald-400" />;
    case "MEDIUM":
      return <AlertCircle className="h-3 w-3 text-amber-400" />;
    case "HIGH":
      return <AlertTriangle className="h-3 w-3 text-red-400" />;
    default:
      return <HelpIcon className="h-3 w-3 text-gray-500" />;
  }
}

function getRiskColor(riskLevel: string) {
  switch (riskLevel) {
    case "LOW":
      return "text-emerald-500 dark:text-emerald-400";
    case "MEDIUM":
      return "text-amber-500 dark:text-amber-400";
    case "HIGH":
      return "text-red-500 dark:text-red-400";
    default:
      return "text-gray-500 dark:text-gray-400";
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

export function Sidebar({ isOpen, onToggle, onNewScan }: SidebarProps) {
  const { data: session } = useSession();
  const [recentScans, setRecentScans] = useState<ScanHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session?.user && isOpen) {
      fetchRecentScans();
    }
  }, [session, isOpen]);

  const fetchRecentScans = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/scans?limit=10");
      if (response.ok) {
        const data = await response.json();
        setRecentScans(data.scans || []);
      }
    } catch (err) {
      console.error("Failed to fetch recent scans:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full bg-card border-r border-border z-50 flex flex-col transition-all duration-250 ease-out",
          isOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full lg:w-0"
        )}
      >
        <div className={cn("flex flex-col h-full", !isOpen && "invisible")}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md gradient-brand flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="font-mono text-sm font-bold tracking-tight">
                SCAM<span className="gradient-brand-text">DUNK</span>
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 rounded-md"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* New Scan Button */}
          <div className="p-3">
            <Button
              onClick={onNewScan}
              className="w-full justify-start gap-2 rounded-md font-mono text-xs"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              NEW SCAN
            </Button>
          </div>

          {/* Navigation - Recent Scans */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
            <p className="text-[10px] font-bold font-mono text-primary/60 px-3 py-2 flex items-center gap-2 uppercase tracking-widest">
              <History className="h-3 w-3" />
              // RECENT
            </p>

            {!session ? (
              <div className="text-sm text-muted-foreground px-3 py-2">
                <Link href="/login" className="text-primary hover:underline font-mono text-xs">
                  LOG IN
                </Link>{" "}
                to see scan history
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            ) : recentScans.length === 0 ? (
              <div className="text-sm text-muted-foreground px-3 py-2 font-mono text-xs">
                No recent scans
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentScans.map((scan) => (
                  <button
                    key={scan.id}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-secondary transition-colors text-left"
                    onClick={() => {
                      onToggle();
                    }}
                  >
                    {getRiskIcon(scan.riskLevel)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{scan.ticker}</span>
                        <span className={cn("text-xs font-mono", getRiskColor(scan.riskLevel))}>
                          {scan.riskLevel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {formatDate(scan.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </nav>

          {/* Bottom Menu */}
          <div className="border-t border-border p-3 space-y-0.5">
            {/* Information Section */}
            <p className="text-[10px] font-bold font-mono text-primary/60 px-3 py-2 uppercase tracking-widest">
              // INFO
            </p>
            <Link href="/about">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <Info className="h-4 w-4" />
                About
              </Button>
            </Link>
            <Link href="/news">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <Newspaper className="h-4 w-4" />
                News
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <HelpCircle className="h-4 w-4" />
                How It Works
              </Button>
            </Link>
            <Link href="/help">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <MessageCircleQuestion className="h-4 w-4" />
                Help & FAQ
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <Mail className="h-4 w-4" />
                Contact Us
              </Button>
            </Link>

            {/* Legal Section */}
            <p className="text-[10px] font-bold font-mono text-primary/60 px-3 py-2 mt-2 uppercase tracking-widest">
              // LEGAL
            </p>
            <Link href="/disclaimer">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <FileText className="h-4 w-4" />
                Disclaimer
              </Button>
            </Link>
            <Link href="/privacy">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <Shield className="h-4 w-4" />
                Privacy Policy
              </Button>
            </Link>
            <Link href="/terms">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <Scale className="h-4 w-4" />
                Terms of Service
              </Button>
            </Link>

            {/* Account Section */}
            <p className="text-[10px] font-bold font-mono text-primary/60 px-3 py-2 mt-2 uppercase tracking-widest">
              // ACCOUNT
            </p>
            <Link href="/account">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-md h-9 text-sm"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>

            {session && (
              <div className="pt-2 border-t border-border mt-2">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {session.user?.name || session.user?.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-mono">
                      {session.user?.email}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 rounded-md h-9 text-sm text-destructive hover:text-destructive"
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
      className="h-9 w-9 rounded-md"
      aria-label="Open sidebar"
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  );
}
