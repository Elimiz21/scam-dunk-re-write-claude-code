"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  AlertTriangle,
  XCircle,
  ShieldAlert,
  Scale,
  FileWarning,
  ArrowRight,
  Eye
} from "lucide-react";

export default function DisclaimerContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Hero Section */}
            <div className="text-center mb-12 gradient-mesh rounded-2xl py-12 px-4 animate-fade-in">
              <div className="relative inline-flex items-center justify-center w-16 h-16 gradient-brand rounded-2xl mb-6 shadow-glow-sm">
                <AlertTriangle className="h-8 w-8 text-white" />
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
                  <Eye className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4 font-display italic">
                Disclaimer & Limitations
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Please read carefully before using <span className="font-display italic">ScamDunk</span>. Understanding our limitations
                is essential for using this tool responsibly.
              </p>
            </div>

            {/* Critical Warning */}
            <section className="mb-8 animate-slide-up">
              <div className="p-6 rounded-xl bg-destructive/10 border-2 border-destructive/50">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2 text-destructive font-display italic">
                  <ShieldAlert className="h-5 w-5" />
                  Critical Disclaimer
                </h2>
                <div className="space-y-3 text-sm">
                  <p className="font-medium">
                    ScamDunk is NOT financial advice. ScamDunk is NOT investment advice. ScamDunk does NOT
                    recommend buying or selling any securities.
                  </p>
                  <p className="text-muted-foreground">
                    ScamDunk is an educational tool designed to help identify potential red flags in stock
                    promotions. We cannot guarantee accuracy or completeness. <strong>You are solely
                    responsible for your investment decisions.</strong>
                  </p>
                </div>
              </div>
            </section>

            {/* What We Don't Check */}
            <section className="mb-8 animate-slide-up delay-1">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><XCircle className="h-4 w-4 text-white" /></span>
                What Our Scans Do NOT Check
              </h2>

              <div className="p-5 rounded-xl card-elevated">
                <p className="text-sm text-muted-foreground mb-4">
                  Our analysis has significant limitations. We <strong>cannot detect or verify</strong>:
                </p>
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Financial statement fraud</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Management integrity</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Business viability</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Coordinated manipulation schemes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Insider trading</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Regulatory compliance</span>
                    </li>
                  </ul>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Social media manipulation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Celebrity/influencer schemes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Early-stage manipulation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>International fraud</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>Future stock performance</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Potential Errors */}
            <section className="mb-8 animate-slide-up delay-2">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><FileWarning className="h-4 w-4 text-white" /></span>
                We Can Make Mistakes
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <h3 className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">False Positives</h3>
                  <p className="text-sm text-muted-foreground">
                    Legitimate stocks may be flagged as high risk. Small or volatile companies may trigger signals
                    for valid reasons. HIGH risk does not mean a stock is definitely a scam.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <h3 className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">False Negatives</h3>
                  <p className="text-sm text-muted-foreground">
                    Real scams may not be detected. Sophisticated manipulation can evade our patterns.
                    LOW risk does not mean a stock is safe. Never rely solely on our assessment.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <h3 className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">Data Errors</h3>
                  <p className="text-sm text-muted-foreground">
                    Market data may be delayed, incomplete, or incorrect. We rely on third-party data
                    sources and cannot guarantee their accuracy.
                  </p>
                </div>
              </div>
            </section>

            {/* Coverage Limitations */}
            <section className="mb-8 animate-fade-in delay-3">
              <h2 className="text-xl font-semibold mb-4 font-display italic">Geographic & Asset Limitations</h2>

              <div className="p-5 rounded-xl card-elevated">
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><strong>US Markets Only:</strong> We only analyze NYSE, NASDAQ, and OTC Markets. International stocks are not supported.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><strong>Stocks Only:</strong> Crypto, options, futures, bonds, and ETFs are not analyzed.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><strong>Data Delays:</strong> Market data may be delayed by 15+ minutes.</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* No Professional Relationship */}
            <section className="mb-8 animate-fade-in delay-4">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 font-display italic">
                <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><Scale className="h-4 w-4 text-white" /></span>
                No Professional Relationship
              </h2>

              <div className="p-5 rounded-xl card-elevated space-y-3 text-sm text-muted-foreground">
                <p><strong>No Fiduciary Duty:</strong> ScamDunk does not owe you any fiduciary duty.</p>
                <p><strong>No Attorney-Client Relationship:</strong> Nothing creates legal advice or representation.</p>
                <p><strong>No Investment Advisory:</strong> We are not registered investment advisors.</p>
                <p><strong>Educational Purpose:</strong> All information is for educational purposes only.</p>
              </div>
            </section>

            {/* Investment Risk Warning */}
            <section className="mb-8">
              <div className="p-5 rounded-xl bg-destructive/10 border border-destructive/20">
                <h2 className="font-semibold mb-3 text-destructive">Investment Risk Warning</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>Investing involves substantial risk of loss.</strong> You may lose some or all of your investment.
                </p>
                <p className="text-sm text-muted-foreground">
                  Past performance does not indicate future results. Penny stocks and OTC securities are
                  particularly risky. Only invest money you can afford to lose entirely.
                </p>
              </div>
            </section>

            {/* Limitation of Liability */}
            <section className="mb-8 animate-fade-in delay-5">
              <h2 className="text-xl font-semibold mb-4 font-display italic">Limitation of Liability</h2>

              <div className="p-5 rounded-xl card-elevated text-sm text-muted-foreground space-y-3">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCAMDUNK SHALL NOT BE LIABLE FOR ANY DIRECT,
                  INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THIS SERVICE.
                </p>
                <p>
                  <strong>THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND.</strong> Your use of ScamDunk is at your sole risk.
                </p>
              </div>
            </section>

            {/* Acknowledgment */}
            <section className="mb-8">
              <div className="p-5 rounded-xl bg-primary/10 border border-primary/20">
                <h2 className="font-semibold mb-3">By Using ScamDunk, You Acknowledge:</h2>
                <ol className="text-sm text-muted-foreground space-y-2">
                  <li>1. You have read and understood this disclaimer</li>
                  <li>2. ScamDunk is not providing financial or legal advice</li>
                  <li>3. Our analysis may contain errors</li>
                  <li>4. You are solely responsible for your investment decisions</li>
                  <li>5. Investing involves risk of loss</li>
                  <li>6. You will consult qualified professionals before investing</li>
                </ol>
              </div>
            </section>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full gradient-brand text-white font-medium hover:opacity-90 transition-smooth shadow-glow-sm"
              >
                I Understand, Start Scanning
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-smooth"
              >
                Privacy Policy
              </Link>
            </div>

            {/* Last Updated */}
            <p className="text-center text-xs text-muted-foreground mt-8">
              Last Updated: December 2024
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
