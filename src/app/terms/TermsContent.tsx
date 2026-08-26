"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { XCircle, CheckCircle } from "lucide-react";

export default function TermsContent() {
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
                Terms of <span className="text-brand-blue">Service</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Please read these terms carefully before using ScamDunk.
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Last Updated: December 2024
              </p>
            </div>

            {/* Agreement */}
            <section className="mb-10">
              <div className="p-5 rounded-xl border border-border bg-secondary/60">
                <h2 className="text-[15px] font-semibold text-foreground mb-1">
                  Agreement to Terms
                </h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  By accessing or using ScamDunk, you agree to these Terms of
                  Service. If you disagree, you may not use the Service.
                </p>
              </div>
            </section>

            {/* Service Description */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Service description
              </h2>

              <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                <p className="mb-3">
                  ScamDunk is a stock analysis tool that helps identify
                  potential red flags and manipulation patterns in publicly
                  traded securities.
                </p>
                <p className="font-medium text-foreground">
                  The Service is for educational and informational purposes
                  only. ScamDunk does not provide financial advice or investment
                  recommendations.
                </p>
              </div>
            </section>

            {/* Eligibility */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Eligibility
              </h2>

              <ul className="max-w-2xl space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                  <span>You must be at least 18 years old</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                  <span>You must provide accurate registration information</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                  <span>You must maintain security of your credentials</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                  <span>You must comply with applicable laws</span>
                </li>
              </ul>
            </section>

            {/* Subscription Terms */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Subscription &amp; payment
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Free plan
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    5 manual scan credits per month, an unlimited watchlist,
                    and 1 price monitor. Scheduled checks are not live.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Pro plan
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    50 manual scan credits per month, 2 full monitors, and 5
                    price monitors, billed monthly. Daily or weekly checks run
                    after the trading day closes, not live.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Pro Max plan
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    200 manual scan credits per month, 10 full monitors, and
                    20 price monitors, billed monthly. Prices subject to
                    change with 30 days notice.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Billing &amp; Refunds
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Subscriptions auto-renew. Cancel anytime; access continues
                    until end of billing period. No refunds for partial months
                    or unused scans.
                  </p>
                </div>
              </div>
            </section>

            {/* Acceptable Use */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Acceptable use
              </h2>

              <div className="max-w-2xl">
                <p className="text-sm leading-relaxed text-muted-foreground mb-3">
                  You agree NOT to:
                </p>
                <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <span>Use the Service for illegal purposes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <span>Attempt unauthorized access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <span>Use bots or scrapers without permission</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <span>Circumvent usage limits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <span>Commercially exploit outputs without permission</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <span>Use the Service to manipulate markets</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Disclaimers */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Disclaimers
              </h2>

              <div className="p-5 rounded-xl border border-destructive/25 bg-destructive/5 text-[13px] leading-relaxed">
                <p className="font-semibold text-destructive mb-3">
                  THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES
                  OF ANY KIND.
                </p>
                <p className="text-muted-foreground mb-3">
                  We do not warrant that the Service will be uninterrupted,
                  error-free, or that results will be accurate or reliable.
                </p>
                <p className="font-medium text-foreground">
                  ScamDunk is NOT financial advice. You are solely responsible
                  for investment decisions.
                </p>
              </div>
            </section>

            {/* Limitation of Liability */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Limitation of liability
              </h2>

              <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                <p className="mb-3">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCAMDUNK SHALL NOT BE
                  LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                  OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS OR INVESTMENT
                  LOSSES.
                </p>
                <p>
                  Our total liability shall not exceed the amount you paid us in
                  the 12 months prior to the claim, or $100, whichever is
                  greater.
                </p>
              </div>
            </section>

            {/* Indemnification */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Indemnification
              </h2>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                You agree to defend, indemnify, and hold harmless ScamDunk from
                any claims, damages, or expenses arising from your violation of
                these Terms or your use of the Service.
              </p>
            </section>

            {/* Governing Law */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Governing law
              </h2>

              <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                <p className="mb-3">
                  <strong className="text-foreground">Governing Law:</strong>{" "}
                  These Terms are governed by the laws of Delaware, United
                  States.
                </p>
                <p>
                  <strong className="text-foreground">Disputes:</strong>{" "}
                  Disputes shall be resolved through binding arbitration. You
                  waive the right to participate in class action lawsuits.
                </p>
              </div>
            </section>

            {/* Modifications */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Service modifications
              </h2>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                We may modify, suspend, or discontinue the Service at any time.
                We may also modify these Terms; continued use constitutes
                acceptance of changes.
              </p>
            </section>

            {/* Contact */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Contact
              </h2>

              <div className="p-5 rounded-xl border border-border bg-card">
                <p className="text-[13px] leading-relaxed text-muted-foreground mb-2">
                  Questions about these Terms:
                </p>
                <p className="text-sm text-foreground">
                  <strong>Email:</strong>{" "}
                  <a
                    href="mailto:legal@scamdunk.com"
                    className="underline decoration-border underline-offset-2 hover:text-teal"
                  >
                    legal@scamdunk.com
                  </a>
                </p>
              </div>
            </section>

            {/* Links */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center border-t border-border/70 pt-10 pb-4">
              <Link href="/privacy" className="btn-pill btn-pill-ghost">
                Privacy Policy
              </Link>
              <Link href="/disclaimer" className="btn-pill btn-pill-ghost">
                Disclaimer
              </Link>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
