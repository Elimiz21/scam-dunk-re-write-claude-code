import type { Metadata } from "next";
import Link from "next/link";
import { Check, MessageCircle, ArrowRight } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { JsonLd } from "@/components/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Pricing — ScamDunk",
  description:
    "Check stock tips for scam and fraud red flags. Free plan: 5 scans a month with full verdicts. Pro ($4.99/month): 200 scans a month and full scan history. WhatsApp and Telegram bots are coming soon.",
  alternates: { canonical: "/pricing" },
};

const productSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "ScamDunk Pro",
  description:
    "200 stock scam checks per month with full scan history. WhatsApp and Telegram scanning bots — send a ticker by chat message, get a fraud risk verdict — are coming soon.",
  brand: { "@type": "Brand", name: "ScamDunk" },
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "5 scam checks per month with full verdicts.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "4.99",
      priceCurrency: "USD",
      description:
        "200 scam checks per month and full scan history; WhatsApp and Telegram bots coming soon.",
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What does the free plan include?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Five scam checks per month on scamdunk.com. Every check returns the full verdict and the exact signals we found — the free plan is not a teaser.",
      },
    },
    {
      "@type": "Question",
      name: "How will the WhatsApp and Telegram bots work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Both bots are coming soon for Pro subscribers. You link your number (WhatsApp) or start a chat with the ScamDunk bot (Telegram), then message a ticker — for example, ACME — and the fraud risk verdict comes back as a reply within seconds, with a link to the full result. Bot scans will draw from the same 200-scan monthly allowance, and Pro subscribers get access the day they launch.",
      },
    },
    {
      "@type": "Question",
      name: "Does ScamDunk tell me what to buy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. ScamDunk is not a broker or a newsletter and gives no investment advice. It checks whether a stock tip shows the fingerprints of fraud — pump-and-dump patterns, promoter history, manipulation signals — before you decide anything else.",
      },
    },
    {
      "@type": "Question",
      name: "Can I cancel anytime?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Pro is a monthly PayPal subscription you can cancel from your account page at any time.",
      },
    },
  ],
};

const FREE_FEATURES = [
  "5 scam checks per month",
  "Full verdict with the exact signals found",
  "Pump-and-dump pattern detection",
  "SEC alert-list check on every scan",
];

const PRO_FEATURES = [
  "200 scam checks per month",
  "WhatsApp & Telegram bots — text a ticker, get the verdict (coming soon)",
  "Full scan history & re-checks",
  "Priority scan lane",
  "Everything in Free",
];

export default function PricingPage() {
  return (
    <PageLayout>
      <main className="flex-1 bg-background">
        {/* GEO/AI-readable opening — mirrors the semantic-paragraph strategy */}
        <section className="mx-auto max-w-3xl px-4 pt-14 text-center md:pt-20">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pricing
          </p>
          <h1 className="font-editorial mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.12] text-foreground">
            Checking one tip is free.{" "}
            <span className="text-brand-blue">Making it a habit</span> costs
            less than the coffee you&apos;d drink while regretting it.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            ScamDunk checks stock tips for scam and fraud red flags — pump
            patterns, promoter history, manipulation signals. Free users get 5
            full checks a month on the site. Pro adds volume today — and is
            about to put the checker inside WhatsApp and Telegram, where the
            tips actually reach you.
          </p>
        </section>

        {/* Plans */}
        <section className="mx-auto grid max-w-4xl gap-6 px-4 py-14 md:grid-cols-2 md:py-16">
          {/* Free */}
          <div className="flex flex-col rounded-2xl border border-border bg-card p-8">
            <h2 className="text-[15px] font-semibold text-foreground">Free</h2>
            <p className="font-editorial mt-3 text-4xl text-foreground">
              $0
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / forever
              </span>
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              For the tip that&apos;s nagging at you right now.
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {FREE_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-[14px] text-foreground/90"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="btn-pill btn-pill-ghost mt-8 w-full text-center"
            >
              Start checking free
            </Link>
          </div>

          {/* Pro */}
          <div className="relative flex flex-col rounded-2xl border-2 border-foreground bg-card p-8">
            <span className="absolute -top-3 left-8 rounded-full bg-foreground px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-background">
              For habitual checkers
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">Pro</h2>
            <p className="font-editorial mt-3 text-4xl text-foreground">
              $4.99
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / month
              </span>
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              The 15-second habit, everywhere a tip reaches you.
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {PRO_FEATURES.map((f, i) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-[14px] text-foreground/90"
                >
                  {i === 1 ? (
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                  ) : (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  )}
                  <span className={i === 1 ? "font-medium" : undefined}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/account"
              className="btn-pill btn-pill-primary mt-8 w-full gap-1.5 text-center"
            >
              Go Pro
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Messenger bots explainer strip — coming soon */}
        <section className="border-t border-border/70 bg-background py-14 md:py-16">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              The Pro difference
            </p>
            <h2 className="font-editorial mt-5 text-[clamp(1.6rem,3vw,2.25rem)] leading-[1.2] text-foreground">
              Tips arrive in your chats. Soon the check will too.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Scam tips don&apos;t reach you on a website — they reach you in
              WhatsApp groups and Telegram channels. That&apos;s where the
              checker is headed next.
            </p>
            <div className="mx-auto mt-8 grid max-w-2xl gap-5 text-left sm:grid-cols-2">
              {[
                {
                  name: "WhatsApp bot",
                  desc: "Link your number once. When a ticker lands in a group chat, forward it to your ScamDunk contact — the verdict comes back before the conversation moves on.",
                },
                {
                  name: "Telegram bot",
                  desc: "Message a ticker to the ScamDunk bot and get the verdict with the signals found — inside the platform where many pump groups actually operate.",
                },
              ].map((bot) => (
                <div
                  key={bot.name}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 shrink-0 text-teal" />
                    <h3 className="text-[14px] font-semibold text-foreground">
                      {bot.name}
                    </h3>
                    <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-teal">
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    {bot.desc}
                  </p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-lg text-xs text-muted-foreground">
              Pro subscribers get bot access the day each one launches, at no
              extra cost.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border/70 bg-background py-14 md:py-16">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="font-editorial text-2xl text-foreground">
              Questions
            </h2>
            <dl className="mt-8 space-y-8">
              {faqSchema.mainEntity.map((qa) => (
                <div key={qa.name}>
                  <dt className="text-[15px] font-semibold text-foreground">
                    {qa.name}
                  </dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                    {qa.acceptedAnswer.text}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <JsonLd data={[productSchema, faqSchema]} />
    </PageLayout>
  );
}
