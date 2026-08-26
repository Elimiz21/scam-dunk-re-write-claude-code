"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  ChevronDown,
  ChevronUp,
  Search,
  Shield,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  // Getting Started
  {
    category: "Getting Started",
    question: "What is ScamDunk?",
    answer:
      "ScamDunk is a stock analysis tool that helps retail investors identify potential red flags and manipulation patterns in publicly traded securities. We analyze market data, price patterns, and promotional language to detect signs of pump-and-dump schemes and other manipulation tactics.",
  },
  {
    category: "Getting Started",
    question: "How do I scan a stock?",
    answer:
      "Simply enter a stock ticker symbol (like AAPL or TSLA) in the search bar on the homepage and click 'Check'. You can also optionally add any promotional text you received about the stock to get a more comprehensive analysis.",
  },
  {
    category: "Getting Started",
    question: "Is ScamDunk free to use?",
    answer:
      "Yes! We offer a free plan with 5 scans per month. If you need more scans, you can upgrade to our paid plan which includes 200 scans per month.",
  },
  {
    category: "Getting Started",
    question: "Do I need to create an account?",
    answer:
      "Yes, you need to create a free account to use ScamDunk. This allows us to track your usage and provide you with scan history.",
  },

  // Understanding Results
  {
    category: "Understanding Results",
    question: "What does HIGH risk mean?",
    answer:
      "HIGH risk means multiple significant red flags were detected. The stock exhibits characteristics commonly associated with manipulation schemes. This does NOT confirm a scam, but indicates elevated risk that warrants extreme caution.",
  },
  {
    category: "Understanding Results",
    question: "What does LOW risk mean?",
    answer:
      "LOW risk means few or no manipulation indicators were detected. However, this does NOT mean the stock is a good investment or that it's safe. It only means obvious manipulation signals were not found in our analysis.",
  },
  {
    category: "Understanding Results",
    question: "Can ScamDunk tell me if a stock will go up or down?",
    answer:
      "No. ScamDunk cannot predict stock performance. We only analyze whether a stock shows patterns commonly associated with manipulation schemes. A LOW risk stock can still lose value, and a HIGH risk stock isn't guaranteed to be a scam.",
  },
  {
    category: "Understanding Results",
    question: "What are the signals ScamDunk looks for?",
    answer:
      "We analyze four categories of signals: 1) Structural factors (price, market cap, liquidity, exchange), 2) Price and volume patterns (spikes, unusual volume, pump-and-dump signatures), 3) Regulatory alerts (SEC suspensions), and 4) Behavioral indicators in promotional text (guaranteed returns, urgency, insider claims).",
  },

  // Coverage & Limitations
  {
    category: "Coverage & Limitations",
    question: "What markets does ScamDunk cover?",
    answer:
      "ScamDunk currently covers US stock markets only: NYSE, NASDAQ, and OTC Markets. We do not support international stocks, cryptocurrencies, options, futures, bonds, or ETFs.",
  },
  {
    category: "Coverage & Limitations",
    question: "Can ScamDunk detect all scams?",
    answer:
      "No. ScamDunk has significant limitations. We cannot detect sophisticated manipulation schemes, financial statement fraud, insider trading, or early-stage manipulation before patterns emerge. Our analysis should be one part of your research, not your only source of information.",
  },
  {
    category: "Coverage & Limitations",
    question: "Is the market data live?",
    answer:
      "No. ScamDunk checks published market data after the trading day closes; it does not provide live price monitoring.",
  },

  // Account & Billing
  {
    category: "Account & Billing",
    question: "How do I upgrade to the paid plan?",
    answer:
      "Go to your Account settings and click 'Upgrade'. You'll be redirected to our secure payment processor (Stripe) to complete your subscription.",
  },
  {
    category: "Account & Billing",
    question: "Can I cancel my subscription?",
    answer:
      "Yes, you can cancel anytime from your Account settings. Your access will continue until the end of your current billing period, and you won't be charged again.",
  },
  {
    category: "Account & Billing",
    question: "Do you offer refunds?",
    answer:
      "We do not offer refunds for partial months or unused scans. If you experience technical issues, please contact us and we'll work to resolve them.",
  },
  {
    category: "Account & Billing",
    question: "When do my monthly scans reset?",
    answer:
      "Your scan count resets on the first day of each calendar month, regardless of when you signed up.",
  },

  // Technical Issues
  {
    category: "Technical Issues",
    question: "Why can't I find a stock?",
    answer:
      "Make sure you're entering the correct ticker symbol. We only support US-listed stocks. Very new listings or recently delisted stocks may not be available. International stocks are not supported.",
  },
  {
    category: "Technical Issues",
    question: "Why does my scan show 'Insufficient Data'?",
    answer:
      "This means we couldn't retrieve adequate market data for the stock. This can happen with incorrect tickers, very new listings, delisted securities, or temporary data provider issues.",
  },
  {
    category: "Technical Issues",
    question: "The scan is taking too long. What should I do?",
    answer:
      "Scans typically complete within 10-15 seconds. If it's taking longer, try refreshing the page and scanning again. If the problem persists, there may be a temporary issue with our data providers.",
  },
];

const categories = [
  "Getting Started",
  "Understanding Results",
  "Coverage & Limitations",
  "Account & Billing",
  "Technical Issues",
];

export default function HelpContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredFAQs = activeCategory
    ? faqs.filter((faq) => faq.category === activeCategory)
    : faqs;

  const categoryIcons: { [key: string]: React.ReactNode } = {
    "Getting Started": <Search className="h-3.5 w-3.5" />,
    "Understanding Results": <TrendingUp className="h-3.5 w-3.5" />,
    "Coverage & Limitations": <AlertTriangle className="h-3.5 w-3.5" />,
    "Account & Billing": <CreditCard className="h-3.5 w-3.5" />,
    "Technical Issues": <Shield className="h-3.5 w-3.5" />,
  };

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
            <div className="mb-12 md:mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Support
              </p>
              <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
                Help &amp; <span className="text-brand-blue">FAQ</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Find answers to common questions about using ScamDunk.
              </p>
            </div>

            {/* Category Filters */}
            <div className="mb-8">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-colors ${
                    activeCategory === null
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  All Topics
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-colors flex items-center gap-2 ${
                      activeCategory === category
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    }`}
                  >
                    {categoryIcons[category]}
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* FAQ List */}
            <div className="space-y-3 mb-14">
              {filteredFAQs.map((faq, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left transition-colors hover:bg-secondary/60"
                  >
                    <div>
                      <span className="text-[15px] font-medium text-foreground">
                        {faq.question}
                      </span>
                      {!activeCategory && (
                        <span className="ml-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {faq.category}
                        </span>
                      )}
                    </div>
                    {openFAQ === index ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                  {openFAQ === index && (
                    <div className="px-5 pb-4 pt-0">
                      <div className="border-t border-border/60 pt-3 text-[13px] leading-relaxed text-muted-foreground">
                        {faq.answer}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Still Need Help */}
            <section className="mb-14 border-t border-border/70 pt-12 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Contact
              </p>
              <h2 className="font-editorial mt-3 text-2xl md:text-3xl leading-tight text-foreground">
                Still need help?
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Can&apos;t find what you&apos;re looking for? We&apos;re here to
                help.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/contact" className="btn-pill btn-pill-primary">
                  Contact Us
                </Link>
                <Link href="/about" className="btn-pill btn-pill-ghost">
                  Learn About ScamDunk
                </Link>
              </div>
            </section>

            {/* Quick Links */}
            <section className="border-t border-border/70 pt-12 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                Quick Links
              </p>
              <div className="mt-5 grid sm:grid-cols-3 gap-3">
                <Link
                  href="/how-it-works"
                  className="p-4 rounded-xl border border-border bg-card group flex items-center justify-between transition-colors hover:border-foreground/30"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      How It Works
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      Detailed methodology
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
                <Link
                  href="/disclaimer"
                  className="p-4 rounded-xl border border-border bg-card group flex items-center justify-between transition-colors hover:border-foreground/30"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      Disclaimer
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      Limitations &amp; warnings
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
                <Link
                  href="/account"
                  className="p-4 rounded-xl border border-border bg-card group flex items-center justify-between transition-colors hover:border-foreground/30"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      Account Settings
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      Manage your account
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              </div>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
