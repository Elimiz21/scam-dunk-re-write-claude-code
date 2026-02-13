"use client";

import { useState, useEffect, useCallback } from "react";
import { RiskResponse } from "@/lib/types";
import { RiskCard } from "@/components/RiskCard";
import { taglines, Tagline } from "@/lib/taglines";
import {
  Info,
  Search,
  CheckSquare,
  ClipboardList,
  FileText,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ScanResultsLayoutProps {
  result: RiskResponse;
  hasChatData: boolean;
}

/* ─── Right-side info panel content ─── */

const INFO_PANELS = [
  {
    id: "how-it-works",
    icon: Search,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "How the Test Works",
    content:
      "ScamDunk analyzes your ticker using multiple layers of detection. We fetch real-time market data including price history, volume patterns, and company information. Our algorithms then scan for statistical anomalies, pump-and-dump patterns, and structural risk factors. If you provide chat messages or screenshots, our AI analyzes the language for manipulation tactics commonly used in investment scams. The final risk score combines all detected signals, weighted by severity.",
  },
  {
    id: "what-we-check",
    icon: CheckSquare,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    title: "What We Check & Don't Check",
    content:
      "We check: Price spike patterns, volume anomalies, market structure (exchange type, market cap, liquidity), pump-and-dump signals, regulatory alerts (SEC databases), and behavioral red flags in any chat or pitch you provide.\n\nWe don't check: Company fundamentals (revenue, earnings, growth), long-term investment potential, real-time insider trading, private or unlisted securities. We do not provide buy/sell recommendations or financial advice.",
  },
  {
    id: "after-test",
    icon: ClipboardList,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    title: "What to Do After the Test",
    content:
      "Low Risk — Few red flags found, but always do your own research before investing. Medium Risk — Exercise caution; verify claims independently and consider consulting a financial advisor. High Risk — Multiple warning signs detected; do not invest based on unsolicited tips. Always cross-reference with SEC filings (sec.gov), verify the source of any tip, and never invest more than you can afford to lose.",
  },
  {
    id: "disclaimer-terms",
    icon: FileText,
    iconBg: "bg-gray-500/10",
    iconColor: "text-gray-400",
    title: "Disclaimer & Terms",
    content:
      "ScamDunk is an educational tool designed to help identify potential investment scam patterns. Our analysis is automated and based on publicly available market data and pattern recognition. Results should not be considered definitive proof of fraud or safety. We are not a registered investment advisor. Past performance of our detection algorithms does not guarantee future accuracy. Always consult a licensed financial professional before making investment decisions.",
  },
];

/* ─── Info Panel Component with hover tooltip ─── */

function InfoPanel({
  panel,
}: {
  panel: (typeof INFO_PANELS)[number];
}) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = panel.icon;

  return (
    <div
      className="info-panel-card cursor-default"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
            panel.iconBg
          )}
        >
          <Icon className={cn("h-4 w-4", panel.iconColor)} />
        </div>
        <span className="text-sm font-medium text-foreground flex-1">
          {panel.title}
        </span>
        <div
          className={cn(
            "h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-200",
            isHovered
              ? "border-primary bg-primary/10"
              : "border-border bg-secondary/50"
          )}
        >
          <Info
            className={cn(
              "h-3 w-3 transition-colors duration-200",
              isHovered ? "text-primary" : "text-muted-foreground/50"
            )}
          />
        </div>
      </div>

      {/* Expandable content on hover */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          isHovered ? "max-h-96 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
        )}
      >
        <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line border-t border-border/50 pt-3">
          {panel.content}
        </div>
      </div>
    </div>
  );
}

/* ─── Rotating Tagline Component ─── */

function RotatingTaglines() {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * taglines.length)
  );
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setIsVisible(false);

      // After fade out, change tagline and fade in
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % taglines.length);
        setIsVisible(true);
      }, 400);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const current = taglines[currentIndex];

  return (
    <div className="tagline-area rounded-xl p-5 h-full flex flex-col items-center justify-center text-center">
      <div className="mb-2">
        <Shield className="h-5 w-5 text-primary/40 mx-auto" />
      </div>
      <div
        className={cn(
          "transition-all duration-400 ease-out",
          isVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2"
        )}
      >
        <p className="font-display text-base sm:text-lg font-semibold text-foreground/90 italic leading-snug mb-2">
          &ldquo;{current.headline}&rdquo;
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {current.subtext}
        </p>
      </div>
      {/* Dot indicators */}
      <div className="flex gap-1.5 mt-4">
        {taglines.slice(0, 5).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              currentIndex % 5 === i
                ? "w-4 bg-primary/60"
                : "w-1.5 bg-muted-foreground/20"
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Main Layout ─── */

export function ScanResultsLayout({ result, hasChatData }: ScanResultsLayoutProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Main content area — fills remaining viewport height */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 pb-2 min-h-0 max-w-7xl mx-auto w-full animate-slide-up">
        {/* Left side — 60%, split into scrollable scorecard + pinned taglines */}
        <div className="lg:w-3/5 flex flex-col gap-3 min-h-0">
          {/* Scorecard — scrollable area, takes remaining space */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
            <RiskCard result={result} hasChatData={hasChatData} />
          </div>

          {/* Rotating taglines — pinned at bottom of left column */}
          <div className="flex-shrink-0">
            <RotatingTaglines />
          </div>
        </div>

        {/* Right side — 40%, scrollable independently */}
        <div className="lg:w-2/5 flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="flex items-center gap-2 mb-1 flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-primary/60" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Learn More
            </h3>
          </div>
          {INFO_PANELS.map((panel) => (
            <InfoPanel key={panel.id} panel={panel} />
          ))}
        </div>
      </div>

      {/* Fixed disclaimer bar at bottom */}
      <div className="disclaimer-bar px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            <span className="font-medium">Disclaimer:</span> ScamDunk is not a financial advisor.
            This analysis does not constitute financial advice, investment advice, trading advice,
            or any other sort of advice. You should not treat any of the content as such.
            ScamDunk does not recommend that any asset should be bought, sold, or held by you.
            Do conduct your own due diligence and consult your financial advisor before making
            any investment decisions. ScamDunk is an educational tool only.
          </p>
        </div>
      </div>
    </div>
  );
}
