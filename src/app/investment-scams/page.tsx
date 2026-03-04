import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { AlertTriangle, TrendingUp, Shield, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    description: "Educational resource for identifying investment scams and fraud schemes",
  },
};

export default function InvestmentScamsPage() {
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
                <AlertTriangle className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 font-display">
                Types of Investment Fraud: Complete Guide
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Understand the most common investment scams, how they work, and how to protect your portfolio
                from manipulation and fraud.
              </p>
            </div>

            {/* Content Sections */}
            <article className="prose prose-neutral dark:prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Pump-and-Dump Schemes</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  A pump-and-dump scheme is a coordinated manipulation tactic where promoters artificially inflate a
                  stock's price (the "pump"), then sell their shares (the "dump"), leaving retail investors with losses.
                </p>
                <div className="card-elevated rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
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
                      <li key={idx} className="flex gap-3">
                        <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Penny Stock Scams</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Penny stocks—shares trading below $5—are common targets for manipulation due to low trading volumes
                  and limited regulatory oversight. Scammers exploit these characteristics to artificially move prices.
                </p>
                <div className="card-elevated rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4">Why Penny Stocks Are Vulnerable</h3>
                  <ul className="space-y-3">
                    {[
                      "Low market capitalization makes prices easier to manipulate",
                      "Limited shares outstanding can lead to large price movements",
                      "Minimal trading liquidity means fewer buyers/sellers",
                      "Reduced SEC oversight compared to larger companies",
                      "Limited financial reporting requirements",
                    ].map((reason, idx) => (
                      <li key={idx} className="flex gap-3">
                        <Shield className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Cold Calling and Social Engineering</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Scammers use high-pressure sales tactics and false credentials to build trust and convince investors
                  to buy fraudulent securities. These attacks often combine social engineering with false claims.
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 mb-6">
                  <p className="font-semibold mb-3">Typical Tactics:</p>
                  <ul className="space-y-2 text-sm">
                    {[
                      "Fake financial advisor credentials and broker licenses",
                      "Manufactured urgency ('Act now, this offer expires tonight')",
                      "Social proof claims ('Others have already made 300% returns')",
                      "Fake testimonials and fabricated success stories",
                    ].map((tactic, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="font-bold">•</span>
                        <span>{tactic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">How ScamDunk Can Help</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  ScamDunk uses advanced data analysis to identify stocks showing pump-and-dump characteristics,
                  unusual volume patterns, and market manipulation signals.
                </p>
                <Link href="/">
                  <Button size="lg" className="gap-2">
                    <Shield className="h-5 w-5" />
                    Scan a Stock Now
                  </Button>
                </Link>
              </section>
            </article>

            {/* Internal Links */}
            <section className="mt-16 pt-12 border-t border-border">
              <h2 className="text-2xl font-bold mb-6">Related Resources</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/social-media-scams">
                  <div className="card-interactive rounded-lg p-6 h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <h3 className="font-semibold text-lg mb-2">Social Media Investment Scams</h3>
                    <p className="text-sm text-muted-foreground">
                      Learn how scammers use Telegram, Discord, and Reddit to promote fraudulent stocks.
                    </p>
                  </div>
                </Link>
                <Link href="/how-to-detect-stock-scams">
                  <div className="card-interactive rounded-lg p-6 h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <h3 className="font-semibold text-lg mb-2">How to Detect Stock Scams</h3>
                    <p className="text-sm text-muted-foreground">
                      Step-by-step guide to identifying manipulation patterns and red flags.
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* CTA Section */}
            <section className="mt-12 gradient-mesh rounded-2xl p-8 md:p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Protect Your Investments Today</h2>
              <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
                Use ScamDunk to analyze any stock and get instant risk assessment for pump-and-dump schemes,
                market manipulation, and other fraud patterns.
              </p>
              <Link href="/">
                <Button size="lg" className="gap-2">
                  <Shield className="h-5 w-5" />
                  Start Your Free Scan
                </Button>
              </Link>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
