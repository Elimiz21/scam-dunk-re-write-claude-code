"use client";

import { useState, useEffect } from "react";
import { ScanInput } from "@/components/ScanInput";
import { Button } from "@/components/ui/button";
import {
  Shield,
  TrendingUp,
  Zap,
  ArrowRight,
  BarChart3,
  AlertTriangle,
  Brain,
  Eye,
  ChevronRight,
  Search,
  CheckCircle,
  Database,
} from "lucide-react";
import Link from "next/link";
import { AssetType } from "@/lib/types";

interface LandingOptionBProps {
  onSubmit: (data: {
    ticker: string;
    assetType: AssetType;
    pitchText?: string;
    context?: {
      unsolicited: boolean;
      promisesHighReturns: boolean;
      urgencyPressure: boolean;
      secrecyInsideInfo: boolean;
    };
  }) => void;
  isLoading: boolean;
  disabled?: boolean;
  error?: string;
}

const recentScans = [
  { ticker: "AAPL", risk: "LOW", color: "text-emerald-500" },
  { ticker: "TSLA", risk: "LOW", color: "text-emerald-500" },
  { ticker: "NVDA", risk: "LOW", color: "text-emerald-500" },
  { ticker: "BTC", risk: "LOW", color: "text-emerald-500" },
  { ticker: "MULN", risk: "HIGH", color: "text-red-500" },
  { ticker: "ETH", risk: "LOW", color: "text-emerald-500" },
  { ticker: "BBIG", risk: "HIGH", color: "text-red-500" },
  { ticker: "GME", risk: "MEDIUM", color: "text-amber-500" },
  { ticker: "AMC", risk: "MEDIUM", color: "text-amber-500" },
  { ticker: "DOGE", risk: "MEDIUM", color: "text-amber-500" },
  { ticker: "SHIB", risk: "HIGH", color: "text-red-500" },
  { ticker: "SOL", risk: "LOW", color: "text-emerald-500" },
];

export function LandingOptionB({ onSubmit, isLoading, disabled, error }: LandingOptionBProps) {
  const [activeStep, setActiveStep] = useState(0);

  // Animate steps in sequence
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Hero — Bold, Revolut-inspired with oversized type */}
      <section className="relative px-4 pt-8 pb-16 gradient-mesh">
        <div className="max-w-5xl mx-auto">
          {/* Two-column layout on desktop */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <div className="h-2 w-2 rounded-full gradient-brand animate-pulse" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Live Protection
                </span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 italic leading-[1.1]">
                Someone just sent you a{" "}
                <span className="gradient-brand-text not-italic">&quot;hot stock tip.&quot;</span>
              </h1>

              <p className="text-lg text-muted-foreground mb-8 max-w-lg">
                Before you invest a single dollar, let ScamDunk check it.
                We analyze market data, price patterns, and red flags to tell
                you if it&apos;s legit — or a scam.
              </p>

              {/* Mini process indicator */}
              <div className="flex items-center gap-3 mb-8">
                {[
                  { icon: Search, label: "Enter ticker" },
                  { icon: Brain, label: "AI analysis" },
                  { icon: Shield, label: "Risk report" },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-500 ${
                        i === activeStep
                          ? "gradient-brand text-white scale-110"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      <step.icon className="h-4 w-4" />
                    </div>
                    <span
                      className={`text-xs font-medium transition-colors duration-300 ${
                        i === activeStep ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                    {i < 2 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground mx-1" />
                    )}
                  </div>
                ))}
              </div>

              {/* Trust row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  100% free
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-500" />
                  15-second scan
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-emerald-500" />
                  No financial data stored
                </div>
              </div>
            </div>

            {/* Right: ScanInput + Demo Area */}
            <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
              {/* Error message */}
              {error && (
                <div className="mb-4 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center animate-fade-in">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  {error}
                </div>
              )}

              {/* ScanInput as demo panel */}
              <div className="p-6 rounded-2xl card-elevated">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    scamdunk.com
                  </span>
                </div>
                <ScanInput
                  onSubmit={onSubmit}
                  isLoading={isLoading}
                  disabled={disabled}
                />
              </div>

              {/* Quick scan buttons */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="text-xs text-muted-foreground">Quick scan:</span>
                {[
                  { ticker: "AAPL", type: "stock" as AssetType, color: "text-emerald-500" },
                  { ticker: "TSLA", type: "stock" as AssetType, color: "text-blue-500" },
                  { ticker: "BTC", type: "crypto" as AssetType, color: "text-amber-500" },
                ].map((item) => (
                  <button
                    key={item.ticker}
                    onClick={() => onSubmit({ ticker: item.ticker, assetType: item.type })}
                    className="px-3 py-1 rounded-full bg-secondary hover:bg-secondary/80 text-xs font-medium transition-smooth"
                  >
                    {item.ticker}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Scan Ticker */}
      <section className="py-4 border-y border-border bg-card overflow-hidden">
        <div className="relative">
          <div className="animate-ticker flex gap-6 whitespace-nowrap">
            {[...recentScans, ...recentScans].map((scan, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-mono font-semibold">{scan.ticker}</span>
                <span className={`text-xs font-bold ${scan.color}`}>
                  {scan.risk}
                </span>
                <span className="text-muted-foreground/30">|</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Numbers */}
      <section className="py-14 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { value: "50,000+", label: "Scans completed", icon: BarChart3 },
              { value: "2,400+", label: "Scams detected", icon: AlertTriangle },
              { value: "10,000+", label: "Investors protected", icon: Shield },
            ].map((stat) => (
              <div key={stat.label} className="animate-fade-in">
                <stat.icon className="h-5 w-5 text-primary mx-auto mb-2" />
                <div className="text-2xl sm:text-3xl font-bold gradient-brand-text">
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Breakdown — Bold Cards */}
      <section className="py-16 px-4 gradient-brand-subtle">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              Six layers of protection
            </h2>
            <p className="text-muted-foreground">
              Every scan runs through our complete analysis pipeline.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Database,
                title: "Market Data Check",
                desc: "Real-time price, volume, market cap, and exchange verification.",
                color: "text-blue-500",
                borderColor: "border-blue-500/20",
              },
              {
                icon: TrendingUp,
                title: "Pattern Detection",
                desc: "Algorithmic scan for pump-and-dump signatures and price manipulation.",
                color: "text-emerald-500",
                borderColor: "border-emerald-500/20",
              },
              {
                icon: BarChart3,
                title: "Volume Analysis",
                desc: "Detect abnormal trading volume that signals coordinated activity.",
                color: "text-purple-500",
                borderColor: "border-purple-500/20",
              },
              {
                icon: AlertTriangle,
                title: "Regulatory Alerts",
                desc: "Cross-check SEC suspensions, enforcement actions, and warnings.",
                color: "text-red-500",
                borderColor: "border-red-500/20",
              },
              {
                icon: Eye,
                title: "Behavioral Analysis",
                desc: "AI reads promotional text for pressure tactics and false promises.",
                color: "text-amber-500",
                borderColor: "border-amber-500/20",
              },
              {
                icon: Brain,
                title: "Risk Scoring",
                desc: "All signals combined into a clear HIGH, MEDIUM, or LOW rating.",
                color: "text-primary",
                borderColor: "border-primary/20",
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`card-elevated p-5 border-l-4 ${item.borderColor} hover:translate-y-[-2px] transition-all duration-300`}
              >
                <item.icon className={`h-5 w-5 ${item.color} mb-3`} />
                <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              Built for moments like these
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                scenario: "Your coworker says \"You HAVE to buy this stock\"",
                action: "Paste the ticker and get an instant risk check",
                emoji: "💬",
              },
              {
                scenario: "A Telegram group is pushing a penny stock",
                action: "Scan for pump-and-dump patterns before the dump",
                emoji: "📱",
              },
              {
                scenario: "You see a \"guaranteed 500% return\" ad",
                action: "Upload the screenshot for AI red flag analysis",
                emoji: "🚩",
              },
              {
                scenario: "A stranger DMs you about a crypto \"opportunity\"",
                action: "Check the token and flag the red flag indicators",
                emoji: "⚠️",
              },
            ].map((item) => (
              <div
                key={item.scenario}
                className="card-interactive p-5 group"
              >
                <div className="text-2xl mb-3">{item.emoji}</div>
                <p className="font-medium text-sm mb-2 italic">
                  &quot;{item.scenario}&quot;
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-primary" />
                  {item.action}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 px-4 gradient-mesh">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4 italic">
            Check it before you wreck it.
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Every great investor does their homework. ScamDunk makes it effortless.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full gradient-brand text-white font-semibold hover:opacity-90 transition-smooth shadow-lg shadow-primary/25 text-base"
            >
              Start Scanning Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-smooth text-base"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
