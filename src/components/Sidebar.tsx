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
  User,
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
  Sparkles,
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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full bg-card border-r border-border z-50 flex flex-col transition-all duration-300 ease-out",
          isOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full lg:w-0"
        )}
      >
        <div className={cn("flex flex-col h-full", !isOpen && "invisible")}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center">
                <Shield className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold tracking-tight">
                Scam<span className="gradient-brand-text">Dunk</span>
              </span>
            </Link>
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
              className="w-full justify-center gap-2 rounded-xl"
              variant="brand"
              size="default"
            >
              <Sparkles className="h-4 w-4" />
              New Scan
            </Button>
          </div>

          {/* Recent Scans */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
            <p className="text-[11px] font-bold text-muted-foreground/70 px-2 py-2.5 uppercase tracking-widest">
              Recent Scans
            </p>

            {!session ? (
              <div className="text-sm text-muted-foreground px-2 py-3">
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Log in
                </Link>{" "}
                to see scan history
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : recentScans.length === 0 ? (
              <div className="text-sm text-muted-foreground/60 px-2 py-3">
                No recent scans
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentScans.map((scan) => (
                  <button
                    key={scan.id}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl hover:bg-secondary transition-all duration-150 text-left group"
                    onClick={() => {
                      onToggle();
                    }}
                  >
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0", getRiskBg(scan.riskLevel))}>
                      {getRiskIcon(scan.riskLevel)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{scan.ticker}</span>
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider", getRiskColor(scan.riskLevel))}>
                          {scan.riskLevel}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60">
                        {formatDate(scan.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
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
              { href: "/how-it-works", icon: HelpCircle, label: "How It Works" },
              { href: "/help", icon: MessageCircleQuestion, label: "Help & FAQ" },
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
                  <div className="h-8 w-8 rounded-xl gradient-brand-subtle flex items-center justify-center border border-primary/10">
                    <User className="h-4 w-4 text-primary" />
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
