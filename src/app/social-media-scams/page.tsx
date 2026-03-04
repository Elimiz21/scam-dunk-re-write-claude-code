import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MessageCircle, AlertTriangle, Shield, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Social Media Investment Scams: Telegram, Discord, Reddit | ScamDunk",
  description:
    "How scammers use social media platforms like Telegram, Discord, and Reddit to promote pump-and-dump schemes. Learn to identify and avoid these scams.",
  alternates: {
    canonical: "/social-media-scams",
  },
  openGraph: {
    type: "article",
    url: `${siteUrl}/social-media-scams`,
    title: "Social Media Investment Scams Guide",
    description:
      "Comprehensive guide to identifying investment fraud schemes promoted on Telegram, Discord, and Reddit.",
    siteName: "ScamDunk",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Social Media Investment Scams: How to Protect Yourself",
  description: "Complete guide to identifying investment scams promoted on social media platforms.",
  datePublished: "2024-01-15T00:00:00Z",
  dateModified: "2026-03-03T00:00:00Z",
  author: {
    "@type": "Organization",
    name: "ScamDunk",
  },
};

export default function SocialMediaScamsPage() {
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
                <MessageCircle className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 font-display">
                Social Media Investment Scams
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Learn how fraudsters use Telegram, Discord, and Reddit to recruit victims into pump-and-dump schemes
                and other investment fraud.
              </p>
            </div>

            {/* Content Sections */}
            <article className="prose prose-neutral dark:prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Telegram Pump-and-Dump Groups</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Telegram is a favorite platform for pump-and-dump coordinators because of its encrypted messaging,
                  large group sizes, and ease of anonymity. Scammers create "signal groups" to coordinate buys and dumps.
                </p>
                <div className="card-elevated rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4">Common Telegram Scam Tactics</h3>
                  <ul className="space-y-3">
                    {[
                      "Free 'premium' group invitations to build trust",
                      "Promised access to 'insider picks' or early alerts",
                      "Admin claims of past successful 'calls' (pumps)",
                      "Fake testimonials with screenshots of returns",
                      "Sudden alert to buy a stock at a specific time (the pump)",
                      "Instructions to sell 'for profit' a few hours or days later",
                    ].map((tactic, idx) => (
                      <li key={idx} className="flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        <span>{tactic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Discord Servers and Investment Communities</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Discord's server structure enables scammers to create large, organized communities around fraudulent
                  "investment opportunities." These servers mimic legitimate trading communities.
                </p>
                <div className="card-elevated rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4">Discord Scam Red Flags</h3>
                  <ul className="space-y-3">
                    {[
                      "Servers with elaborate branding and fake 'analyst' bios",
                      "Subscription or membership fees for 'verified' trading signals",
                      "Bots that post stock 'alerts' with manufactured urgency",
                      "Testimonials pinned in channels claiming 1000%+ returns",
                      "Private channels for 'VIP members' with exclusive picks",
                      "Heavy moderation preventing questions or criticism",
                    ].map((flag, idx) => (
                      <li key={idx} className="flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Reddit and Discussion Boards</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Subreddits like r/wallstreetbets have made Reddit a target for pump-and-dump coordination. Scammers
                  create fake accounts and post coordinated "due diligence" to drive attention to penny stocks.
                </p>
                <div className="bg-warning/10 border border-warning/20 rounded-xl p-6 mb-6">
                  <h3 className="text-lg font-semibold mb-4">How Scammers Use Reddit</h3>
                  <ul className="space-y-2 text-sm">
                    {[
                      "Buying established Reddit accounts to appear legitimate",
                      "Posting fake 'research' and due diligence on penny stocks",
                      "Crossposting to multiple subreddits to maximize visibility",
                      "Using throwaway accounts to create artificial agreement",
                      "Timing posts to coordinate with price movements",
                    ].map((method, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="font-bold">•</span>
                        <span>{method}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">Protection Strategies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="card-elevated rounded-lg p-6">
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-success" />
                      Do This
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {[
                        "Verify company fundamentals independently",
                        "Use ScamDunk to check for pump-and-dump signals",
                        "Research the people promoting the stock",
                        "Check SEC filings and regulatory status",
                      ].map((item, idx) => (
                        <li key={idx} className="flex gap-2">
                          <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="card-elevated rounded-lg p-6 bg-destructive/5">
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Avoid This
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {[
                        "Buying based on social media hype alone",
                        "Trusting unverified 'gurus' or analysts",
                        "Rushing to buy before FOMO takes over",
                        "Sending money to private accounts",
                      ].map((item, idx) => (
                        <li key={idx} className="flex gap-2">
                          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold mb-6">How ScamDunk Helps</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  ScamDunk analyzes any stock to identify pump-and-dump characteristics, unusual trading patterns, and
                  manipulation signals—regardless of where you heard about it.
                </p>
                <Link href="/">
                  <Button size="lg" className="gap-2">
                    <Shield className="h-5 w-5" />
                    Analyze a Stock
                  </Button>
                </Link>
              </section>
            </article>

            {/* Internal Links */}
            <section className="mt-16 pt-12 border-t border-border">
              <h2 className="text-2xl font-bold mb-6">More Resources</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/investment-scams">
                  <div className="card-interactive rounded-lg p-6 h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <h3 className="font-semibold text-lg mb-2">Types of Investment Fraud</h3>
                    <p className="text-sm text-muted-foreground">
                      Comprehensive guide to pump-and-dump schemes, penny stocks, and cold calling.
                    </p>
                  </div>
                </Link>
                <Link href="/how-to-detect-stock-scams">
                  <div className="card-interactive rounded-lg p-6 h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <h3 className="font-semibold text-lg mb-2">How to Detect Stock Scams</h3>
                    <p className="text-sm text-muted-foreground">
                      Step-by-step guide to identifying manipulation patterns.
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* CTA Section */}
            <section className="mt-12 gradient-mesh rounded-2xl p-8 md:p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Never Fall for a Social Media Scam Again</h2>
              <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
                Before buying any stock mentioned on social media, run it through ScamDunk to check for pump-and-dump
                signals and market manipulation.
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
