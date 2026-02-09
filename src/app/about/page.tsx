"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  Globe,
  BarChart3,
  Database,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Eye
} from "lucide-react";

export default function AboutPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewScan={() => {}}
      />

      <div className="flex flex-col min-h-screen">
        <Header
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Hero Section */}
            <div className="text-center mb-12 gradient-mesh rounded-2xl py-12 px-4 animate-fade-in">
              <div className="relative inline-flex items-center justify-center w-16 h-16 gradient-brand rounded-2xl mb-6 shadow-glow-sm">
                <Shield className="h-8 w-8 text-white" />
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
                  <Eye className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4 font-display italic">
                About <span className="font-display italic">ScamDunk</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Helping retail investors identify potential stock manipulation and pump-and-dump
                schemes through data-driven analysis.
              </p>
            </div>

            {/* Mission Section */}
            <section className="mb-12 animate-slide-up">
              <div className="p-6 rounded-xl card-elevated">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2 font-display italic">
                  <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><Shield className="h-4 w-4 text-white" /></span>
                  Our Mission
                </h2>
                <p className="text-muted-foreground">
                  ScamDunk was created to help everyday investors protect themselves from stock manipulation
                  schemes. We believe that access to analytical tools shouldn&apos;t be limited to Wall Street
                  professionals. Our platform analyzes publicly available market data and identifies patterns
                  commonly associated with pump-and-dump schemes, helping you make more informed decisions.
                </p>
              </div>
            </section>

            {/* How Scans Work */}
            <section className="mb-12 animate-slide-up delay-1">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><BarChart3 className="h-4 w-4 text-white" /></span>
                How Our Scans Work
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl card-interactive">
                  <h3 className="font-medium mb-2">1. Market Data Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    We fetch real-time price, volume, and company data from regulated financial data providers.
                  </p>
                </div>
                <div className="p-5 rounded-xl card-interactive">
                  <h3 className="font-medium mb-2">2. Pattern Detection</h3>
                  <p className="text-sm text-muted-foreground">
                    Our algorithms identify price spikes, volume anomalies, and classic pump-and-dump signatures.
                  </p>
                </div>
                <div className="p-5 rounded-xl card-interactive">
                  <h3 className="font-medium mb-2">3. Structural Assessment</h3>
                  <p className="text-sm text-muted-foreground">
                    We evaluate stock characteristics like market cap and liquidity that affect manipulation risk.
                  </p>
                </div>
                <div className="p-5 rounded-xl card-interactive">
                  <h3 className="font-medium mb-2">4. Behavioral Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    If you provide pitch text, we analyze it for manipulation red-flag language patterns.
                  </p>
                </div>
              </div>

              <div className="mt-4 text-center">
                <Link
                  href="/how-it-works"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  Learn more about our methodology
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </section>

            {/* Coverage Section */}
            <section className="mb-12 animate-slide-up delay-2">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><Globe className="h-4 w-4 text-white" /></span>
                Coverage
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl card-elevated">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    What We Cover
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span><strong>US Stocks</strong> - NYSE, NASDAQ, OTC Markets</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span><strong>Real-time data</strong> - Current prices and volumes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span><strong>Historical patterns</strong> - 100 days of price history</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span><strong>SEC alerts</strong> - Trading suspension lists</span>
                    </li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl card-elevated">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Not Currently Supported
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span><strong>International stocks</strong> - Non-US markets</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span><strong>Cryptocurrencies</strong> - Digital assets</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span><strong>Options & Futures</strong> - Derivatives</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span><strong>Bonds & ETFs</strong> - Other instruments</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Results Explanation */}
            <section className="mb-12 animate-slide-up delay-3">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><AlertTriangle className="h-4 w-4 text-white" /></span>
                Understanding Results
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 risk-glow-high">
                  <h3 className="font-medium text-red-600 dark:text-red-400 mb-1">HIGH Risk</h3>
                  <p className="text-sm text-muted-foreground">
                    Multiple significant red flags detected. Extreme caution warranted. Does not confirm
                    a scam, but risk profile is elevated.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 risk-glow-medium">
                  <h3 className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">MEDIUM Risk</h3>
                  <p className="text-sm text-muted-foreground">
                    Some concerning signals detected. Additional research recommended before any decisions.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 risk-glow-low">
                  <h3 className="font-medium text-green-600 dark:text-green-400 mb-1">LOW Risk</h3>
                  <p className="text-sm text-muted-foreground">
                    Few or no manipulation indicators. Does NOT mean the stock is a good investment—only
                    that obvious manipulation signals were not detected.
                  </p>
                </div>
              </div>
            </section>

            {/* Data Sources */}
            <section className="mb-12 animate-fade-in delay-4">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><Database className="h-4 w-4 text-white" /></span>
                Our Data Sources
              </h2>

              <div className="p-5 rounded-xl card-elevated">
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><strong>Market Data:</strong> Real-time and historical data from licensed financial data providers</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><strong>Company Info:</strong> Exchange listings, market cap, updated daily</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><strong>Regulatory Data:</strong> SEC EDGAR feeds for trading suspensions</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Important Links */}
            <section className="mb-8 animate-fade-in delay-5">
              <h2 className="text-xl font-semibold mb-4 font-display italic">Important Documents</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <Link href="/disclaimer" className="p-4 rounded-xl card-interactive group flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-primary transition-smooth">Disclaimer & Limitations</h3>
                    <p className="text-sm text-muted-foreground">What our scans cannot detect</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
                </Link>
                <Link href="/how-it-works" className="p-4 rounded-xl card-interactive group flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-primary transition-smooth">How It Works</h3>
                    <p className="text-sm text-muted-foreground">Detailed methodology</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
                </Link>
                <Link href="/privacy" className="p-4 rounded-xl card-interactive group flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-primary transition-smooth">Privacy Policy</h3>
                    <p className="text-sm text-muted-foreground">How we protect your data</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
                </Link>
                <Link href="/terms" className="p-4 rounded-xl card-interactive group flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-primary transition-smooth">Terms of Service</h3>
                    <p className="text-sm text-muted-foreground">Usage rules and conditions</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
                </Link>
              </div>
            </section>

            {/* Contact */}
            <div className="text-center p-6 rounded-xl card-elevated animate-fade-in">
              <h2 className="font-semibold mb-2 font-display italic">Questions?</h2>
              <p className="text-sm text-muted-foreground mb-3">
                We&apos;d love to hear from you.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full gradient-brand text-white font-medium hover:opacity-90 transition-smooth text-sm shadow-glow-sm"
              >
                <ArrowRight className="h-4 w-4" />
                Contact Support
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
