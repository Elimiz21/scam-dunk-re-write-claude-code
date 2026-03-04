import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Search, TrendingUp, AlertTriangle, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "How to Detect Stock Scams: Red Flags and Detection Guide | ScamDunk",
  description:
    "Learn how to identify stock manipulation red flags including pump-and-dump schemes, unusual volume spikes, and behavioral manipulation tactics.",
  alternates: {
    canonical: "/how-to-detect-stock-scams",
  },
  openGraph: {
    type: "article",
    url: `${siteUrl}/how-to-detect-stock-scams`,
    title: "How to Detect Stock Scams: Complete Detection Guide",
    description: "Red flags and patterns to identify pump-and-dump schemes and market manipulation.",
    siteName: "ScamDunk",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How to Detect Stock Scams: Red Flags and Detection Patterns",
  description: "Complete guide to identifying market manipulation, pump-and-dump schemes, and investment fraud.",
  datePublished: "2024-01-15T00:00:00Z",
  dateModified: "2026-03-03T00:00:00Z",
  author: {
    "@type": "Organization",
    name: "ScamDunk",
  },
};

export default function HowToDetectStockScamsPage() {
  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={articleSchema} />
      <Sidebar isOpen={false} onToggle={() => {}} onNewScan={() => {}} />
      <div className="flex flex-col min-h-screen">
        <Header onSidebarToggle={() => {}} />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
            {/* Hero Section */}
            <div className="mb-12 gradient-mesh rounded-2xl py-12 px-4 md:px-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 gradient-brand rounded-2xl mb-6 shadow-glow-sm">
                <Search className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 font-display">
                How to Detect Stock Scams
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                A step-by-step guide to identifying pump-and-dump schemes, manipulation patterns, and red flags that
                signal investment fraud.
              </p>
            </div>

            {/* Content Sections */}
            <article className="prose prose-neutral dark:prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Step 1: Research the Company Fundamentals</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Start with the basics. Legitimate companies maintain transparent financial records, clear business
                  models, and verifiable management teams.
                </p>
                <div className="card-elevated rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4">What to Check</h3>
                  <ul className="space-y-3">
                    {[
                      "SEC filings (10-K, 10-Q forms) on Edgar.sec.gov",
                      "Company website and contact information",
                      "Management team backgrounds and credentials",
                      "Business model clarity—can you explain what they sell?",
                      "Revenue history and growth trajectory",
                      "Industry position vs. competitors",
                    ].map((item, idx) => (
                      <li key={idx} className="flex gap-3">
                        <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Step 2: Analyze Trading Patterns</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Pump-and-dump schemes create distinctive patterns in price and volume. Legitimate stocks show
                  gradual, sustainable growth. Manipulated stocks show sudden, intense activity.
                </p>
                <div className="card-elevated rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Red Flag Patterns
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "300%+ price spike in days or weeks with high volume",
                      "Volume spikes with no corresponding company news",
                      "Price movements inversely correlated with market",
                      "Unusual after-hours trading activity",
                      "High short interest followed by aggressive promotion",
                      "Trading halts or SEC trading suspensions",
                    ].map((pattern, idx) => (
                      <li key={idx} className="flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                        <span>{pattern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Step 3: Evaluate Promotional Activity</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Scammers rely on aggressive marketing to drive up prices quickly. Watch for coordinated hype,
                  especially on social media.
                </p>
                <div className="card-elevated rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4">Hype vs. Legitimate News</h3>
                  <div className="space-y-4">
                    <div className="border-l-4 border-destructive/50 pl-4">
                      <p className="font-semibold text-sm mb-2">🚩 Scam Indicators</p>
                      <ul className="space-y-2 text-sm">
                        {[
                          "Unsolicited investment tips from strangers",
                          "Promises of 'guaranteed returns' or 'inside information'",
                          "Pressure to buy immediately ('limited time offer')",
                          "Same message repeated across multiple channels",
                          "No logical connection between news and stock price move",
                        ].map((indicator, idx) => (
                          <li key={idx}>• {indicator}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="border-l-4 border-success/50 pl-4">
                      <p className="font-semibold text-sm mb-2">✓ Legitimate News</p>
                      <ul className="space-y-2 text-sm">
                        {[
                          "Official press releases from company IR",
                          "News from major financial media outlets",
                          "SEC filing announcements",
                          "Earnings reports or strategic partnerships",
                          "Gradual price appreciation over time",
                        ].map((indicator, idx) => (
                          <li key={idx}>• {indicator}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Step 4: Check Regulatory Status</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  The SEC maintains lists of suspended securities and enforcement actions. Companies with regulatory
                  issues are high-risk.
                </p>
                <div className="bg-accent/10 border border-accent/20 rounded-xl p-6 mb-6">
                  <h3 className="text-lg font-semibold mb-4">Where to Check</h3>
                  <ul className="space-y-3">
                    {[
                      "SEC.gov Trading Suspensions — for halted companies",
                      "FINRA BrokerCheck — verify broker legitimacy",
                      "OTC Markets Group — check listing status",
                      "Company CIK number — find all SEC filings",
                    ].map((resource, idx) => (
                      <li key={idx} className="flex gap-3">
                        <Shield className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                        <span>{resource}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Step 5: Use Analytical Tools</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Advanced tools can automatically detect pump-and-dump signals, analyze behavioral patterns, and
                  calculate risk scores.
                </p>
                <Link href="/">
                  <Button size="lg" className="gap-2 mb-6">
                    <Shield className="h-5 w-5" />
                    Try ScamDunk's Analysis
                  </Button>
                </Link>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Quick Checklist: Is This Stock Safe?</h2>
                <div className="card-elevated rounded-xl p-8">
                  <div className="space-y-4">
                    {[
                      { q: "Does the company have clear, verifiable business information?", good: true },
                      { q: "Are SEC filings available and recent?", good: true },
                      { q: "Is the stock showing sudden, unexplained price spikes?", good: false },
                      { q: "Are you seeing coordinated hype on social media?", good: false },
                      { q: "Do promoters pressure you to buy immediately?", good: false },
                      { q: "Has the stock been trading for months with stable fundamentals?", good: true },
                      { q: "Are you getting tips from unknown people online?", good: false },
                      {
                        q: "Can you find independent, positive coverage in major financial media?",
                        good: true,
                      },
                    ].map((item, idx) => (
                      <div key={idx} className="flex gap-3 pb-4 border-b border-border last:border-b-0">
                        {item.good ? (
                          <CheckCircle className="h-6 w-6 text-success flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" />
                        )}
                        <span>{item.q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </article>

            {/* Internal Links */}
            <section className="mt-16 pt-12 border-t border-border">
              <h2 className="text-2xl font-bold mb-6">Learn More About Common Scams</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/investment-scams">
                  <div className="card-interactive rounded-lg p-6 h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <h3 className="font-semibold text-lg mb-2">Types of Investment Fraud</h3>
                    <p className="text-sm text-muted-foreground">
                      Deep dive into pump-and-dump schemes, penny stocks, and cold calling tactics.
                    </p>
                  </div>
                </Link>
                <Link href="/social-media-scams">
                  <div className="card-interactive rounded-lg p-6 h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <h3 className="font-semibold text-lg mb-2">Social Media Scams</h3>
                    <p className="text-sm text-muted-foreground">
                      How fraudsters use Telegram, Discord, and Reddit to recruit victims.
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* CTA Section */}
            <section className="mt-12 gradient-mesh rounded-2xl p-8 md:p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Let ScamDunk Do the Heavy Lifting</h2>
              <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
                Our AI-powered analysis scans for pump-and-dump signals, behavioral red flags, and market manipulation
                patterns instantly. Analyze any stock free.
              </p>
              <Link href="/">
                <Button size="lg" className="gap-2">
                  <Search className="h-5 w-5" />
                  Scan a Stock Now
                </Button>
              </Link>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
