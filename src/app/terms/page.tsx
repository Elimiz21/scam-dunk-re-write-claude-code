"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  FileText,
  AlertTriangle,
  Scale,
  Shield,
  CreditCard,
  XCircle,
  CheckCircle,
  RefreshCw
} from "lucide-react";

export default function TermsOfServicePage() {
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
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-2xl mb-6">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Terms of Service
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Please read these terms carefully before using ScamDunk.
              </p>
              <p className="text-sm text-muted-foreground mt-2">Last Updated: December 2024</p>
            </div>

            {/* Agreement */}
            <section className="mb-8">
              <div className="p-5 rounded-xl bg-primary/10 border border-primary/20">
                <h2 className="font-semibold mb-2">Agreement to Terms</h2>
                <p className="text-sm text-muted-foreground">
                  By accessing or using ScamDunk, you agree to these Terms of Service. If you disagree,
                  you may not use the Service.
                </p>
              </div>
            </section>

            {/* Service Description */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Service Description
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p className="mb-3">
                  ScamDunk is a stock analysis tool that helps identify potential red flags and
                  manipulation patterns in publicly traded securities.
                </p>
                <p className="font-medium">
                  The Service is for educational and informational purposes only. ScamDunk does not
                  provide financial advice or investment recommendations.
                </p>
              </div>
            </section>

            {/* Eligibility */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Eligibility</h2>

              <div className="p-5 rounded-xl bg-card border border-border">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>You must be at least 18 years old</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>You must provide accurate registration information</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>You must maintain security of your credentials</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>You must comply with applicable laws</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Subscription Terms */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Subscription & Payment
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Free Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    5 scans per month, resets on the first of each month. No credit card required.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Paid Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    200 scans per month, billed monthly via Stripe. Prices subject to change with 30 days notice.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Billing & Refunds</h3>
                  <p className="text-sm text-muted-foreground">
                    Subscriptions auto-renew. Cancel anytime; access continues until end of billing period.
                    No refunds for partial months or unused scans.
                  </p>
                </div>
              </div>
            </section>

            {/* Acceptable Use */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Acceptable Use
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-3">You agree NOT to:</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
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
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Disclaimers
              </h2>

              <div className="p-5 rounded-xl bg-destructive/10 border border-destructive/20 text-sm">
                <p className="font-medium text-destructive mb-3">
                  THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND.
                </p>
                <p className="text-muted-foreground mb-3">
                  We do not warrant that the Service will be uninterrupted, error-free, or that results
                  will be accurate or reliable.
                </p>
                <p className="text-muted-foreground font-medium">
                  ScamDunk is NOT financial advice. You are solely responsible for investment decisions.
                </p>
              </div>
            </section>

            {/* Limitation of Liability */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                Limitation of Liability
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p className="mb-3">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCAMDUNK SHALL NOT BE LIABLE FOR ANY INDIRECT,
                  INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS OR
                  INVESTMENT LOSSES.
                </p>
                <p>
                  Our total liability shall not exceed the amount you paid us in the 12 months prior to
                  the claim, or $100, whichever is greater.
                </p>
              </div>
            </section>

            {/* Indemnification */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Indemnification</h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p>
                  You agree to defend, indemnify, and hold harmless ScamDunk from any claims, damages, or
                  expenses arising from your violation of these Terms or your use of the Service.
                </p>
              </div>
            </section>

            {/* Governing Law */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Governing Law</h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p className="mb-3">
                  <strong>Governing Law:</strong> These Terms are governed by the laws of Delaware, United States.
                </p>
                <p>
                  <strong>Disputes:</strong> Disputes shall be resolved through binding arbitration. You waive
                  the right to participate in class action lawsuits.
                </p>
              </div>
            </section>

            {/* Modifications */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Service Modifications
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p>
                  We may modify, suspend, or discontinue the Service at any time. We may also modify these
                  Terms; continued use constitutes acceptance of changes.
                </p>
              </div>
            </section>

            {/* Contact */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Contact</h2>

              <div className="p-5 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-2">Questions about these Terms:</p>
                <p className="text-sm">
                  <strong>Email:</strong>{" "}
                  <a href="mailto:legal@scamdunk.com" className="text-primary hover:underline">
                    legal@scamdunk.com
                  </a>
                </p>
              </div>
            </section>

            {/* Links */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/privacy"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/disclaimer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors"
              >
                Disclaimer
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
