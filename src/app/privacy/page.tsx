"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  Shield,
  Database,
  Eye,
  Lock,
  Users,
  Bell,
  Trash2,
  Globe
} from "lucide-react";

export default function PrivacyPolicyPage() {
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
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Privacy Policy
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Your privacy matters. This policy explains how we collect, use, and protect your information.
              </p>
              <p className="text-sm text-muted-foreground mt-2">Last Updated: December 2024</p>
            </div>

            {/* Introduction */}
            <section className="mb-8">
              <div className="p-5 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground">
                  ScamDunk (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This policy
                  explains how we collect, use, disclose, and safeguard your information when you use our
                  stock analysis service.
                </p>
              </div>
            </section>

            {/* Information We Collect */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Information We Collect
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Account Information</h3>
                  <p className="text-sm text-muted-foreground">
                    Email address, name (optional), encrypted password, and account creation date.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Usage Information</h3>
                  <p className="text-sm text-muted-foreground">
                    Stock tickers searched, pitch text submitted (optional), scan results, timestamps, and monthly usage counts.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Payment Information</h3>
                  <p className="text-sm text-muted-foreground">
                    Stripe customer ID and subscription status. We do NOT store credit card numbers—all payment processing is handled by Stripe.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Technical Information</h3>
                  <p className="text-sm text-muted-foreground">
                    IP address, browser type, device information, and session cookies for authentication.
                  </p>
                </div>
              </div>
            </section>

            {/* How We Use Information */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                How We Use Your Information
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span>Provide our service and deliver scan results</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span>Manage your account and track usage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span>Process payments through Stripe</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span>Maintain your scan history</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span>Improve our service and features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span>Prevent fraud and abuse</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Data Sharing */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                How We Share Information
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">Service Providers</h3>
                  <p className="text-sm text-muted-foreground">
                    We share data with trusted partners: Stripe (payments), OpenAI (AI analysis),
                    Alpha Vantage (market data), and hosting providers.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <h3 className="font-medium mb-2 text-destructive">We Do NOT:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Sell your personal information</li>
                    <li>• Share data with advertisers</li>
                    <li>• Use scan history for marketing</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Data Security */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Data Security
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Encryption in transit (HTTPS/TLS)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Encrypted database storage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Passwords hashed with bcrypt</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Secure session management</span>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  No method is 100% secure. We cannot guarantee absolute security.
                </p>
              </div>
            </section>

            {/* Data Retention */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Data Retention</h2>

              <div className="p-5 rounded-xl bg-card border border-border">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><strong>Account data:</strong> Until you delete your account</li>
                  <li><strong>Scan history:</strong> 12 months</li>
                  <li><strong>Usage logs:</strong> 90 days</li>
                  <li><strong>Payment records:</strong> As required by law (typically 7 years)</li>
                </ul>
              </div>
            </section>

            {/* Your Rights */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Your Privacy Rights
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">All Users Can:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Access and download your data</li>
                    <li>• Correct inaccurate information</li>
                    <li>• Delete your account and data</li>
                    <li>• Withdraw consent</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">California Residents (CCPA)</h3>
                  <p className="text-sm text-muted-foreground">
                    Additional rights to know what data we collect, opt out of sales (we don&apos;t sell data),
                    and non-discrimination for exercising privacy rights.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-medium mb-2">EU/EEA Residents (GDPR)</h3>
                  <p className="text-sm text-muted-foreground">
                    Additional rights to data portability, restrict processing, object to processing,
                    and lodge complaints with supervisory authorities.
                  </p>
                </div>
              </div>
            </section>

            {/* Cookies */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Cookies
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p className="mb-3">We use essential cookies for authentication and session management.</p>
                <p>We do NOT use advertising cookies or third-party tracking.</p>
              </div>
            </section>

            {/* Children */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Children&apos;s Privacy</h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p>
                  ScamDunk is not intended for users under 18. We do not knowingly collect data from children.
                </p>
              </div>
            </section>

            {/* Changes */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Policy Changes
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border text-sm text-muted-foreground">
                <p>
                  We may update this policy. We&apos;ll notify you of material changes by posting the new policy
                  and updating the date. For significant changes, we may also send email notification.
                </p>
              </div>
            </section>

            {/* Contact */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-primary" />
                Contact & Data Requests
              </h2>

              <div className="p-5 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-2">
                  To exercise privacy rights or ask questions:
                </p>
                <p className="text-sm">
                  <strong>Email:</strong>{" "}
                  <a href="mailto:privacy@scamdunk.com" className="text-primary hover:underline">
                    privacy@scamdunk.com
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  We respond to verified requests within 30 days.
                </p>
              </div>
            </section>

            {/* Links */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/terms"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors"
              >
                Terms of Service
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
