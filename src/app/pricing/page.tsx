import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  ListChecks,
  MessageCircle,
  ScanSearch,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { JsonLd } from "@/components/JsonLd";
import { formatUsdCents, getPublicBillingPrices } from "@/lib/billing/pricing";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";
const publicBillingPrices = getPublicBillingPrices();

export const metadata: Metadata = {
  title: "Pricing — ScamDunk",
  description:
    "Choose Free, Pro, or Pro Max for ScamDunk stock-risk checks, unlimited watchlist saves, and scheduled full or price monitoring after the trading day closes.",
  alternates: { canonical: "/pricing" },
};

const productSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "ScamDunk",
  description:
    "Stock scam checks with unlimited watchlist saves and scheduled full-risk or price monitoring. Scheduled checks run after the trading day closes, not live.",
  brand: { "@type": "Brand", name: "ScamDunk" },
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description:
        "5 manual scan credits per month, an unlimited watchlist, and 1 price monitor.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: (publicBillingPrices.PAID / 100).toFixed(2),
      priceCurrency: "USD",
      description:
        "50 manual scan credits per month, an unlimited watchlist, 2 full monitors, and 5 price monitors.",
    },
    {
      "@type": "Offer",
      name: "Pro Max",
      price: (publicBillingPrices.PRO_MAX / 100).toFixed(2),
      priceCurrency: "USD",
      description:
        "200 manual scan credits per month, an unlimited watchlist, 10 full monitors, and 20 price monitors.",
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
        text: "Five manual scan credits per month, an unlimited watchlist, and one price monitor. Every check returns the full verdict and the exact signals we found — the free plan is not a teaser.",
      },
    },
    {
      "@type": "Question",
      name: "How do daily and weekly monitoring work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Save as many supported US stocks as you want, then assign an available full monitor or price monitor to a ticker. Choose daily or weekly monitoring for 1–24 months. Each completed scheduled check uses one credit; creating or changing a monitor uses no credit. Checks run after the trading day closes — they are not live — and results appear in-app and by email.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between a full monitor and a price monitor?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A full monitor reruns ScamDunk’s full risk analysis on its schedule. A price monitor checks price movement only on its schedule and does not rerun the full risk analysis. Both are scheduled after-market-close checks, not live monitoring.",
      },
    },
    {
      "@type": "Question",
      name: "How will the WhatsApp and Telegram bots work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The WhatsApp and Telegram bots are coming soon for Pro and Pro Max subscribers. You link your number or start a chat with the ScamDunk bot, then message a ticker and receive the fraud-risk verdict with a link to the full result. Bot scans will draw from your plan’s monthly scan-credit allowance.",
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
        text: "Yes. Pro and Pro Max are monthly subscriptions you can cancel from your account page at any time.",
      },
    },
  ],
};

const PLAN_CARDS = [
  {
    name: "Free",
    price: "$0",
    cadence: "/ forever",
    description: "For the tip that’s nagging at you right now.",
    features: [
      "5 manual scan credits per month",
      "Unlimited watchlist saves",
      "1 price monitor",
      "Daily or Weekly scheduled checks",
      "Full verdict with the exact signals found",
    ],
    cta: "Start checking free",
    href: "/signup",
    cardClass: "border-border",
    badge: null,
  },
  {
    name: "Pro",
    price: formatUsdCents(publicBillingPrices.PAID),
    cadence: "/ month",
    description: "For regular checking and a small set of active monitors.",
    features: [
      "50 manual scan credits per month",
      "Unlimited watchlist saves",
      "2 full monitors",
      "5 price monitors",
      "Daily or Weekly scheduled checks",
      "Everything in Free",
    ],
    cta: "Go Pro",
    href: "/account",
    cardClass: "border-2 border-foreground",
    badge: "For habitual checkers",
  },
  {
    name: "Pro Max",
    price: formatUsdCents(publicBillingPrices.PRO_MAX),
    cadence: "/ month",
    description: "For a larger watchlist with room to monitor more names.",
    features: [
      "200 manual scan credits per month",
      "Unlimited watchlist saves",
      "10 full monitors",
      "20 price monitors",
      "Daily or Weekly scheduled checks",
      "Everything in Pro",
    ],
    cta: "Choose Pro Max",
    href: "/account",
    cardClass: "border-2 border-teal/70",
    badge: "For heavy monitoring",
  },
] as const;

const MONITORING_DETAILS = [
  {
    icon: ListChecks,
    title: "Watchlist",
    description:
      "Save as many supported US stocks as you want. Saving or removing a ticker never uses a credit.",
  },
  {
    icon: ScanSearch,
    title: "Full monitor",
    description:
      "Reruns the full ScamDunk risk analysis on a daily or weekly schedule.",
  },
  {
    icon: BellRing,
    title: "Price monitor",
    description:
      "Checks price movement on a daily or weekly schedule without rerunning the full risk analysis.",
  },
  {
    icon: CalendarDays,
    title: "Credits and timing",
    description:
      "Each completed scheduled check uses one credit. Daily is estimated at about 22 checks/month; weekly at about 4.",
  },
] as const;

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
            Checking one tip is free. <span className="text-brand-blue">Monitoring what matters</span> stays simple.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Every plan includes an unlimited watchlist. Plans differ by manual
            scan credits and monitoring capacity, so you can choose full risk
            checks or price-movement checks without confusing either one for
            live market monitoring.
          </p>
        </section>

        {/* Plans */}
        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-3 md:py-16">
          {PLAN_CARDS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl bg-card p-8 ${plan.cardClass}`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-8 rounded-full bg-foreground px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-background">
                  {plan.badge}
                </span>
              )}
              <h2 className="text-[15px] font-semibold text-foreground">{plan.name}</h2>
              <p className="font-editorial mt-3 text-4xl text-foreground">
                {plan.price}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {plan.cadence}
                </span>
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">{plan.description}</p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-[14px] text-foreground/90"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`btn-pill mt-8 w-full gap-1.5 text-center ${plan.name === "Free" ? "btn-pill-ghost" : "btn-pill-primary"}`}
              >
                {plan.cta}
                {plan.name !== "Free" && <ArrowRight className="h-4 w-4" />}
              </Link>
            </div>
          ))}
        </section>

        {/* Monitoring rules */}
        <section className="border-t border-border/70 bg-background py-14 md:py-16">
          <div className="mx-auto max-w-5xl px-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Monitoring, clearly
              </p>
              <h2 className="font-editorial mt-5 text-[clamp(1.6rem,3vw,2.25rem)] leading-[1.2] text-foreground">
                Save freely. Schedule deliberately.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Active monitoring is separate from saving stocks to your
                watchlist. Pick the monitor type, frequency, and duration that
                match what you actually want checked.
              </p>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {MONITORING_DETAILS.map((detail) => {
                const Icon = detail.icon;
                return (
                  <div key={detail.title} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
                      <h3 className="text-[14px] font-semibold text-foreground">{detail.title}</h3>
                    </div>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
                      {detail.description}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 rounded-2xl border border-teal/30 bg-teal/5 px-5 py-4 text-sm leading-relaxed text-foreground/90">
              Monitoring is <strong>not live</strong>. Checks run after the
              trading day closes, results appear in-app and by email, and a
              monitor can run for 1–24 months. Creating or changing a monitor
              uses no credit; only each completed scheduled check uses one.
            </div>
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
                <div key={bot.name} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 shrink-0 text-teal" />
                    <h3 className="text-[14px] font-semibold text-foreground">{bot.name}</h3>
                    <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-teal">
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{bot.desc}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-lg text-xs text-muted-foreground">
              Pro and Pro Max subscribers get bot access the day each one launches, at no extra cost.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border/70 bg-background py-14 md:py-16">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="font-editorial text-2xl text-foreground">Questions</h2>
            <dl className="mt-8 space-y-8">
              {faqSchema.mainEntity.map((qa) => (
                <div key={qa.name}>
                  <dt className="text-[15px] font-semibold text-foreground">{qa.name}</dt>
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
