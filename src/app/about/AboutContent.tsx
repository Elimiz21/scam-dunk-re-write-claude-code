"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CheckCircle, XCircle, ArrowRight } from "lucide-react";

export default function AboutContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewScan={() => {}}
      />

      <div className="flex flex-col min-h-screen">
        <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
            {/* Hero Section */}
            <div className="mb-14 md:mb-20">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                About
              </p>
              <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
                About <span className="text-brand-blue">ScamDunk</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Helping retail investors identify potential stock manipulation
                and pump-and-dump schemes through data-driven analysis.
              </p>
            </div>

            {/* Mission Section */}
            <section className="mb-14">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Our Mission
              </p>
              <h2 className="font-editorial mt-3 text-2xl md:text-3xl leading-tight text-foreground">
                Analytical tools shouldn&apos;t be limited to Wall Street.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                ScamDunk was created to help everyday investors protect
                themselves from stock manipulation schemes. We believe that
                access to analytical tools shouldn&apos;t be limited to Wall
                Street professionals. Our platform analyzes publicly available
                market data and identifies patterns commonly associated with
                pump-and-dump schemes, helping you make more informed decisions.
              </p>
            </section>

            {/* How Scans Work */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Methodology
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                How our scans work
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-2">
                    1. Market Data Analysis
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    We fetch real-time price, volume, and company data from
                    regulated financial data providers.
                  </p>
                </div>
                <div className="p-5 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-2">
                    2. Pattern Detection
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Our algorithms identify price spikes, volume anomalies, and
                    classic pump-and-dump signatures.
                  </p>
                </div>
                <div className="p-5 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-2">
                    3. Structural Assessment
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    We evaluate stock characteristics like market cap and
                    liquidity that affect manipulation risk.
                  </p>
                </div>
                <div className="p-5 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-2">
                    4. Behavioral Analysis
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    If you provide pitch text, we analyze it for manipulation
                    red-flag language patterns.
                  </p>
                </div>
              </div>

              <p className="mt-6 text-sm text-muted-foreground">
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center gap-1 font-medium text-foreground/80 hover:text-foreground"
                >
                  Learn more about our methodology
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </p>
            </section>

            {/* Coverage Section */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Coverage
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                What we cover, and what we don&apos;t
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    What We Cover
                  </h3>
                  <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-success mt-0.5">✓</span>
                      <span>
                        <strong className="text-foreground">US Stocks</strong> -
                        NYSE, NASDAQ, OTC Markets
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success mt-0.5">✓</span>
                      <span>
                        <strong className="text-foreground">
                          Real-time data
                        </strong>{" "}
                        - Current prices and volumes
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success mt-0.5">✓</span>
                      <span>
                        <strong className="text-foreground">
                          Historical patterns
                        </strong>{" "}
                        - 100 days of price history
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success mt-0.5">✓</span>
                      <span>
                        <strong className="text-foreground">SEC alerts</strong>{" "}
                        - Trading suspension lists
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    Not Currently Supported
                  </h3>
                  <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-destructive mt-0.5">✗</span>
                      <span>
                        <strong className="text-foreground">
                          International stocks
                        </strong>{" "}
                        - Non-US markets
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive mt-0.5">✗</span>
                      <span>
                        <strong className="text-foreground">
                          Cryptocurrencies
                        </strong>{" "}
                        - Digital assets
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive mt-0.5">✗</span>
                      <span>
                        <strong className="text-foreground">
                          Options &amp; Futures
                        </strong>{" "}
                        - Derivatives
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive mt-0.5">✗</span>
                      <span>
                        <strong className="text-foreground">
                          Bonds &amp; ETFs
                        </strong>{" "}
                        - Other instruments
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Results Explanation */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Results
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                Understanding results
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/5">
                  <h3 className="text-[15px] font-semibold text-red-600 dark:text-red-400 mb-1">
                    HIGH Risk
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Multiple significant red flags detected. Extreme caution
                    warranted. Does not confirm a scam, but risk profile is
                    elevated.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-yellow-500/25 bg-yellow-500/5">
                  <h3 className="text-[15px] font-semibold text-yellow-600 dark:text-yellow-400 mb-1">
                    MEDIUM Risk
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Some concerning signals detected. Additional research
                    recommended before any decisions.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-green-500/25 bg-green-500/5">
                  <h3 className="text-[15px] font-semibold text-green-600 dark:text-green-400 mb-1">
                    LOW Risk
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Few or no manipulation indicators. Does NOT mean the stock
                    is a good investment—only that obvious manipulation signals
                    were not detected.
                  </p>
                </div>
              </div>
            </section>

            {/* Data Sources */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Data
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                Our data sources
              </h2>

              <div className="p-5 rounded-xl border border-border bg-card">
                <ul className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Market Data:</strong>{" "}
                    Real-time and historical data from licensed financial data
                    providers
                  </li>
                  <li>
                    <strong className="text-foreground">Company Info:</strong>{" "}
                    Exchange listings, market cap, updated daily
                  </li>
                  <li>
                    <strong className="text-foreground">
                      Regulatory Data:
                    </strong>{" "}
                    SEC EDGAR feeds for trading suspensions
                  </li>
                </ul>
              </div>
            </section>

            {/* Important Links */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Reference
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                Important documents
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <Link
                  href="/disclaimer"
                  className="p-4 rounded-xl border border-border bg-card group flex items-center justify-between transition-colors hover:border-foreground/30"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      Disclaimer &amp; Limitations
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      What our scans cannot detect
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
                <Link
                  href="/how-it-works"
                  className="p-4 rounded-xl border border-border bg-card group flex items-center justify-between transition-colors hover:border-foreground/30"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      How It Works
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      Detailed methodology
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
                <Link
                  href="/privacy"
                  className="p-4 rounded-xl border border-border bg-card group flex items-center justify-between transition-colors hover:border-foreground/30"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      Privacy Policy
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      How we protect your data
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
                <Link
                  href="/terms"
                  className="p-4 rounded-xl border border-border bg-card group flex items-center justify-between transition-colors hover:border-foreground/30"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      Terms of Service
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      Usage rules and conditions
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              </div>
            </section>

            {/* Contact */}
            <div className="border-t border-border/70 pt-12 pb-4 text-center">
              <h2 className="font-editorial text-2xl md:text-3xl leading-tight text-foreground mb-2">
                Questions?
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                We&apos;d love to hear from you.
              </p>
              <Link
                href="/contact"
                className="btn-pill btn-pill-primary gap-2 text-sm"
              >
                Contact Support
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
