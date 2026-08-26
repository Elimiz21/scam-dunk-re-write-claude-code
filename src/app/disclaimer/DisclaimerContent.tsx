"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AlertTriangle, XCircle, ShieldAlert, ArrowRight } from "lucide-react";

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
        <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
            {/* Hero Section */}
            <div className="mb-12 md:mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Legal
              </p>
              <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
                Disclaimer &amp;{" "}
                <span className="text-brand-blue">Limitations</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Please read carefully before using ScamDunk. Understanding our
                limitations is essential for using this tool responsibly.
              </p>
            </div>

            {/* Critical Warning */}
            <section className="mb-10">
              <div className="p-6 rounded-xl border-2 border-destructive/40 bg-destructive/5">
                <h2 className="text-[15px] font-semibold mb-3 flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  Critical Disclaimer
                </h2>
                <div className="space-y-3 text-[13px] leading-relaxed">
                  <p className="font-medium text-foreground">
                    ScamDunk is NOT financial advice. ScamDunk is NOT investment
                    advice. ScamDunk does NOT recommend buying or selling any
                    securities.
                  </p>
                  <p className="text-muted-foreground">
                    ScamDunk is an educational tool designed to help identify
                    potential red flags in stock promotions. We cannot guarantee
                    accuracy or completeness.{" "}
                    <strong className="text-foreground">
                      You are solely responsible for your investment decisions.
                    </strong>
                  </p>
                </div>
              </div>
            </section>

            {/* What We Don't Check */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                What our scans do NOT check
              </h2>

              <div className="p-5 rounded-xl border border-border bg-card">
                <p className="text-[13px] leading-relaxed text-muted-foreground mb-4">
                  Our analysis has significant limitations. We{" "}
                  <strong className="text-foreground">
                    cannot detect or verify
                  </strong>
                  :
                </p>
                <div className="grid md:grid-cols-2 gap-3 text-[13px] leading-relaxed">
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
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                We can make mistakes
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-yellow-500/25 bg-yellow-500/5">
                  <h3 className="text-[15px] font-semibold text-yellow-600 dark:text-yellow-400 mb-1">
                    False Positives
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Legitimate stocks may be flagged as high risk. Small or
                    volatile companies may trigger signals for valid reasons.
                    HIGH risk does not mean a stock is definitely a scam.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-yellow-500/25 bg-yellow-500/5">
                  <h3 className="text-[15px] font-semibold text-yellow-600 dark:text-yellow-400 mb-1">
                    False Negatives
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Real scams may not be detected. Sophisticated manipulation
                    can evade our patterns. LOW risk does not mean a stock is
                    safe. Never rely solely on our assessment.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-yellow-500/25 bg-yellow-500/5">
                  <h3 className="text-[15px] font-semibold text-yellow-600 dark:text-yellow-400 mb-1">
                    Data Errors
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Market data may be delayed, incomplete, or incorrect. We
                    rely on third-party data sources and cannot guarantee their
                    accuracy.
                  </p>
                </div>
              </div>
            </section>

            {/* Coverage Limitations */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Geographic &amp; asset limitations
              </h2>

              <ul className="max-w-2xl space-y-3 text-sm leading-relaxed text-muted-foreground">
                <li className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                  <span>
                    <strong className="text-foreground">
                      US Markets Only:
                    </strong>{" "}
                    We only analyze NYSE, NASDAQ, and OTC Markets. International
                    stocks are not supported.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                  <span>
                    <strong className="text-foreground">Stocks Only:</strong>{" "}
                    Crypto, options, futures, bonds, and ETFs are not analyzed.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                  <span>
                    <strong className="text-foreground">Data Delays:</strong>{" "}
                    Market data may be delayed by 15+ minutes.
                  </span>
                </li>
              </ul>
            </section>

            {/* No Professional Relationship */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                No professional relationship
              </h2>

              <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">
                    No Fiduciary Duty:
                  </strong>{" "}
                  ScamDunk does not owe you any fiduciary duty.
                </p>
                <p>
                  <strong className="text-foreground">
                    No Attorney-Client Relationship:
                  </strong>{" "}
                  Nothing creates legal advice or representation.
                </p>
                <p>
                  <strong className="text-foreground">
                    No Investment Advisory:
                  </strong>{" "}
                  We are not registered investment advisors.
                </p>
                <p>
                  <strong className="text-foreground">
                    Educational Purpose:
                  </strong>{" "}
                  All information is for educational purposes only.
                </p>
              </div>
            </section>

            {/* Investment Risk Warning */}
            <section className="mb-10">
              <div className="p-5 rounded-xl border border-destructive/25 bg-destructive/5">
                <h2 className="text-[15px] font-semibold mb-3 text-destructive">
                  Investment Risk Warning
                </h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground mb-3">
                  <strong className="text-foreground">
                    Investing involves substantial risk of loss.
                  </strong>{" "}
                  You may lose some or all of your investment.
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Past performance does not indicate future results. Penny
                  stocks and OTC securities are particularly risky. Only invest
                  money you can afford to lose entirely.
                </p>
              </div>
            </section>

            {/* Limitation of Liability */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Limitation of liability
              </h2>

              <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCAMDUNK SHALL NOT BE
                  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
                  CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF
                  THIS SERVICE.
                </p>
                <p>
                  <strong className="text-foreground">
                    THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES
                    OF ANY KIND.
                  </strong>{" "}
                  Your use of ScamDunk is at your sole risk.
                </p>
              </div>
            </section>

            {/* Acknowledgment */}
            <section className="mb-10">
              <div className="p-5 rounded-xl border border-border bg-secondary/60">
                <h2 className="text-[15px] font-semibold text-foreground mb-3">
                  By Using ScamDunk, You Acknowledge:
                </h2>
                <ol className="text-[13px] leading-relaxed text-muted-foreground space-y-2">
                  <li>1. You have read and understood this disclaimer</li>
                  <li>2. ScamDunk is not providing financial or legal advice</li>
                  <li>3. Our analysis may contain errors</li>
                  <li>
                    4. You are solely responsible for your investment decisions
                  </li>
                  <li>5. Investing involves risk of loss</li>
                  <li>
                    6. You will consult qualified professionals before investing
                  </li>
                </ol>
              </div>
            </section>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center border-t border-border/70 pt-10">
              <Link href="/" className="btn-pill btn-pill-primary gap-2">
                I Understand, Start Scanning
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/privacy" className="btn-pill btn-pill-ghost">
                Privacy Policy
              </Link>
            </div>

            {/* Last Updated */}
            <p className="text-center text-xs text-muted-foreground mt-8 pb-4">
              Last Updated: December 2024
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
