import type { Metadata } from "next";
import Link from "next/link";
import { PageLayout } from "@/components/PageLayout";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Shield,
  ArrowRight,
} from "lucide-react";
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
    description:
      "Red flags and patterns to identify pump-and-dump schemes and market manipulation.",
    siteName: "ScamDunk",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How to Detect Stock Scams: Red Flags and Detection Patterns",
  description:
    "Complete guide to identifying market manipulation, pump-and-dump schemes, and investment fraud.",
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
      <PageLayout>
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
            {/* Hero Section */}
            <div className="mb-14 md:mb-20">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Guide
              </p>
              <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
                How to detect{" "}
                <span className="text-brand-blue">stock scams.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                A step-by-step guide to identifying pump-and-dump schemes,
                manipulation patterns, and red flags that signal investment
                fraud.
              </p>
            </div>

            {/* Content Sections */}
            <article className="max-w-none">
              <section className="mb-14">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Step 1: Research the company fundamentals
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Start with the basics. Legitimate companies maintain
                  transparent financial records, clear business models, and
                  verifiable management teams.
                </p>
                <div className="rounded-xl border border-border bg-card p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    What to Check
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "SEC filings (10-K, 10-Q forms) on Edgar.sec.gov",
                      "Company website and contact information",
                      "Management team backgrounds and credentials",
                      "Business model clarity—can you explain what they sell?",
                      "Revenue history and growth trajectory",
                      "Industry position vs. competitors",
                    ].map((item, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Step 2: Analyze trading patterns
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Pump-and-dump schemes create distinctive patterns in price and
                  volume. Legitimate stocks show gradual, sustainable growth.
                  Manipulated stocks show sudden, intense activity.
                </p>
                <div className="rounded-xl border border-border bg-card p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-teal" />
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
                      <li
                        key={idx}
                        className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                        <span>{pattern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Step 3: Evaluate promotional activity
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Scammers rely on aggressive marketing to drive up prices
                  quickly. Watch for coordinated hype, especially on social
                  media.
                </p>
                <div className="rounded-xl border border-border bg-card p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    Hype vs. Legitimate News
                  </h3>
                  <div className="space-y-4">
                    <div className="border-l-2 border-destructive/50 pl-4">
                      <p className="text-[13px] font-semibold text-foreground mb-2">
                        🚩 Scam Indicators
                      </p>
                      <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
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
                    <div className="border-l-2 border-success/50 pl-4">
                      <p className="text-[13px] font-semibold text-foreground mb-2">
                        ✓ Legitimate News
                      </p>
                      <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
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

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Step 4: Check regulatory status
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  The SEC maintains lists of suspended securities and
                  enforcement actions. Companies with regulatory issues are
                  high-risk.
                </p>
                <div className="rounded-xl border border-border bg-secondary/60 p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    Where to Check
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "SEC.gov Trading Suspensions — for halted companies",
                      "FINRA BrokerCheck — verify broker legitimacy",
                      "OTC Markets Group — check listing status",
                      "Company CIK number — find all SEC filings",
                    ].map((resource, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <Shield className="h-4 w-4 text-teal flex-shrink-0 mt-0.5" />
                        <span>{resource}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Step 5: Use analytical tools
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Advanced tools can automatically detect pump-and-dump signals,
                  analyze behavioral patterns, and calculate risk scores.
                </p>
                <Link href="/" className="btn-pill btn-pill-primary gap-2 mb-6">
                  Try ScamDunk&apos;s Analysis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-6 text-2xl md:text-3xl leading-tight text-foreground">
                  Quick checklist: is this stock safe?
                </h2>
                <div className="rounded-xl border border-border bg-card p-6 md:p-8">
                  <div className="space-y-4">
                    {[
                      {
                        q: "Does the company have clear, verifiable business information?",
                        good: true,
                      },
                      {
                        q: "Are SEC filings available and recent?",
                        good: true,
                      },
                      {
                        q: "Is the stock showing sudden, unexplained price spikes?",
                        good: false,
                      },
                      {
                        q: "Are you seeing coordinated hype on social media?",
                        good: false,
                      },
                      {
                        q: "Do promoters pressure you to buy immediately?",
                        good: false,
                      },
                      {
                        q: "Has the stock been trading for months with stable fundamentals?",
                        good: true,
                      },
                      {
                        q: "Are you getting tips from unknown people online?",
                        good: false,
                      },
                      {
                        q: "Can you find independent, positive coverage in major financial media?",
                        good: true,
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="flex gap-3 pb-4 border-b border-border/70 last:border-b-0 last:pb-0 text-sm leading-relaxed text-muted-foreground"
                      >
                        {item.good ? (
                          <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                        )}
                        <span>{item.q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </article>

            {/* Internal Links */}
            <section className="mt-16 pt-12 border-t border-border/70">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Keep Reading
              </p>
              <h2 className="font-editorial mt-3 mb-6 text-2xl md:text-3xl leading-tight text-foreground">
                Learn more about common scams
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/investment-scams" className="group">
                  <div className="rounded-xl border border-border bg-card p-6 h-full transition-colors group-hover:border-foreground/30">
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">
                      Types of Investment Fraud
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Deep dive into pump-and-dump schemes, penny stocks, and
                      cold calling tactics.
                    </p>
                  </div>
                </Link>
                <Link href="/social-media-scams" className="group">
                  <div className="rounded-xl border border-border bg-card p-6 h-full transition-colors group-hover:border-foreground/30">
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">
                      Social Media Scams
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      How fraudsters use Telegram, Discord, and Reddit to
                      recruit victims.
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* CTA Section */}
            <section className="mt-14 border-t border-border/70 pt-12 pb-4 text-center">
              <h2 className="font-editorial text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.15] text-foreground mb-4">
                Let ScamDunk do the{" "}
                <span className="text-brand-blue">heavy lifting.</span>
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground mb-7">
                Our AI-powered analysis scans for pump-and-dump signals,
                behavioral red flags, and market manipulation patterns
                instantly. Analyze any stock free.
              </p>
              <Link href="/" className="btn-pill btn-pill-primary gap-2">
                Scan a Stock Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          </div>
        </main>
      </PageLayout>
    </div>
  );
}
