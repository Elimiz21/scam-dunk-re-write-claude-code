import type { Metadata } from "next";
import Link from "next/link";
import { PageLayout } from "@/components/PageLayout";
import { AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";
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
  description:
    "Complete guide to identifying investment scams promoted on social media platforms.",
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
      <PageLayout>
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
            {/* Hero Section */}
            <div className="mb-14 md:mb-20">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Guide
              </p>
              <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
                Social media{" "}
                <span className="text-brand-blue">investment scams.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Learn how fraudsters use Telegram, Discord, and Reddit to
                recruit victims into pump-and-dump schemes and other investment
                fraud.
              </p>
            </div>

            {/* Content Sections */}
            <article className="max-w-none">
              <section className="mb-14">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Telegram pump-and-dump groups
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Telegram is a favorite platform for pump-and-dump coordinators
                  because of its encrypted messaging, large group sizes, and
                  ease of anonymity. Scammers create &quot;signal groups&quot;
                  to coordinate buys and dumps.
                </p>
                <div className="rounded-xl border border-border bg-card p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    Common Telegram Scam Tactics
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "Free 'premium' group invitations to build trust",
                      "Promised access to 'insider picks' or early alerts",
                      "Admin claims of past successful 'calls' (pumps)",
                      "Fake testimonials with screenshots of returns",
                      "Sudden alert to buy a stock at a specific time (the pump)",
                      "Instructions to sell 'for profit' a few hours or days later",
                    ].map((tactic, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                        <span>{tactic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Discord servers and investment communities
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Discord&apos;s server structure enables scammers to create
                  large, organized communities around fraudulent
                  &quot;investment opportunities.&quot; These servers mimic
                  legitimate trading communities.
                </p>
                <div className="rounded-xl border border-border bg-card p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    Discord Scam Red Flags
                  </h3>
                  <ul className="space-y-3">
                    {[
                      "Servers with elaborate branding and fake 'analyst' bios",
                      "Subscription or membership fees for 'verified' trading signals",
                      "Bots that post stock 'alerts' with manufactured urgency",
                      "Testimonials pinned in channels claiming 1000%+ returns",
                      "Private channels for 'VIP members' with exclusive picks",
                      "Heavy moderation preventing questions or criticism",
                    ].map((flag, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  Reddit and discussion boards
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  Subreddits like r/wallstreetbets have made Reddit a target for
                  pump-and-dump coordination. Scammers create fake accounts and
                  post coordinated &quot;due diligence&quot; to drive attention
                  to penny stocks.
                </p>
                <div className="rounded-xl border border-warning/25 bg-warning/5 p-6 mb-6">
                  <h3 className="text-[15px] font-semibold text-foreground mb-4">
                    How Scammers Use Reddit
                  </h3>
                  <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                    {[
                      "Buying established Reddit accounts to appear legitimate",
                      "Posting fake 'research' and due diligence on penny stocks",
                      "Crossposting to multiple subreddits to maximize visibility",
                      "Using throwaway accounts to create artificial agreement",
                      "Timing posts to coordinate with price movements",
                    ].map((method, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="font-bold text-foreground">•</span>
                        <span>{method}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-6 text-2xl md:text-3xl leading-tight text-foreground">
                  Protection strategies
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Do This
                    </h3>
                    <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
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

                  <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-6">
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Avoid This
                    </h3>
                    <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
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

              <section className="mb-14 border-t border-border/70 pt-12">
                <h2 className="font-editorial mb-5 text-2xl md:text-3xl leading-tight text-foreground">
                  How ScamDunk helps
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground mb-6">
                  ScamDunk analyzes any stock to identify pump-and-dump
                  characteristics, unusual trading patterns, and manipulation
                  signals—regardless of where you heard about it.
                </p>
                <Link href="/" className="btn-pill btn-pill-primary gap-2">
                  Analyze a Stock
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
                More resources
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/investment-scams" className="group">
                  <div className="rounded-xl border border-border bg-card p-6 h-full transition-colors group-hover:border-foreground/30">
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">
                      Types of Investment Fraud
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Comprehensive guide to pump-and-dump schemes, penny
                      stocks, and cold calling.
                    </p>
                  </div>
                </Link>
                <Link href="/how-to-detect-stock-scams" className="group">
                  <div className="rounded-xl border border-border bg-card p-6 h-full transition-colors group-hover:border-foreground/30">
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">
                      How to Detect Stock Scams
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Step-by-step guide to identifying manipulation patterns.
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* CTA Section */}
            <section className="mt-14 border-t border-border/70 pt-12 pb-4 text-center">
              <h2 className="font-editorial text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.15] text-foreground mb-4">
                Never fall for a social media scam{" "}
                <span className="text-brand-blue">again.</span>
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground mb-7">
                Before buying any stock mentioned on social media, run it
                through ScamDunk to check for pump-and-dump signals and market
                manipulation.
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
