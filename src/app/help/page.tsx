"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  ChevronDown,
  Search,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  MessageCircle,
  Zap,
  Lock,
  CreditCard,
  ArrowLeft,
  Sparkles,
  Target,
  TrendingUp,
  FileText,
  Upload,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

const faqSections: FAQSection[] = [
  {
    title: "Getting Started",
    icon: <Sparkles className="h-5 w-5" />,
    items: [
      {
        question: "What is ScamDunk?",
        answer:
          "ScamDunk is an AI-powered investment scam detection tool that helps you verify if a stock or crypto opportunity is legitimate. Simply enter a ticker symbol, and we'll analyze market data, trading patterns, and risk factors to give you a comprehensive risk assessment.",
      },
      {
        question: "How do I check if an investment is a scam?",
        answer:
          "Enter the ticker symbol (like AAPL for Apple or BTC for Bitcoin) in the search box on the home page. You can also add chat screenshots or messages you've received about the investment, plus answer a few optional questions about how you heard about it. Click 'Check Risk' to get your analysis.",
      },
      {
        question: "What information do I need to run a scan?",
        answer:
          "At minimum, you just need the ticker symbol. For a more accurate assessment, you can optionally add: chat messages or screenshots of the investment pitch, and answer contextual questions about how you were approached (was it unsolicited? did they promise high returns?).",
      },
      {
        question: "Do I need an account to use ScamDunk?",
        answer:
          "Yes, you need to create a free account to use ScamDunk. This helps us track your scan history and manage your monthly scan limit. Creating an account only takes a few seconds with your email.",
      },
    ],
  },
  {
    title: "Understanding Results",
    icon: <Target className="h-5 w-5" />,
    items: [
      {
        question: "What do the risk levels mean?",
        answer:
          "LOW RISK (Green): The investment appears legitimate with no major red flags. MEDIUM RISK (Yellow): Some concerns detected - proceed with caution and do additional research. HIGH RISK (Red): Multiple warning signs detected - this could be a scam. We recommend avoiding this investment.",
      },
      {
        question: "What are 'signals' in the analysis?",
        answer:
          "Signals are specific risk factors we detected during analysis. Each signal has a severity (low, medium, high) and explains why it's concerning. For example, 'Extremely low trading volume' or 'Promises of guaranteed returns' are red flag signals.",
      },
      {
        question: "How is the risk score calculated?",
        answer:
          "Our scoring system analyzes multiple factors: market data (trading volume, price volatility, market cap), the content of any pitch messages you provide, and contextual red flags (unsolicited contact, pressure tactics, secrecy). Each factor contributes to the final risk score from 0-100.",
      },
      {
        question: "What does 'Legitimate Investment' vs 'Potential Scam' mean?",
        answer:
          "When we determine an investment is legitimate, it means the asset is actively traded, has real market activity, and shows no major manipulation signs. 'Potential Scam' means we detected multiple high-risk indicators suggesting the investment may not be what it claims.",
      },
    ],
  },
  {
    title: "Features & Usage",
    icon: <Zap className="h-5 w-5" />,
    items: [
      {
        question: "How do I upload chat screenshots?",
        answer:
          "Click the 'Add Chat' button below the ticker input, then click 'Upload' to select images from your device. You can upload up to 5 images (PNG, JPEG, GIF, or WebP format, max 10MB each). These help us analyze the specific pitch you received.",
      },
      {
        question: "What are the contextual questions for?",
        answer:
          "The 'Red Flags' questions help refine our analysis. Things like 'Was this unsolicited?' or 'Did they promise guaranteed returns?' are classic scam indicators. Answering these honestly helps us give you a more accurate risk assessment.",
      },
      {
        question: "Can I see my previous scans?",
        answer:
          "Yes! Your recent scans appear in the sidebar on the left. Click the menu icon to open the sidebar and see your scan history with risk levels and timestamps.",
      },
      {
        question: "How do I share my scan results?",
        answer:
          "After completing a scan, click the 'Share' button on the results card. This copies a shareable link to your clipboard that you can send to friends or family who might be considering the same investment.",
      },
    ],
  },
  {
    title: "Account & Billing",
    icon: <CreditCard className="h-5 w-5" />,
    items: [
      {
        question: "How many scans do I get for free?",
        answer:
          "Free accounts get 5 scans per month. This resets at the beginning of each calendar month. Your current usage is shown in the scan results and in your account settings.",
      },
      {
        question: "What happens when I reach my scan limit?",
        answer:
          "When you've used all your monthly scans, you'll see a notification letting you know your limit has been reached. You can wait for the next month when your scans reset, or upgrade to a paid plan for more scans.",
      },
      {
        question: "How do I change my password?",
        answer:
          "Go to Account Settings (click the gear icon in the sidebar or your profile). Under 'Security', you can change your password by entering your current password and choosing a new one.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "To delete your account, go to Account Settings and scroll to the 'Danger Zone' section. Click 'Delete Account' and confirm. This will permanently delete your account and all scan history.",
      },
    ],
  },
  {
    title: "Privacy & Security",
    icon: <Lock className="h-5 w-5" />,
    items: [
      {
        question: "Is my data secure?",
        answer:
          "Yes. We use industry-standard encryption for all data transmission and storage. Your uploaded chat images are processed securely and not shared with third parties. We never store your passwords in plain text.",
      },
      {
        question: "Do you share my scan data?",
        answer:
          "No. Your scan history and any uploaded content are private to your account. We do not sell or share your personal data or scan information with any third parties.",
      },
      {
        question: "What data do you collect?",
        answer:
          "We collect: your email address for authentication, scan requests (ticker symbols and optional context), and basic usage analytics. Uploaded images are processed for analysis but not permanently stored.",
      },
    ],
  },
];

function FAQAccordion({ section }: { section: FAQSection }) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    setOpenItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-3">
      {section.items.map((item, index) => (
        <div
          key={index}
          className="bg-card border border-border rounded-2xl overflow-hidden transition-all duration-200 hover:border-primary/20"
        >
          <button
            onClick={() => toggleItem(index)}
            className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-secondary/50"
            aria-expanded={openItems.has(index)}
          >
            <span className="font-medium text-foreground pr-4">
              {item.question}
            </span>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground flex-shrink-0 transition-transform duration-200",
                openItems.has(index) && "rotate-180"
              )}
            />
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200 ease-out",
              openItems.has(index) ? "max-h-96" : "max-h-0"
            )}
          >
            <div className="px-4 pb-4 pt-0">
              <p className="text-muted-foreground leading-relaxed">
                {item.answer}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickStartCard({
  icon,
  title,
  description,
  step,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  step: number;
}) {
  return (
    <div className="relative bg-card border border-border rounded-2xl p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className="absolute -top-3 -left-3 h-8 w-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-semibold">
        {step}
      </div>
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary flex-shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function RiskLevelGuide() {
  const levels = [
    {
      level: "LOW",
      icon: <CheckCircle className="h-6 w-6" />,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      title: "Low Risk",
      description:
        "The investment appears legitimate with healthy market activity and no significant red flags detected.",
    },
    {
      level: "MEDIUM",
      icon: <AlertCircle className="h-6 w-6" />,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/20",
      title: "Medium Risk",
      description:
        "Some concerns were detected. We recommend additional research before making any investment decisions.",
    },
    {
      level: "HIGH",
      icon: <AlertTriangle className="h-6 w-6" />,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      title: "High Risk",
      description:
        "Multiple warning signs detected. This investment shows characteristics commonly associated with scams.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {levels.map((item) => (
        <div
          key={item.level}
          className={cn(
            "rounded-2xl border p-5 transition-all duration-200 hover:scale-[1.02]",
            item.bgColor,
            item.borderColor
          )}
        >
          <div className={cn("mb-3", item.color)}>{item.icon}</div>
          <h3 className={cn("font-semibold mb-2", item.color)}>{item.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="font-medium">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-semibold">ScamDunk Help</span>
            </div>
            <div className="w-20" /> {/* Spacer for centering */}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <div className="inline-flex items-center justify-center h-16 w-16 bg-primary/10 rounded-2xl mb-6">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
            How can we help?
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Learn how to use ScamDunk to protect yourself from investment scams.
            Find answers to common questions below.
          </p>
        </section>

        {/* Quick Start Guide */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            Quick Start Guide
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <QuickStartCard
              step={1}
              icon={<Search className="h-6 w-6" />}
              title="Enter the Ticker"
              description="Type the stock or crypto ticker symbol you want to check (e.g., AAPL, TSLA, BTC)."
            />
            <QuickStartCard
              step={2}
              icon={<Upload className="h-6 w-6" />}
              title="Add Context (Optional)"
              description="Upload screenshots of chat messages or add text from the investment pitch you received."
            />
            <QuickStartCard
              step={3}
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Answer Red Flag Questions"
              description="Tell us how you heard about this investment - was it unsolicited? Did they promise guaranteed returns?"
            />
            <QuickStartCard
              step={4}
              icon={<TrendingUp className="h-6 w-6" />}
              title="Get Your Results"
              description="Receive a comprehensive risk analysis with our AI-powered assessment and detailed signals."
            />
          </div>
        </section>

        {/* Risk Levels */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            Understanding Risk Levels
          </h2>
          <RiskLevelGuide />
        </section>

        {/* FAQ Sections */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-foreground mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-10">
            {faqSections.map((section, index) => (
              <div key={index}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-secondary rounded-xl flex items-center justify-center text-foreground">
                    {section.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {section.title}
                  </h3>
                </div>
                <FAQAccordion section={section} />
              </div>
            ))}
          </div>
        </section>

        {/* Still Need Help */}
        <section className="text-center py-12 px-6 bg-card border border-border rounded-3xl">
          <div className="inline-flex items-center justify-center h-14 w-14 bg-primary/10 rounded-2xl mb-4">
            <MessageCircle className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-3">
            Still have questions?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Can't find what you're looking for? Our team is here to help.
          </p>
          <a
            href="mailto:support@scamdunk.com"
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium px-6 py-3 rounded-xl transition-all duration-200 hover:opacity-90 hover:scale-[1.02]"
          >
            Contact Support
          </a>
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} ScamDunk. Protecting investors from
            fraud.
          </p>
        </footer>
      </main>
    </div>
  );
}
