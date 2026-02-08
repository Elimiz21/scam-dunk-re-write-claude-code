"use client";

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
  Lock,
  Users,
} from "lucide-react";
import Link from "next/link";
import { AssetType } from "@/lib/types";

interface LandingOptionAProps {
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

export function LandingOptionA({ onSubmit, isLoading, disabled, error }: LandingOptionAProps) {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Hero Section — Full viewport, centered */}
      <section className="min-h-[85vh] flex flex-col items-center justify-center px-4 gradient-mesh relative">
        <div className="max-w-3xl mx-auto text-center">
          {/* Trust Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              Trusted by 10,000+ investors
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-6 animate-fade-in italic leading-tight">
            Don&apos;t invest blind.{" "}
            <span className="gradient-brand-text not-italic">
              Detect scams
            </span>{" "}
            before they cost you.
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Enter any stock or crypto ticker and get an instant risk analysis.
            We scan for pump-and-dump patterns, manipulation signals, and
            regulatory red flags in seconds.
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm max-w-md mx-auto text-center animate-fade-in">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}

          {/* ScanInput — THE Primary CTA */}
          <div className="w-full max-w-3xl mx-auto mb-8 animate-fade-in" style={{ animationDelay: "0.15s" }}>
            <ScanInput
              onSubmit={onSubmit}
              isLoading={isLoading}
              disabled={disabled}
            />
          </div>

          {/* Quick Try Buttons */}
          <div className="flex items-center justify-center gap-3 mb-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <span className="text-xs text-muted-foreground">Try it free:</span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5 px-4 hover:border-primary/30 hover:bg-primary/5"
              onClick={() => onSubmit({ ticker: "AAPL", assetType: "stock" })}
            >
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              AAPL
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5 px-4 hover:border-primary/30 hover:bg-primary/5"
              onClick={() => onSubmit({ ticker: "TSLA", assetType: "stock" })}
            >
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              TSLA
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5 px-4 hover:border-primary/30 hover:bg-primary/5"
              onClick={() => onSubmit({ ticker: "BTC", assetType: "crypto" })}
            >
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              BTC
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground animate-fade-in" style={{ animationDelay: "0.25s" }}>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              <span>Free to use</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              <span>No credit card needed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              <span>Results in seconds</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-10 px-4 bg-card border-y border-border">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: "$68B+", label: "Investment fraud losses in 2024", icon: AlertTriangle },
            { value: "300%", label: "Rise in crypto scams since 2020", icon: TrendingUp },
            { value: "10K+", label: "Stocks & crypto scanned", icon: BarChart3 },
            { value: "<15s", label: "Average scan time", icon: Zap },
          ].map((stat) => (
            <div key={stat.label} className="animate-fade-in">
              <stat.icon className="h-5 w-5 text-primary mx-auto mb-2" />
              <div className="stat-value gradient-brand-text">{stat.value}</div>
              <div className="stat-label mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works — 3 Steps */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              How <span className="font-display italic">ScamDunk</span> Protects You
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Three simple steps stand between you and potential financial disaster.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                icon: BarChart3,
                title: "Enter a Ticker",
                description:
                  "Type any stock symbol or crypto ticker. You can also paste a suspicious chat message or upload screenshots.",
                color: "text-blue-500",
                bg: "bg-blue-500/10",
              },
              {
                step: "02",
                icon: Brain,
                title: "AI Analyzes Risk",
                description:
                  "Our engine checks price patterns, volume anomalies, regulatory alerts, and promotional red flags in real time.",
                color: "text-primary",
                bg: "bg-primary/10",
              },
              {
                step: "03",
                icon: Shield,
                title: "Get Your Report",
                description:
                  "Receive a clear risk score with detailed breakdown: HIGH, MEDIUM, or LOW risk with specific signals explained.",
                color: "text-emerald-500",
                bg: "bg-emerald-500/10",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="card-interactive p-6 text-center group"
              >
                <div className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-widest">
                  Step {item.step}
                </div>
                <div
                  className={`h-12 w-12 rounded-xl ${item.bg} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}
                >
                  <item.icon className={`h-6 w-6 ${item.color}`} />
                </div>
                <h3 className="font-semibold text-base mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Detect */}
      <section className="py-16 px-4 gradient-brand-subtle">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              What We Scan For
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Our multi-layer analysis catches what manual research often misses.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: TrendingUp,
                title: "Pump-and-Dump Patterns",
                desc: "Detect sudden price spikes followed by crashes — the hallmark of manipulation schemes.",
                color: "text-emerald-500",
              },
              {
                icon: BarChart3,
                title: "Volume Anomalies",
                desc: "Flag unusual trading volume that may indicate coordinated buying or selling activity.",
                color: "text-blue-500",
              },
              {
                icon: AlertTriangle,
                title: "Regulatory Red Flags",
                desc: "Cross-reference SEC suspensions, enforcement actions, and known problem securities.",
                color: "text-red-500",
              },
              {
                icon: Eye,
                title: "Promotional Language Analysis",
                desc: "AI-powered detection of pressure tactics, guaranteed returns, and insider info claims.",
                color: "text-purple-500",
              },
            ].map((item) => (
              <div key={item.title} className="card-elevated p-5 flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center flex-shrink-0">
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center justify-center w-14 h-14 gradient-brand rounded-2xl mb-6 shadow-lg shadow-primary/25">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4 italic">
            Ready to protect your investments?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Join thousands of investors who check before they invest.
            It&apos;s free, fast, and could save you everything.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full gradient-brand text-white font-semibold hover:opacity-90 transition-smooth shadow-lg shadow-primary/25 text-base"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-smooth text-base"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
