"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScanResultsLayout } from "@/components/ScanResultsLayout";
import { LoadingStepper, Step } from "@/components/LoadingStepper";
import { RiskResponse } from "@/lib/types";

/* ─── Mock Data ─── */

const MOCK_HIGH_RISK: RiskResponse = {
  riskLevel: "HIGH",
  totalScore: 78,
  signals: [
    { code: "MICROCAP_PRICE", category: "STRUCTURAL", description: "Penny stock under $5", weight: 15 },
    { code: "VOLUME_EXPLOSION", category: "PATTERN", description: "Volume 8x normal average", weight: 20 },
    { code: "SPIKE_7D", category: "PATTERN", description: "Price up 340% in 7 days", weight: 25 },
    { code: "UNSOLICITED", category: "BEHAVIORAL", description: "Unsolicited investment tip", weight: 10 },
  ],
  stockSummary: {
    ticker: "XYZQ",
    companyName: "XYZ Quantum Holdings Inc.",
    exchange: "OTC",
    lastPrice: 0.87,
    marketCap: 42000000,
    avgDollarVolume30d: 85000,
  },
  narrative: {
    header: "Multiple serious red flags detected. This stock shows classic pump-and-dump characteristics including a massive price spike, exploding volume, and penny stock structure traded on OTC markets.",
    stockRedFlags: [
      "Price spiked 340% in just 7 days with no clear catalyst — a hallmark of artificial price manipulation.",
      "Trading volume exploded to 8x the 30-day average, suggesting coordinated buying activity.",
      "Penny stock trading at $0.87 on OTC markets — the most common target for pump-and-dump schemes.",
      "Market cap of only $42M with extremely low liquidity makes this stock easy to manipulate.",
    ],
    behaviorRedFlags: [
      "This tip was received unsolicited — one of the top red flags for stock scams.",
      "Claims of guaranteed high returns were made, which is never legitimate in investing.",
    ],
    suggestions: [
      "Do NOT invest based on this tip. The pattern is highly consistent with pump-and-dump fraud.",
      "Report this to the SEC at sec.gov/tcr if you received this tip via email or social media.",
      "Check SEC EDGAR for any recent filings or trading suspensions on this ticker.",
      "If you already own shares, consider consulting a financial advisor about your options.",
    ],
    disclaimers: [
      "This analysis is for educational purposes only and does not constitute financial advice.",
      "Past patterns do not guarantee future behavior. Always do your own research.",
    ],
  },
  usage: { plan: "FREE", scansUsedThisMonth: 3, scansLimitThisMonth: 10, limitReached: false },
};

const MOCK_MEDIUM_RISK: RiskResponse = {
  riskLevel: "MEDIUM",
  totalScore: 42,
  signals: [
    { code: "SMALL_MARKET_CAP", category: "STRUCTURAL", description: "Market cap under $300M", weight: 8 },
    { code: "SPIKE_7D", category: "PATTERN", description: "Price up 28% in 7 days", weight: 12 },
    { code: "OVERBOUGHT_RSI", category: "PATTERN", description: "RSI above 70", weight: 10 },
  ],
  stockSummary: {
    ticker: "NRGV",
    companyName: "NovaTech Energy Corp",
    exchange: "NASDAQ",
    lastPrice: 12.45,
    marketCap: 280000000,
    avgDollarVolume30d: 3200000,
  },
  narrative: {
    header: "Some warning signs detected. While this stock trades on a major exchange, recent price activity and momentum indicators suggest caution is warranted before investing.",
    stockRedFlags: [
      "Price increased 28% in the past 7 days — a notable spike that warrants investigation into the cause.",
      "RSI indicator shows the stock is currently overbought, suggesting the price may have run up too quickly.",
      "Market cap of $280M places this in the small-cap range where manipulation is more feasible.",
    ],
    behaviorRedFlags: [
      "No behavioral red flags were identified in the pitch context provided.",
    ],
    suggestions: [
      "Research what's driving the recent price spike — look for legitimate news or earnings catalysts.",
      "Check the company's SEC filings for recent 10-K and 10-Q reports.",
      "Consider waiting for the RSI to normalize before making any investment decisions.",
      "Never invest more than you can afford to lose, especially in small-cap stocks.",
    ],
    disclaimers: [
      "This analysis is for educational purposes only and does not constitute financial advice.",
    ],
  },
  usage: { plan: "FREE", scansUsedThisMonth: 4, scansLimitThisMonth: 10, limitReached: false },
};

const MOCK_LOW_RISK: RiskResponse = {
  riskLevel: "LOW",
  totalScore: 8,
  signals: [],
  stockSummary: {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NASDAQ",
    lastPrice: 198.50,
    marketCap: 3080000000000,
    avgDollarVolume30d: 8500000000,
  },
  narrative: {
    header: "This is a well-established, large-cap company trading on a major exchange with high liquidity. Our scan found very few red flags associated with common investment scams.",
    stockRedFlags: [
      "No concerning price patterns or volume anomalies detected in recent trading activity.",
      "No pump-and-dump signals identified — this stock's market cap and volume make manipulation extremely difficult.",
    ],
    behaviorRedFlags: [
      "No behavioral red flags detected. No signs of unsolicited promotion or manipulation tactics.",
    ],
    suggestions: [
      "While scam risk appears low, always do your own fundamental research before investing.",
      "Review the company's latest earnings report and financial statements.",
      "Consider your overall portfolio allocation and investment timeline.",
    ],
    disclaimers: [
      "Low risk does not mean the stock is a good investment. This only indicates we found few scam-related red flags.",
    ],
  },
  usage: { plan: "FREE", scansUsedThisMonth: 5, scansLimitThisMonth: 10, limitReached: false },
};

/* ─── Mock Loading Steps (different states) ─── */

const STEPS_ALL_PENDING: Step[] = [
  { label: "Validating ticker symbol", status: "pending" },
  { label: "Fetching market data", status: "pending" },
  {
    label: "Running risk analysis", status: "pending",
    subSteps: [
      { label: "Analyzing price patterns", status: "pending" },
      { label: "Checking volume anomalies", status: "pending" },
      { label: "Scanning for pump-and-dump signals", status: "pending" },
    ],
  },
  { label: "Checking regulatory alerts", status: "pending" },
  { label: "Generating risk report", status: "pending" },
];

const STEPS_MID_PROGRESS: Step[] = [
  { label: "Validating ticker symbol", status: "complete", detail: "XYZQ is valid" },
  { label: "Fetching market data", status: "complete", detail: "Retrieved price history and company data" },
  {
    label: "Running risk analysis", status: "loading",
    subSteps: [
      { label: "Analyzing price patterns", status: "complete" },
      { label: "Checking volume anomalies", status: "loading" },
      { label: "Scanning for pump-and-dump signals", status: "pending" },
    ],
  },
  { label: "Checking regulatory alerts", status: "pending" },
  { label: "Generating risk report", status: "pending" },
];

const STEPS_NEAR_DONE: Step[] = [
  { label: "Validating ticker symbol", status: "complete", detail: "XYZQ is valid" },
  { label: "Fetching market data", status: "complete", detail: "Retrieved price history and company data" },
  {
    label: "Running risk analysis", status: "complete", detail: "Risk patterns analyzed",
    subSteps: [
      { label: "Analyzing price patterns", status: "complete" },
      { label: "Checking volume anomalies", status: "complete" },
      { label: "Scanning for pump-and-dump signals", status: "complete" },
    ],
  },
  { label: "Checking regulatory alerts", status: "complete", detail: "SEC and alert databases checked" },
  { label: "Generating risk report", status: "loading" },
];

/* ─── Tab descriptions ─── */

const TAB_DESCRIPTIONS: Record<string, { color: string; dotColor: string; bg: string; title: string; desc: string }> = {
  "results-high": {
    color: "text-red-600", dotColor: "bg-red-500", bg: "bg-red-500/5",
    title: "HIGH Risk — Full Split-Screen Layout",
    desc: "Red border on scorecard, red ticker text. Scorecard scrolls internally on left; info panels on right. Disclaimer bar fixed at bottom.",
  },
  "results-medium": {
    color: "text-amber-600", dotColor: "bg-amber-500", bg: "bg-amber-500/5",
    title: "MEDIUM Risk — Orange Border & Ticker",
    desc: "Orange-bordered scorecard, orange ticker text, glow effect. Hover over the right-side panels to see the info tooltips expand.",
  },
  "results-low": {
    color: "text-emerald-600", dotColor: "bg-emerald-500", bg: "bg-emerald-500/5",
    title: "LOW Risk — Green Border & Ticker",
    desc: "Green-bordered scorecard, green ticker text, green glow. Humorous tagline pairs show only during the scan, not on results.",
  },
  "results-no-chat": {
    color: "text-orange-600", dotColor: "bg-orange-500", bg: "bg-orange-500/5",
    title: "No Chat / Pitch Data Uploaded",
    desc: "Orangey-red warning boxes for 'Pitch & Behavior Patterns' and 'Social & Promotion Analysis' clearly indicate these sections were not analyzed because no data was provided.",
  },
};

/* ─── Preview Page ─── */

export default function DesignPreviewPage() {
  const [activeSection, setActiveSection] = useState<string>("results-high");

  const sections = [
    { id: "results-high", label: "HIGH Risk" },
    { id: "results-medium", label: "MEDIUM Risk" },
    { id: "results-low", label: "LOW Risk" },
    { id: "results-no-chat", label: "No Chat Data" },
    { id: "loading-states", label: "Loading Steps" },
  ];

  const isResultTab = activeSection.startsWith("results-");
  const tabMeta = TAB_DESCRIPTIONS[activeSection];

  const resultForTab: Record<string, { result: RiskResponse; hasChatData: boolean }> = {
    "results-high": { result: MOCK_HIGH_RISK, hasChatData: true },
    "results-medium": { result: MOCK_MEDIUM_RISK, hasChatData: true },
    "results-low": { result: MOCK_LOW_RISK, hasChatData: true },
    "results-no-chat": { result: MOCK_HIGH_RISK, hasChatData: false },
  };

  return (
    <div className={`bg-background ${isResultTab ? 'h-screen overflow-hidden flex flex-col' : 'min-h-screen'}`}>
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-lg z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sm">Scan Results Redesign Preview</span>
          </div>
          <Badge variant="outline" className="text-[10px]">No Auth Required</Badge>
        </div>
      </header>

      {/* Navigation tabs */}
      <div className="flex-shrink-0 border-b border-border bg-card/50 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto py-1.5 scrollbar-thin">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeSection === section.id
                    ? "gradient-brand text-white shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Result tabs — viewport-constrained like production */}
      {isResultTab && tabMeta && (
        <>
          {/* Brief description bar */}
          <div className={`flex-shrink-0 px-4 py-2 border-b border-border/50 ${tabMeta.bg}`}>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${tabMeta.dotColor}`} />
              {tabMeta.title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{tabMeta.desc}</p>
          </div>

          {/* ScanResultsLayout fills remaining viewport — scorecard scrolls internally */}
          <ScanResultsLayout
            result={resultForTab[activeSection].result}
            hasChatData={resultForTab[activeSection].hasChatData}
          />
        </>
      )}

      {/* Loading States tab — scrollable page */}
      {activeSection === "loading-states" && (
        <div className="animate-fade-in p-4 space-y-8 max-w-7xl mx-auto">
          <div className="px-4 py-3 border-b border-border/50">
            <h2 className="text-lg font-bold">Loading / Scan Steps</h2>
            <p className="text-sm text-muted-foreground mt-1">
              All steps visible from the start in fuzzy/dim text. They animate to green as completed.
              Tagline headline + subtext shown together, rotating every 4 seconds. Minimum 8-second scan.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* State 1: All pending */}
            <div className="space-y-3">
              <Badge variant="outline">Start — All Fuzzy</Badge>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-3">
                    <div className="h-2 w-2 rounded-full gradient-brand animate-pulse" />
                    <span className="text-xs font-semibold text-primary">Scanning</span>
                  </div>
                  <h3 className="font-display text-sm font-semibold italic">
                    Analyzing <span className="gradient-brand-text not-italic font-sans font-bold">XYZQ</span>
                  </h3>
                </div>
                <LoadingStepper
                  steps={STEPS_ALL_PENDING}
                  currentTip={`"Your uncle's stock tip? Yeah, let's check that." — No judgment, just data`}
                />
              </div>
            </div>

            {/* State 2: Mid-progress */}
            <div className="space-y-3">
              <Badge variant="outline">Mid-Scan — Partial Green</Badge>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-3">
                    <div className="h-2 w-2 rounded-full gradient-brand animate-pulse" />
                    <span className="text-xs font-semibold text-primary">Scanning</span>
                  </div>
                  <h3 className="font-display text-sm font-semibold italic">
                    Analyzing <span className="gradient-brand-text not-italic font-sans font-bold">XYZQ</span>
                  </h3>
                </div>
                <LoadingStepper
                  steps={STEPS_MID_PROGRESS}
                  currentTip={`"Scammers hate this one simple trick." — It's called doing your homework. We made it easy.`}
                />
              </div>
            </div>

            {/* State 3: Near complete */}
            <div className="space-y-3">
              <Badge variant="outline">Almost Done — Nearly All Green</Badge>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-3">
                    <div className="h-2 w-2 rounded-full gradient-brand animate-pulse" />
                    <span className="text-xs font-semibold text-primary">Scanning</span>
                  </div>
                  <h3 className="font-display text-sm font-semibold italic">
                    Analyzing <span className="gradient-brand-text not-italic font-sans font-bold">XYZQ</span>
                  </h3>
                </div>
                <LoadingStepper
                  steps={STEPS_NEAR_DONE}
                  currentTip={`"Before you YOLO, let's LOLO." — Look Out, Look Out for scam signals`}
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="p-6 rounded-xl border border-primary/20 bg-primary/5">
            <h3 className="font-semibold mb-3">Summary of All Changes</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[10px] font-bold">1</span>
                <span><strong>8-second minimum scan</strong> — Results held until at least 8 seconds have passed.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[10px] font-bold">2</span>
                <span><strong>Split-screen layout</strong> — Left 60%: scorecard (scrollable). Right 40%: info panels. No page scroll. Disclaimer bar pinned at bottom.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[10px] font-bold">3</span>
                <span><strong>Info panels with (i) hover</strong> — How it Works, What We Check, After the Test, Disclaimer & Terms.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[10px] font-bold">4</span>
                <span><strong>Tagline pairs (scan only)</strong> — Headline + subtext shown together during scan, rotating every 4 seconds. Not shown on results page.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[10px] font-bold">5</span>
                <span><strong>Fuzzy-to-green steps</strong> — All steps visible upfront in dim/blurred text, animate to green when done.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[10px] font-bold">6</span>
                <span><strong>Orangey-red missing data notices</strong> — When no pitch text or chat is uploaded, those sections show prominent orange-red warnings saying &quot;Not analyzed.&quot;</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[10px] font-bold">7</span>
                <span><strong>Risk-colored borders & ticker</strong> — Scorecard border and ticker text match risk level: green/orange/red.</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
