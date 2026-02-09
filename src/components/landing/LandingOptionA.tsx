"use client";

import { useState, useEffect } from "react";
import { ScanInput } from "@/components/ScanInput";
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
  Search,
  ChevronRight,
  Database,
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
  headline?: string;
  subheadline?: string;
}

const DEFAULT_HEADLINE = "Don\u2019t invest blind. Detect scams before they cost you.";
const DEFAULT_SUBHEADLINE = "Enter any stock or crypto ticker and get an instant risk analysis. We scan for pump-and-dump patterns, manipulation signals, and regulatory red flags in seconds.";

export function LandingOptionA({ onSubmit, isLoading, disabled, error, headline, subheadline }: LandingOptionAProps) {
  const heroHeadline = headline || DEFAULT_HEADLINE;
  const heroSubheadline = subheadline || DEFAULT_SUBHEADLINE;
  // Animated step cycling for "How ScamDunk Protects You"
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Hero Section — Full viewport, centered */}
      <section className="min-h-[85vh] flex flex-col items-center justify-center px-4 gradient-mesh relative">
        <div className="max-w-3xl mx-auto text-center">
          {/* Trust Badge — Updated */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              Over 30,000 scans performed
            </span>
          </div>

          {/* Main Headline — dynamic from admin */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-6 animate-fade-in italic leading-tight">
            {headline ? (
              heroHeadline
            ) : (
              <>
                Don&apos;t invest blind.{" "}
                <span className="gradient-brand-text not-italic">Detect scams</span>{" "}
                before they cost you.
              </>
            )}
          </h1>

          {/* Subheadline — dynamic from admin */}
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            {heroSubheadline}
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm max-w-md mx-auto text-center animate-fade-in">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}

          {/* ScanInput — Bold, highlighted, animated primary CTA */}
          <div
            className="w-full max-w-3xl mx-auto mb-8 animate-slide-up relative"
            style={{ animationDelay: "0.15s" }}
          >
            {/* Glowing border effect */}
            <div className="absolute -inset-1 rounded-3xl gradient-brand opacity-20 blur-lg animate-pulse" />
            <div className="relative p-5 rounded-2xl bg-card border-2 border-primary/30 shadow-xl shadow-primary/10">
              <p className="text-sm font-semibold text-foreground mb-3 flex items-center justify-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Enter a stock or crypto ticker to scan
              </p>
              <ScanInput
                onSubmit={onSubmit}
                isLoading={isLoading}
                disabled={disabled}
              />
            </div>
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
            { value: "30K+", label: "Scans performed", icon: BarChart3 },
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

      {/* How It Works — 3 Steps with animated indicator from Option B */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 italic">
              How <span className="font-display italic">ScamDunk</span> Protects You
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Three simple steps stand between you and potential financial disaster.
            </p>
          </div>

          {/* Animated step indicator from Option B */}
          <div className="flex items-center justify-center gap-3 mb-10">
            {[
              { icon: Search, label: "Enter ticker" },
              { icon: Brain, label: "AI analysis" },
              { icon: Shield, label: "Risk report" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-500 ${
                    i === activeStep
                      ? "gradient-brand text-white scale-110 shadow-lg shadow-primary/25"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <step.icon className="h-5 w-5" />
                </div>
                <span
                  className={`text-sm font-medium transition-colors duration-300 ${
                    i === activeStep ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
                {i < 2 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
                )}
              </div>
            ))}
          </div>

          {/* Step cards */}
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
            ].map((item, i) => (
              <div
                key={item.step}
                className={`card-interactive p-6 text-center group transition-all duration-500 ${
                  i === activeStep
                    ? "ring-2 ring-primary/30 shadow-lg scale-[1.02]"
                    : ""
                }`}
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

      {/* Six Layers of Protection — From Option B */}
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

      {/* Final CTA */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="relative inline-flex items-center justify-center w-14 h-14 gradient-brand rounded-2xl mb-6 shadow-lg shadow-primary/25">
            <Shield className="h-7 w-7 text-white" />
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
              <Eye className="h-2.5 w-2.5 text-white" />
            </div>
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
