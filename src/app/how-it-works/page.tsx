"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Shield,
  Zap,
  Database,
  Search,
  CheckCircle,
  XCircle,
  ArrowRight,
  Eye
} from "lucide-react";

export default function HowItWorksPage() {
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

        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Hero Section */}
            <div className="text-center mb-12 gradient-mesh rounded-2xl py-12 px-4 animate-fade-in">
              <div className="relative inline-flex items-center justify-center w-16 h-16 gradient-brand rounded-2xl mb-6 shadow-glow-sm">
                <Brain className="h-8 w-8 text-white" />
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
                  <Eye className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4 font-display italic">
                How <span className="font-display italic">ScamDunk</span> Works
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Our multi-step analysis helps identify potential stock manipulation patterns
                using market data and behavioral indicators.
              </p>
            </div>

            {/* Analysis Pipeline */}
            <section className="mb-12 animate-slide-up">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><Zap className="h-4 w-4 text-white" /></span>
                The Analysis Process
              </h2>

              <div className="space-y-4">
                {[
                  {
                    step: 1,
                    title: "Market Data Collection",
                    description: "We fetch real-time and historical market data including price, volume, market cap, and trading history for the stock you're analyzing.",
                    icon: Database,
                  },
                  {
                    step: 2,
                    title: "Pattern Detection",
                    description: "Our algorithms scan for price and volume patterns that are commonly associated with pump-and-dump schemes and other manipulation tactics.",
                    icon: TrendingUp,
                  },
                  {
                    step: 3,
                    title: "Structural Analysis",
                    description: "We evaluate characteristics that make stocks more vulnerable to manipulation, such as market size, trading liquidity, and exchange listing.",
                    icon: BarChart3,
                  },
                  {
                    step: 4,
                    title: "Behavioral Analysis",
                    description: "If you provide promotional text, we analyze it for red-flag language like guaranteed returns, urgency tactics, or claims of insider information.",
                    icon: Search,
                  },
                  {
                    step: 5,
                    title: "Regulatory Check",
                    description: "We cross-reference against SEC trading suspension lists and other regulatory databases for known problem securities.",
                    icon: Shield,
                  },
                  {
                    step: 6,
                    title: "Risk Assessment",
                    description: "All signals are combined into an overall risk score and classification, with a detailed breakdown of what was detected.",
                    icon: AlertTriangle,
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl card-interactive">
                    <div className="flex-shrink-0 w-10 h-10 gradient-brand text-white rounded-xl flex items-center justify-center font-semibold">
                      {item.step}
                    </div>
                    <div className="flex-grow">
                      <h3 className="font-medium mb-1 flex items-center gap-2">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Signal Categories */}
            <section className="mb-12 animate-slide-up delay-1">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><BarChart3 className="h-4 w-4 text-white" /></span>
                What We Analyze
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl card-interactive">
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="h-5 w-5 text-blue-500" />
                    <h3 className="font-medium">Structural Factors</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Stock characteristics that make them more vulnerable to manipulation:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Stock price levels (penny stocks)</li>
                    <li>• Market capitalization size</li>
                    <li>• Trading volume and liquidity</li>
                    <li>• Exchange listing type</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl card-interactive">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <h3 className="font-medium">Price & Volume Patterns</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Suspicious movements that may indicate manipulation:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Unusual price spikes</li>
                    <li>• Abnormal volume increases</li>
                    <li>• Pump-and-dump signatures</li>
                    <li>• Volatility anomalies</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl card-interactive">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <h3 className="font-medium">Regulatory Alerts</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Official warnings and regulatory actions:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• SEC trading suspensions</li>
                    <li>• Enforcement actions</li>
                    <li>• Regulatory warnings</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl card-interactive">
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="h-5 w-5 text-purple-500" />
                    <h3 className="font-medium">Behavioral Indicators</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Red flags in promotional language:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Guaranteed return promises</li>
                    <li>• Urgency and pressure tactics</li>
                    <li>• Claims of insider information</li>
                    <li>• Unsolicited contact patterns</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Risk Levels */}
            <section className="mb-12 animate-slide-up delay-2">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><Shield className="h-4 w-4 text-white" /></span>
                Understanding Risk Levels
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 risk-glow-high">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <h3 className="font-medium text-red-600 dark:text-red-400">HIGH Risk</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Multiple significant red flags detected. The stock shows strong indicators commonly
                    associated with manipulation schemes. Exercise extreme caution.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 risk-glow-medium">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <h3 className="font-medium text-yellow-600 dark:text-yellow-400">MEDIUM Risk</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Some concerning signals detected. The stock has characteristics that warrant
                    additional research before making any decisions.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 risk-glow-low">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <h3 className="font-medium text-green-600 dark:text-green-400">LOW Risk</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Few or no manipulation indicators detected. This does NOT mean the stock is a good
                    investment—only that obvious scam signals were not found.
                  </p>
                </div>
              </div>
            </section>

            {/* Important Limitations */}
            <section className="mb-12 animate-slide-up delay-3">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><AlertTriangle className="h-4 w-4 text-white" /></span>
                Important Limitations
              </h2>

              <div className="p-5 rounded-xl bg-destructive/10 border border-destructive/20">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium mb-2 flex items-center gap-2">
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
                    <p className="font-medium mb-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
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
            <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap animate-fade-in delay-4">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full gradient-brand text-white font-medium hover:opacity-90 transition-smooth shadow-glow-sm"
              >
                Try a Scan
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/disclaimer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-smooth"
              >
                Read Full Disclaimer
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border text-foreground font-medium hover:bg-secondary/50 transition-smooth"
              >
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
