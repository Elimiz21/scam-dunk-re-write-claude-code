"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  HelpCircle,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Mail,
  ExternalLink,
  Search,
  Shield,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  Eye
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
    answer: "ScamDunk is a stock analysis tool that helps retail investors identify potential red flags and manipulation patterns in publicly traded securities. We analyze market data, price patterns, and promotional language to detect signs of pump-and-dump schemes and other manipulation tactics."
  },
  {
    category: "Getting Started",
    question: "How do I scan a stock?",
    answer: "Simply enter a stock ticker symbol (like AAPL or TSLA) in the search bar on the homepage and click 'Check'. You can also optionally add any promotional text you received about the stock to get a more comprehensive analysis."
  },
  {
    category: "Getting Started",
    question: "Is ScamDunk free to use?",
    answer: "Yes! We offer a free plan with 5 scans per month. If you need more scans, you can upgrade to our paid plan which includes 200 scans per month."
  },
  {
    category: "Getting Started",
    question: "Do I need to create an account?",
    answer: "Yes, you need to create a free account to use ScamDunk. This allows us to track your usage and provide you with scan history."
  },

  // Understanding Results
  {
    category: "Understanding Results",
    question: "What does HIGH risk mean?",
    answer: "HIGH risk means multiple significant red flags were detected. The stock exhibits characteristics commonly associated with manipulation schemes. This does NOT confirm a scam, but indicates elevated risk that warrants extreme caution."
  },
  {
    category: "Understanding Results",
    question: "What does LOW risk mean?",
    answer: "LOW risk means few or no manipulation indicators were detected. However, this does NOT mean the stock is a good investment or that it's safe. It only means obvious manipulation signals were not found in our analysis."
  },
  {
    category: "Understanding Results",
    question: "Can ScamDunk tell me if a stock will go up or down?",
    answer: "No. ScamDunk cannot predict stock performance. We only analyze whether a stock shows patterns commonly associated with manipulation schemes. A LOW risk stock can still lose value, and a HIGH risk stock isn't guaranteed to be a scam."
  },
  {
    category: "Understanding Results",
    question: "What are the signals ScamDunk looks for?",
    answer: "We analyze four categories of signals: 1) Structural factors (price, market cap, liquidity, exchange), 2) Price and volume patterns (spikes, unusual volume, pump-and-dump signatures), 3) Regulatory alerts (SEC suspensions), and 4) Behavioral indicators in promotional text (guaranteed returns, urgency, insider claims)."
  },

  // Coverage & Limitations
  {
    category: "Coverage & Limitations",
    question: "What markets does ScamDunk cover?",
    answer: "ScamDunk currently covers US stock markets only: NYSE, NASDAQ, and OTC Markets. We do not support international stocks, cryptocurrencies, options, futures, bonds, or ETFs."
  },
  {
    category: "Coverage & Limitations",
    question: "Can ScamDunk detect all scams?",
    answer: "No. ScamDunk has significant limitations. We cannot detect sophisticated manipulation schemes, financial statement fraud, insider trading, or early-stage manipulation before patterns emerge. Our analysis should be one part of your research, not your only source of information."
  },
  {
    category: "Coverage & Limitations",
    question: "Is the market data real-time?",
    answer: "Market data may be delayed by up to 15 minutes. We use licensed financial data providers, but real-time data is not guaranteed."
  },

  // Account & Billing
  {
    category: "Account & Billing",
    question: "How do I upgrade to the paid plan?",
    answer: "Go to your Account settings and click 'Upgrade'. You'll be redirected to our secure payment processor (Stripe) to complete your subscription."
  },
  {
    category: "Account & Billing",
    question: "Can I cancel my subscription?",
    answer: "Yes, you can cancel anytime from your Account settings. Your access will continue until the end of your current billing period, and you won't be charged again."
  },
  {
    category: "Account & Billing",
    question: "Do you offer refunds?",
    answer: "We do not offer refunds for partial months or unused scans. If you experience technical issues, please contact us and we'll work to resolve them."
  },
  {
    category: "Account & Billing",
    question: "When do my monthly scans reset?",
    answer: "Your scan count resets on the first day of each calendar month, regardless of when you signed up."
  },

  // Technical Issues
  {
    category: "Technical Issues",
    question: "Why can't I find a stock?",
    answer: "Make sure you're entering the correct ticker symbol. We only support US-listed stocks. Very new listings or recently delisted stocks may not be available. International stocks are not supported."
  },
  {
    category: "Technical Issues",
    question: "Why does my scan show 'Insufficient Data'?",
    answer: "This means we couldn't retrieve adequate market data for the stock. This can happen with incorrect tickers, very new listings, delisted securities, or temporary data provider issues."
  },
  {
    category: "Technical Issues",
    question: "The scan is taking too long. What should I do?",
    answer: "Scans typically complete within 10-15 seconds. If it's taking longer, try refreshing the page and scanning again. If the problem persists, there may be a temporary issue with our data providers."
  }
];

const categories = ["Getting Started", "Understanding Results", "Coverage & Limitations", "Account & Billing", "Technical Issues"];

export default function HelpPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredFAQs = activeCategory
    ? faqs.filter(faq => faq.category === activeCategory)
    : faqs;

  const categoryIcons: { [key: string]: React.ReactNode } = {
    "Getting Started": <Search className="h-4 w-4" />,
    "Understanding Results": <TrendingUp className="h-4 w-4" />,
    "Coverage & Limitations": <AlertTriangle className="h-4 w-4" />,
    "Account & Billing": <CreditCard className="h-4 w-4" />,
    "Technical Issues": <Shield className="h-4 w-4" />
  };

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
                <HelpCircle className="h-8 w-8 text-white" />
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
                  <Eye className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4 font-display italic">
                Help & FAQ
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Find answers to common questions about using <span className="font-display italic">ScamDunk</span>.
              </p>
            </div>

            {/* Category Filters */}
            <div className="mb-8">
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    activeCategory === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  All Topics
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                      activeCategory === category
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {categoryIcons[category]}
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* FAQ List */}
            <div className="space-y-3 mb-12 animate-slide-up" role="list">
              {filteredFAQs.map((faq, index) => {
                const isOpen = openFAQ === index;
                return (
                  <div
                    key={index}
                    className="rounded-xl card-interactive overflow-hidden"
                    role="listitem"
                  >
                    <button
                      id={`faq-question-${index}`}
                      onClick={() => setOpenFAQ(isOpen ? null : index)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${index}`}
                    >
                      <div className="flex items-start gap-3">
                        <HelpCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium">{faq.question}</span>
                          {!activeCategory && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({faq.category})
                            </span>
                          )}
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                    <div
                      id={`faq-answer-${index}`}
                      role="region"
                      aria-labelledby={`faq-question-${index}`}
                      hidden={!isOpen}
                    >
                      {isOpen && (
                        <div className="px-5 pb-4 pt-0">
                          <div className="pl-8 text-sm text-muted-foreground">
                            {faq.answer}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Still Need Help */}
            <section className="mb-8 animate-slide-up delay-1">
              <div className="p-6 rounded-xl card-elevated text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 gradient-brand rounded-2xl mb-4">
                  <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold mb-2 font-display italic">Still Need Help?</h2>
                <p className="text-muted-foreground mb-4">
                  Can&apos;t find what you&apos;re looking for? We&apos;re here to help.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/contact"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full gradient-brand text-white font-medium hover:opacity-90 transition-smooth shadow-glow-sm"
                  >
                    <Mail className="h-4 w-4" />
                    Contact Us
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-smooth"
                  >
                    Learn About <span className="font-display italic ml-1">ScamDunk</span>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>

            {/* Quick Links */}
            <section className="animate-fade-in delay-2">
              <h2 className="text-lg font-semibold mb-4 font-display italic">Quick Links</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <Link href="/how-it-works" className="p-4 rounded-xl card-interactive group flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-primary transition-smooth">How It Works</h3>
                    <p className="text-sm text-muted-foreground">Detailed methodology</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
                </Link>
                <Link href="/disclaimer" className="p-4 rounded-xl card-interactive group flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-primary transition-smooth">Disclaimer</h3>
                    <p className="text-sm text-muted-foreground">Limitations & warnings</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
                </Link>
                <Link href="/account" className="p-4 rounded-xl card-interactive group flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-primary transition-smooth">Account Settings</h3>
                    <p className="text-sm text-muted-foreground">Manage your account</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
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
