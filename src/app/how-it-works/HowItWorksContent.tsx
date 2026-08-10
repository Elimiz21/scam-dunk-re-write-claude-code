"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Shield,
  Database,
  Search,
  CheckCircle,
  XCircle,
  ArrowRight,
} from "lucide-react";

export default function HowItWorksContent() {
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
                Methodology
              </p>
              <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
                How <span className="text-brand-blue">ScamDunk</span> works
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Our multi-step analysis helps identify potential stock
                manipulation patterns using market data and behavioral
                indicators.
              </p>
            </div>

            {/* Analysis Pipeline */}
            <section className="mb-14">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Pipeline
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                The analysis process
              </h2>

              <ol className="space-y-4">
                {[
                  {
                    step: 1,
                    title: "Market Data Collection",
                    description:
                      "We fetch real-time and historical market data including price, volume, market cap, and trading history for the stock you're analyzing.",
                    icon: Database,
                  },
                  {
                    step: 2,
                    title: "Pattern Detection",
                    description:
                      "Our algorithms scan for price and volume patterns that are commonly associated with pump-and-dump schemes and other manipulation tactics.",
                    icon: TrendingUp,
                  },
                  {
                    step: 3,
                    title: "Structural Analysis",
                    description:
                      "We evaluate characteristics that make stocks more vulnerable to manipulation, such as market size, trading liquidity, and exchange listing.",
                    icon: BarChart3,
                  },
                  {
                    step: 4,
                    title: "Behavioral Analysis",
                    description:
                      "If you provide promotional text, we analyze it for red-flag language like guaranteed returns, urgency tactics, or claims of insider information.",
                    icon: Search,
                  },
                  {
                    step: 5,
                    title: "Regulatory Check",
                    description:
                      "We cross-reference against SEC trading suspension lists and other regulatory databases for known problem securities.",
                    icon: Shield,
                  },
                  {
                    step: 6,
                    title: "Risk Assessment",
                    description:
                      "All signals are combined into an overall risk score and classification, with a detailed breakdown of what was detected.",
                    icon: AlertTriangle,
                  },
                ].map((item) => (
                  <li
                    key={item.step}
                    className="flex gap-4 p-5 rounded-xl border border-border bg-card"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background font-editorial text-[15px] text-foreground">
                      {item.step}
                    </span>
                    <div className="flex-grow">
                      <h3 className="text-[15px] font-semibold text-foreground mb-1 flex items-center gap-2">
                        <item.icon className="h-4 w-4 text-teal" />
                        {item.title}
                      </h3>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Signal Categories */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Signals
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                What we analyze
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="h-4 w-4 text-teal" />
                    <h3 className="text-[15px] font-semibold text-foreground">
                      Structural Factors
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground mb-3">
                    Stock characteristics that make them more vulnerable to
                    manipulation:
                  </p>
                  <ul className="text-[13px] leading-relaxed text-muted-foreground space-y-1">
                    <li>• Stock price levels (penny stocks)</li>
                    <li>• Market capitalization size</li>
                    <li>• Trading volume and liquidity</li>
                    <li>• Exchange listing type</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-teal" />
                    <h3 className="text-[15px] font-semibold text-foreground">
                      Price &amp; Volume Patterns
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground mb-3">
                    Suspicious movements that may indicate manipulation:
                  </p>
                  <ul className="text-[13px] leading-relaxed text-muted-foreground space-y-1">
                    <li>• Unusual price spikes</li>
                    <li>• Abnormal volume increases</li>
                    <li>• Pump-and-dump signatures</li>
                    <li>• Volatility anomalies</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-teal" />
                    <h3 className="text-[15px] font-semibold text-foreground">
                      Regulatory Alerts
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground mb-3">
                    Official warnings and regulatory actions:
                  </p>
                  <ul className="text-[13px] leading-relaxed text-muted-foreground space-y-1">
                    <li>• SEC trading suspensions</li>
                    <li>• Enforcement actions</li>
                    <li>• Regulatory warnings</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="h-4 w-4 text-teal" />
                    <h3 className="text-[15px] font-semibold text-foreground">
                      Behavioral Indicators
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground mb-3">
                    Red flags in promotional language:
                  </p>
                  <ul className="text-[13px] leading-relaxed text-muted-foreground space-y-1">
                    <li>• Guaranteed return promises</li>
                    <li>• Urgency and pressure tactics</li>
                    <li>• Claims of insider information</li>
                    <li>• Unsolicited contact patterns</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Risk Levels */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Results
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                Understanding risk levels
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <h3 className="text-[15px] font-semibold text-red-600 dark:text-red-400">
                      HIGH Risk
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Multiple significant red flags detected. The stock shows
                    strong indicators commonly associated with manipulation
                    schemes. Exercise extreme caution.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-yellow-500/25 bg-yellow-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <h3 className="text-[15px] font-semibold text-yellow-600 dark:text-yellow-400">
                      MEDIUM Risk
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Some concerning signals detected. The stock has
                    characteristics that warrant additional research before
                    making any decisions.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-green-500/25 bg-green-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <h3 className="text-[15px] font-semibold text-green-600 dark:text-green-400">
                      LOW Risk
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Few or no manipulation indicators detected. This does NOT
                    mean the stock is a good investment—only that obvious scam
                    signals were not found.
                  </p>
                </div>
              </div>
            </section>

            {/* Important Limitations */}
            <section className="mb-14 border-t border-border/70 pt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Honesty
              </p>
              <h2 className="font-editorial mt-3 mb-8 text-2xl md:text-3xl leading-tight text-foreground">
                Important limitations
              </h2>

              <div className="p-5 rounded-xl border border-destructive/25 bg-destructive/5">
                <div className="grid md:grid-cols-2 gap-4 text-[13px] leading-relaxed">
                  <div>
                    <p className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      What we can&apos;t detect:
                    </p>
                    <ul className="text-muted-foreground space-y-1">
                      <li>• Financial statement fraud</li>
                      <li>• Sophisticated manipulation schemes</li>
                      <li>• Future stock performance</li>
                      <li>• Management integrity issues</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      What you should know:
                    </p>
                    <ul className="text-muted-foreground space-y-1">
                      <li>• US markets only (NYSE, NASDAQ, OTC)</li>
                      <li>• Data may be delayed</li>
                      <li>• False positives are possible</li>
                      <li>• Not financial advice</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap border-t border-border/70 pt-12 pb-4">
              <Link href="/" className="btn-pill btn-pill-primary gap-2">
                Try a Scan
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/disclaimer" className="btn-pill btn-pill-ghost">
                Read Full Disclaimer
              </Link>
              <Link href="/contact" className="btn-pill btn-pill-ghost">
                Contact Support
              </Link>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
