"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Lock } from "lucide-react";

export default function PrivacyContent() {
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
                Privacy <span className="text-brand-blue">Policy</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Your privacy matters. This policy explains how we collect, use,
                and protect your information.
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Last Updated: December 2024
              </p>
            </div>

            {/* Introduction */}
            <section className="mb-10">
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                ScamDunk (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is
                committed to protecting your privacy. This policy explains how
                we collect, use, disclose, and safeguard your information when
                you use our stock analysis service.
              </p>
            </section>

            {/* Information We Collect */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Information we collect
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Account Information
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Email address, name (optional), encrypted password, and
                    account creation date.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Usage Information
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Stock tickers searched, pitch text submitted (optional),
                    scan results, timestamps, and monthly usage counts.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Payment Information
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Stripe customer ID and subscription status. We do NOT store
                    credit card numbers—all payment processing is handled by
                    Stripe.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Technical Information
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    IP address, browser type, device information, and session
                    cookies for authentication.
                  </p>
                </div>
              </div>
            </section>

            {/* How We Use Information */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                How we use your information
              </h2>

              <ul className="max-w-2xl space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>Provide our service and deliver scan results</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>Manage your account and track usage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>Process payments through Stripe</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>Maintain your scan history</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>Improve our service and features</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>Prevent fraud and abuse</span>
                </li>
              </ul>
            </section>

            {/* Data Sharing */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                How we share information
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    Service Providers
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    We share data with trusted partners: Stripe (payments),
                    OpenAI (AI analysis), Alpha Vantage (market data), and
                    hosting providers.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-destructive/25 bg-destructive/5">
                  <h3 className="text-[15px] font-semibold text-destructive mb-2">
                    We Do NOT:
                  </h3>
                  <ul className="text-[13px] leading-relaxed text-muted-foreground space-y-1">
                    <li>• Sell your personal information</li>
                    <li>• Share data with advertisers</li>
                    <li>• Use scan history for marketing</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Data Security */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Data security
              </h2>

              <div className="p-5 rounded-xl border border-border bg-card">
                <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                    <span>Encryption in transit (HTTPS/TLS)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                    <span>Encrypted database storage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                    <span>Passwords hashed with bcrypt</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                    <span>Secure session management</span>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  No method is 100% secure. We cannot guarantee absolute
                  security.
                </p>
              </div>
            </section>

            {/* Data Retention */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Data retention
              </h2>

              <ul className="max-w-2xl space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">Account data:</strong>{" "}
                  Until you delete your account
                </li>
                <li>
                  <strong className="text-foreground">Scan history:</strong> 12
                  months
                </li>
                <li>
                  <strong className="text-foreground">Usage logs:</strong> 90
                  days
                </li>
                <li>
                  <strong className="text-foreground">Payment records:</strong>{" "}
                  As required by law (typically 7 years)
                </li>
              </ul>
            </section>

            {/* Your Rights */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Your privacy rights
              </h2>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-2">
                    All Users Can:
                  </h3>
                  <ul className="text-[13px] leading-relaxed text-muted-foreground space-y-1">
                    <li>• Access and download your data</li>
                    <li>• Correct inaccurate information</li>
                    <li>• Delete your account and data</li>
                    <li>• Withdraw consent</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    California Residents (CCPA)
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Additional rights to know what data we collect, opt out of
                    sales (we don&apos;t sell data), and non-discrimination for
                    exercising privacy rights.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    EU/EEA Residents (GDPR)
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Additional rights to data portability, restrict processing,
                    object to processing, and lodge complaints with supervisory
                    authorities.
                  </p>
                </div>
              </div>
            </section>

            {/* Cookies */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Cookies
              </h2>

              <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                <p className="mb-3">
                  We use essential cookies for authentication and session
                  management.
                </p>
                <p>We do NOT use advertising cookies or third-party tracking.</p>
              </div>
            </section>

            {/* Children */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Children&apos;s privacy
              </h2>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                ScamDunk is not intended for users under 18. We do not knowingly
                collect data from children.
              </p>
            </section>

            {/* Changes */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Policy changes
              </h2>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                We may update this policy. We&apos;ll notify you of material
                changes by posting the new policy and updating the date. For
                significant changes, we may also send email notification.
              </p>
            </section>

            {/* Contact */}
            <section className="mb-10 border-t border-border/70 pt-10">
              <h2 className="font-editorial mb-6 text-2xl md:text-[1.75rem] leading-tight text-foreground">
                Contact &amp; data requests
              </h2>

              <div className="p-5 rounded-xl border border-border bg-card">
                <p className="text-[13px] leading-relaxed text-muted-foreground mb-2">
                  To exercise privacy rights or ask questions:
                </p>
                <p className="text-sm text-foreground">
                  <strong>Email:</strong>{" "}
                  <a
                    href="mailto:privacy@scamdunk.com"
                    className="underline decoration-border underline-offset-2 hover:text-teal"
                  >
                    privacy@scamdunk.com
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  We respond to verified requests within 30 days.
                </p>
              </div>
            </section>

            {/* Links */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center border-t border-border/70 pt-10 pb-4">
              <Link href="/terms" className="btn-pill btn-pill-ghost">
                Terms of Service
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
