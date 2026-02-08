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
  CheckCircle,
  XCircle,
  Users,
  Lock,
  MessageSquare,
  Upload,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { AssetType } from "@/lib/types";

interface LandingOptionCProps {
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

const scamStats = [
  "$4.6 billion lost to investment scams in 2023",
  "1 in 10 adults fall victim to fraud each year",
  "Crypto scams surged 183% since 2021",
  "Average victim loses $9,100 per incident",
];

export function LandingOptionC({ onSubmit, isLoading, disabled, error }: LandingOptionCProps) {
  const [activeStat, setActiveStat] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStat((prev) => (prev + 1) % scamStats.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Urgency Banner */}
      <div className="bg-destructive/10 border-b border-destructive/20 py-2.5 px-4 text-center">
        <p className="text-sm font-medium text-destructive animate-fade-in" key={activeStat}>
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          {scamStats[activeStat]}
        </p>
      </div>

      {/* Hero — Education-first, story-driven */}
      <section className="px-4 pt-12 pb-16 gradient-mesh">
        <div className="max-w-4xl mx-auto text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border mb-8 animate-fade-in">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              Free Investment Scam Detection Tool
            </span>
          </div>

          {/* Main Headline — Emotional, story-driven */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-6 animate-fade-in italic leading-tight">
            That &quot;guaranteed return&quot;?
            <br />
            <span className="gradient-brand-text not-italic">
              Let&apos;s fact-check it.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Every day, thousands of people receive unsolicited stock tips, crypto
            &quot;opportunities,&quot; and investment pitches. Most are harmless. Some are
            devastating scams.
          </p>

          <p className="text-base text-foreground font-semibold max-w-xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: "0.15s" }}>
            ScamDunk helps you tell the difference — in 15 seconds, for free.
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm max-w-md mx-auto text-center animate-fade-in">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}

          {/* ScanInput */}
          <div className="w-full max-w-3xl mx-auto mb-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <ScanInput
              onSubmit={onSubmit}
              isLoading={isLoading}
              disabled={disabled}
            />
          </div>

          {/* Helper Text */}
          <p className="text-xs text-muted-foreground mb-6 animate-fade-in" style={{ animationDelay: "0.25s" }}>
            Enter any stock ticker (AAPL, TSLA) or crypto symbol (BTC, ETH) to start.
            No credit card required.
          </p>

          {/* Quick scan row */}
          <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <span className="text-xs text-muted-foreground">Popular scans:</span>
            {[
              { ticker: "AAPL", type: "stock" as AssetType },
              { ticker: "TSLA", type: "stock" as AssetType },
              { ticker: "BTC", type: "crypto" as AssetType },
              { ticker: "ETH", type: "crypto" as AssetType },
            ].map((item) => (
              <button
                key={item.ticker}
                onClick={() => onSubmit({ ticker: item.ticker, assetType: item.type })}
                className="px-3 py-1 rounded-full bg-secondary hover:bg-secondary/80 text-xs font-mono font-medium transition-smooth"
              >
                {item.ticker}
              </button>
            ))}
          </div>

          {/* Scroll indicator */}
          <div className="animate-gentle-float">
            <ChevronDown className="h-5 w-5 text-muted-foreground mx-auto" />
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="py-16 px-4 bg-card border-y border-border">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4 italic">
                Investment scams are at an all-time high.
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Scammers use social media, messaging apps, and even AI to create
                convincing stock tips and crypto schemes. They target everyone
                from first-time investors to experienced traders.
              </p>
              <div className="space-y-3">
                {[
                  "Pump-and-dump schemes disguised as \"hot tips\"",
                  "Fake crypto projects with fabricated returns",
                  "Social media influencer scams",
                  "WhatsApp and Telegram investment groups",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { stat: "$68B", label: "Lost to fraud in 2024", bg: "bg-red-500/10", border: "border-red-500/20", color: "text-red-500" },
                { stat: "300%", label: "Rise in crypto scams", bg: "bg-amber-500/10", border: "border-amber-500/20", color: "text-amber-500" },
                { stat: "82%", label: "Victims are under 50", bg: "bg-blue-500/10", border: "border-blue-500/20", color: "text-blue-500" },
                { stat: "15s", label: "To check with ScamDunk", bg: "bg-emerald-500/10", border: "border-emerald-500/20", color: "text-emerald-500" },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`p-4 rounded-xl ${item.bg} border ${item.border} text-center`}
                >
                  <div className={`text-2xl font-bold ${item.color}`}>{item.stat}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The Solution — What ScamDunk Does */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              Your personal scam detective
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              ScamDunk runs a comprehensive 6-point analysis on any stock or cryptocurrency,
              giving you clear, actionable risk intelligence.
            </p>
          </div>

          {/* 3 Main Capabilities */}
          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              {
                icon: BarChart3,
                title: "Scan Any Ticker",
                desc: "Enter a stock or crypto symbol. We check market data, price patterns, volume, and structural risk factors.",
                color: "text-blue-500",
                bg: "bg-blue-500/10",
              },
              {
                icon: MessageSquare,
                title: "Analyze Suspicious Messages",
                desc: "Got a fishy text or DM? Paste it in and our AI detects pressure tactics, false promises, and manipulation language.",
                color: "text-purple-500",
                bg: "bg-purple-500/10",
              },
              {
                icon: Upload,
                title: "Upload Screenshots",
                desc: "Drop screenshots of suspicious messages. Our visual AI reads images and flags scam indicators automatically.",
                color: "text-amber-500",
                bg: "bg-amber-500/10",
              },
            ].map((item) => (
              <div key={item.title} className="card-interactive p-6 text-center group">
                <div
                  className={`h-14 w-14 rounded-2xl ${item.bg} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}
                >
                  <item.icon className={`h-7 w-7 ${item.color}`} />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Risk Level Explainer */}
          <div className="p-6 rounded-2xl card-elevated">
            <h3 className="font-display text-lg font-semibold mb-4 italic text-center">
              Clear Risk Ratings You Can Act On
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <div className="h-4 w-4 rounded-full bg-emerald-500 mx-auto mb-2" />
                <div className="font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                  LOW RISK
                </div>
                <p className="text-xs text-muted-foreground">
                  No obvious manipulation signals found. Standard due diligence still recommended.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <div className="h-4 w-4 rounded-full bg-amber-500 mx-auto mb-2" />
                <div className="font-bold text-amber-600 dark:text-amber-400 mb-1">
                  MEDIUM RISK
                </div>
                <p className="text-xs text-muted-foreground">
                  Some concerning signals detected. Research thoroughly before investing.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <div className="h-4 w-4 rounded-full bg-red-500 mx-auto mb-2" />
                <div className="font-bold text-red-600 dark:text-red-400 mb-1">
                  HIGH RISK
                </div>
                <p className="text-xs text-muted-foreground">
                  Multiple red flags detected. Exercise extreme caution — potential scam.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials / Social Proof */}
      <section className="py-16 px-4 gradient-brand-subtle">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              Real people, real saves
            </h2>
            <p className="text-muted-foreground">
              Hear from investors who checked before they invested.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                quote: "My friend kept pushing me to buy a penny stock. ScamDunk flagged it HIGH risk — it crashed 90% two weeks later.",
                name: "Sarah K.",
                detail: "Avoided $3,200 loss",
              },
              {
                quote: "I was about to put $5K into a crypto project from a Telegram group. ScamDunk showed it had every red flag in the book.",
                name: "Marcus T.",
                detail: "Avoided potential scam",
              },
              {
                quote: "I use ScamDunk before every trade now. The peace of mind alone is worth it — and it's free.",
                name: "Priya M.",
                detail: "Regular user since 2024",
              },
            ].map((item) => (
              <div key={item.name} className="card-elevated p-5">
                <div className="flex gap-0.5 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className="text-amber-500 text-sm">★</span>
                  ))}
                </div>
                <p className="text-sm leading-relaxed mb-4 italic">
                  &quot;{item.quote}&quot;
                </p>
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mini FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              Common questions
            </h2>
          </div>

          <div className="space-y-2">
            {[
              {
                q: "Is ScamDunk really free?",
                a: "Yes! You get 5 free scans per month. No credit card required to sign up. Upgrade to our paid plan for 200 scans/month if you need more.",
              },
              {
                q: "Can ScamDunk guarantee a stock isn't a scam?",
                a: "No tool can guarantee that. ScamDunk identifies known patterns of manipulation and red flags. A LOW risk score doesn't mean a stock is a good investment — it means we didn't detect obvious scam signals.",
              },
              {
                q: "What stocks and crypto can I scan?",
                a: "We cover all US-listed stocks (NYSE, NASDAQ, OTC Markets) and major cryptocurrencies. International stocks are not currently supported.",
              },
              {
                q: "How does the chat/screenshot analysis work?",
                a: "You can paste text from WhatsApp, Telegram, or email — or upload screenshots. Our AI analyzes the language for pressure tactics, guaranteed returns, insider info claims, and other scam indicators.",
              },
            ].map((item, i) => (
              <div key={i} className="card-elevated rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
                >
                  <span className="font-medium text-sm">{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 animate-fade-in">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — Emotional close */}
      <section className="py-20 px-4 gradient-mesh">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 gradient-brand rounded-2xl mb-6 shadow-lg shadow-primary/25 animate-gentle-float">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4 italic">
            The 15 seconds that could save your savings.
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-lg mx-auto">
            Next time someone sends you a &quot;can&apos;t miss&quot; investment,
            run it through ScamDunk first. It&apos;s free, private, and instant.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full gradient-brand text-white font-semibold hover:opacity-90 transition-smooth shadow-lg shadow-primary/25 text-base"
            >
              <Shield className="h-5 w-5" />
              Protect Yourself — It&apos;s Free
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              No credit card
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              Your data stays private
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              5 free scans/month
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
