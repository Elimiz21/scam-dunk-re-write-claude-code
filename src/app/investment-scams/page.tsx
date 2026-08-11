import type { Metadata } from "next";
import Link from "next/link";
import { PageLayout } from "@/components/PageLayout";
import { AlertTriangle, Shield, CheckCircle, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Types of Investment Fraud: Complete Guide | ScamDunk",
  description:
    "Guide to investment fraud types: pump-and-dump schemes, penny stocks, and manipulation tactics. Identify red flags and protect your investments.",
  alternates: {
    canonical: "/investment-scams",
  },
  openGraph: {
    type: "article",
    url: `${siteUrl}/investment-scams`,
    title: "Types of Investment Fraud: Complete Guide",
    description:
      "Learn about pump-and-dump schemes, penny stock scams, and how to detect investment fraud red flags.",
    siteName: "ScamDunk",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Types of Investment Fraud: Complete Guide",
  description:
    "Comprehensive guide to identifying and understanding various investment scam types and manipulation tactics.",
  datePublished: "2024-01-15T00:00:00Z",
  dateModified: "2026-03-03T00:00:00Z",
  author: {
    "@type": "Organization",
    name: "ScamDunk",
  },
  mainEntity: {
    "@type": "CreativeWork",
    name: "Investment Fraud Detection Guide",
    description:
      "Educational resource for identifying investment scams and fraud schemes",
  },
};

export default function InvestmentScamsPage() {
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
                Types of investment fraud:{" "}
                <span className="text-brand-blue">a complete guide.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Understand the most common investment scams, how they work, and
                how to protect your portfolio from manipulation and fraud.
              </p>
            </div>

            {/* Content Sections */}
            <article className="max-w-none">
              <section className="mb-14">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Pump-and-dump schemes
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  A pump-and-dump scheme is a coordinated manipulation tactic
                  where promoters artificially inflate a stock&apos;s price (the
                  &quot;pump&quot;), then sell their shares (the
                  &quot;dump&quot;), leaving retail investors with losses.
                </p>
                <div className="rounded-xl border border-border bg-card p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    Red Flags to Watch
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "Unsolicited investment tips via email, social media, or group chats",
                      "Promises of guaranteed returns or insider information",
                      "Sudden and unexplained price spikes with high volume",
                      "Limited publicly available information about the company",
                      "Shares trading on penny stock exchanges or OTC markets",
                      "Aggressive marketing on Telegram, Discord, or Reddit groups",
                    ].map((flag, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <CheckCircle className="h-4 w-4 text-teal flex-shrink-0 mt-0.5" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Penny stock scams
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Penny stocks—shares trading below $5—are common targets for
                  manipulation due to low trading volumes and limited regulatory
                  oversight. Scammers exploit these characteristics to
                  artificially move prices.
                </p>
                <div className="rounded-xl border border-border bg-card p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    Why Penny Stocks Are Vulnerable
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "Low market capitalization makes prices easier to manipulate",
                      "Limited shares outstanding can lead to large price movements",
                      "Minimal trading liquidity means fewer buyers/sellers",
                      "Reduced SEC oversight compared to larger companies",
                      "Limited financial reporting requirements",
                    ].map((reason, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <Shield className="h-4 w-4 text-teal flex-shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Cold calling and social engineering
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Scammers use high-pressure sales tactics and false credentials
                  to build trust and convince investors to buy fraudulent
                  securities. These attacks often combine social engineering
                  with false claims.
                </p>
                <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-6 mb-6">
                  <p className="text-[15px] font-semibold text-foreground mb-3">
                    Typical Tactics:
                  </p>
                  <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                    {[
                      "Fake financial advisor credentials and broker licenses",
                      "Manufactured urgency ('Act now, this offer expires tonight')",
                      "Social proof claims ('Others have already made 300% returns')",
                      "Fake testimonials and fabricated success stories",
                    ].map((tactic, idx) => (
                      <li key={idx} className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                        <span>{tactic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  How ScamDunk can help
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  ScamDunk uses advanced data analysis to identify stocks
                  showing pump-and-dump characteristics, unusual volume
                  patterns, and market manipulation signals.
                </p>
                <Link href="/" className="btn-pill btn-pill-primary gap-2">
                  Scan a Stock Now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </section>
            </article>

            {/* Internal Links */}
            <section className="mt-16 pt-12 border-t border-border/70">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Keep Reading
              </p>
              <h2 className="font-editorial mt-3 mb-6 text-2xl md:text-3xl leading-tight text-foreground">
                Related resources
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/social-media-scams" className="group">
                  <div className="rounded-xl border border-border bg-card p-6 h-full transition-colors group-hover:border-foreground/30">
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">
                      Social Media Investment Scams
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Learn how scammers use Telegram, Discord, and Reddit to
                      promote fraudulent stocks.
                    </p>
                  </div>
                </Link>
                <Link href="/how-to-detect-stock-scams" className="group">
                  <div className="rounded-xl border border-border bg-card p-6 h-full transition-colors group-hover:border-foreground/30">
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">
                      How to Detect Stock Scams
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Step-by-step guide to identifying manipulation patterns
                      and red flags.
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* CTA Section */}
            <section className="mt-14 border-t border-border/70 pt-12 pb-4 text-center">
              <h2 className="font-editorial text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.15] text-foreground mb-4">
                Protect your investments{" "}
                <span className="text-brand-blue">today.</span>
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground mb-7">
                Use ScamDunk to analyze any stock and get instant risk
                assessment for pump-and-dump schemes, market manipulation, and
                other fraud patterns.
              </p>
              <Link href="/" className="btn-pill btn-pill-primary gap-2">
                Start Your Free Scan
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          </div>
        </main>
      </PageLayout>
    </div>
  );
}
