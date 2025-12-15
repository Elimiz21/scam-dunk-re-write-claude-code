"use client";

import Link from "next/link";
import { Shield, Database, Eye, Lock, Globe, Trash2, Bell, Users, FileText } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-orange-500">
            ScamDunk
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/" className="hover:text-orange-400 transition">Home</Link>
            <Link href="/about" className="hover:text-orange-400 transition">About</Link>
            <Link href="/how-it-works" className="hover:text-orange-400 transition">How It Works</Link>
            <Link href="/privacy" className="text-orange-400">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-400 transition">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-900/50 rounded-full mb-6">
            <Shield className="text-blue-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Privacy <span className="text-blue-500">Policy</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Your privacy matters to us. This policy explains how we collect, use, and protect your information.
          </p>
          <p className="text-gray-500 mt-4">Last Updated: December 2024</p>
        </div>

        {/* Introduction */}
        <section className="mb-12">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300 leading-relaxed">
              ScamDunk (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy
              Policy explains how we collect, use, disclose, and safeguard your information when you use our
              stock analysis service. Please read this policy carefully. By using ScamDunk, you consent to the
              data practices described in this policy.
            </p>
          </div>
        </section>

        {/* Information We Collect */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Database className="text-blue-500" />
            Information We Collect
          </h2>

          <div className="space-y-6">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">Account Information</h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Email address</strong> - Required for account creation and communication</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Name</strong> - Optional, used for personalization</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Password</strong> - Stored in encrypted (hashed) form; we cannot see your password</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Account creation date</strong> - For account management</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">Usage Information</h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Stock tickers searched</strong> - To provide analysis and maintain scan history</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Pitch text submitted</strong> - Optional text you provide for behavioral analysis</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Scan results</strong> - Risk levels and signals detected</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Scan timestamps</strong> - When you performed each analysis</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Monthly usage counts</strong> - To enforce plan limits</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">Payment Information</h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Stripe customer ID</strong> - Links your account to payment processing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Subscription status</strong> - Whether you have a paid plan</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Note:</strong> We do NOT store credit card numbers, CVVs, or full payment details. All payment processing is handled securely by Stripe.</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">Technical Information</h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>IP address</strong> - For security and abuse prevention</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Browser type and version</strong> - For compatibility and troubleshooting</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Device information</strong> - Operating system, screen resolution</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong>Cookies and session data</strong> - For authentication and preferences</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* How We Use Information */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Eye className="text-blue-500" />
            How We Use Your Information
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <ul className="space-y-4 text-gray-300">
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Provide our service</strong> - Perform stock scans and deliver results</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Manage your account</strong> - Authentication, profile management, usage tracking</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Process payments</strong> - Handle subscriptions and billing through Stripe</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Maintain scan history</strong> - Allow you to review your past analyses</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Improve our service</strong> - Analyze usage patterns to enhance features</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Communicate with you</strong> - Send service updates, security alerts, and support responses</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Prevent abuse</strong> - Detect and prevent fraud, spam, and unauthorized access</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <span><strong>Legal compliance</strong> - Comply with applicable laws and regulations</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Data Sharing */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Users className="text-blue-500" />
            How We Share Your Information
          </h2>

          <div className="space-y-4">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">Service Providers</h3>
              <p className="text-gray-300 mb-4">We share data with trusted third parties who help us operate our service:</p>
              <ul className="space-y-2 text-gray-300">
                <li><strong>Stripe</strong> - Payment processing (receives payment info, not your scan data)</li>
                <li><strong>OpenAI</strong> - AI narrative generation (receives anonymized scan context)</li>
                <li><strong>Alpha Vantage</strong> - Market data provider (receives only ticker symbols)</li>
                <li><strong>Supabase/Database hosting</strong> - Secure data storage</li>
                <li><strong>Vercel</strong> - Website hosting and delivery</li>
              </ul>
            </div>

            <div className="bg-red-900/20 rounded-lg p-6 border border-red-700/50">
              <h3 className="text-lg font-semibold mb-3 text-red-400">We Do NOT:</h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-red-400">✗</span>
                  <span>Sell your personal information to third parties</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400">✗</span>
                  <span>Share your data with advertisers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400">✗</span>
                  <span>Use your scan history for marketing purposes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400">✗</span>
                  <span>Share your pitch text with anyone other than AI processing</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">Legal Requirements</h3>
              <p className="text-gray-300">
                We may disclose your information if required by law, court order, or government request,
                or if we believe disclosure is necessary to protect our rights, your safety, or the safety
                of others, investigate fraud, or respond to a government request.
              </p>
            </div>
          </div>
        </section>

        {/* Data Security */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Lock className="text-blue-500" />
            Data Security
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4">
            <p className="text-gray-300">We implement industry-standard security measures to protect your data:</p>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <Lock className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Encryption in transit</strong> - All data transmitted via HTTPS/TLS</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Encryption at rest</strong> - Database encryption for stored data</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Password hashing</strong> - Passwords stored using bcrypt (one-way hash)</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Secure sessions</strong> - JWT tokens with httpOnly cookies</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Access controls</strong> - Role-based access to administrative functions</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Audit logging</strong> - Security-relevant actions are logged</span>
              </li>
            </ul>
            <p className="text-gray-400 text-sm mt-4">
              While we strive to protect your information, no method of transmission over the Internet
              or electronic storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </div>
        </section>

        {/* Data Retention */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <FileText className="text-blue-500" />
            Data Retention
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <ul className="space-y-4 text-gray-300">
              <li>
                <strong>Account data:</strong> Retained until you delete your account
              </li>
              <li>
                <strong>Scan history:</strong> Retained for 12 months, then automatically deleted
              </li>
              <li>
                <strong>Usage logs:</strong> Retained for 90 days for operational purposes
              </li>
              <li>
                <strong>Payment records:</strong> Retained as required by tax and financial regulations (typically 7 years)
              </li>
              <li>
                <strong>Security logs:</strong> Retained for 1 year for security investigation purposes
              </li>
            </ul>
          </div>
        </section>

        {/* Your Rights */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Shield className="text-blue-500" />
            Your Privacy Rights
          </h2>

          <div className="space-y-4">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">All Users Have the Right To:</h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span><strong>Access</strong> - Request a copy of your personal data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span><strong>Correction</strong> - Update inaccurate or incomplete data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span><strong>Deletion</strong> - Request deletion of your account and data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span><strong>Export</strong> - Receive your data in a portable format</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span><strong>Withdraw consent</strong> - Opt out of non-essential data processing</span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-900/20 rounded-lg p-6 border border-blue-700/50">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">For California Residents (CCPA)</h3>
              <p className="text-gray-300 mb-3">Under the California Consumer Privacy Act, you additionally have the right to:</p>
              <ul className="space-y-2 text-gray-300">
                <li>Know what personal information we collect and how it&apos;s used</li>
                <li>Know whether your data is sold or disclosed, and to whom</li>
                <li>Say no to the sale of personal information (we don&apos;t sell data)</li>
                <li>Non-discrimination for exercising your privacy rights</li>
              </ul>
            </div>

            <div className="bg-blue-900/20 rounded-lg p-6 border border-blue-700/50">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">For EU/EEA Residents (GDPR)</h3>
              <p className="text-gray-300 mb-3">Under the General Data Protection Regulation, you additionally have the right to:</p>
              <ul className="space-y-2 text-gray-300">
                <li>Data portability - receive your data in a structured, machine-readable format</li>
                <li>Object to processing based on legitimate interests</li>
                <li>Restrict processing in certain circumstances</li>
                <li>Lodge a complaint with a supervisory authority</li>
                <li>Withdraw consent at any time</li>
              </ul>
              <p className="text-gray-400 text-sm mt-3">
                Legal basis for processing: Contract performance (providing our service), legitimate interests
                (improving our service, security), and consent (marketing communications).
              </p>
            </div>
          </div>
        </section>

        {/* Cookies */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Globe className="text-blue-500" />
            Cookies & Tracking
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4">
            <p className="text-gray-300">We use the following types of cookies:</p>
            <ul className="space-y-3 text-gray-300">
              <li>
                <strong>Essential cookies:</strong> Required for authentication and basic functionality.
                Cannot be disabled.
              </li>
              <li>
                <strong>Session cookies:</strong> Maintain your login state. Deleted when you close your browser.
              </li>
              <li>
                <strong>Preference cookies:</strong> Remember your settings (e.g., theme preference).
              </li>
            </ul>
            <p className="text-gray-400 text-sm">
              We do not use advertising cookies or third-party tracking cookies. We do not participate
              in ad networks or cross-site tracking.
            </p>
          </div>
        </section>

        {/* Children's Privacy */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Children&apos;s Privacy</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300">
              ScamDunk is not intended for users under 18 years of age. We do not knowingly collect
              personal information from children. If you are a parent or guardian and believe your
              child has provided us with personal information, please contact us immediately. If we
              discover we have collected information from a child under 18, we will promptly delete it.
            </p>
          </div>
        </section>

        {/* International Transfers */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">International Data Transfers</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300">
              Your information may be transferred to and processed in the United States and other
              countries where our service providers operate. These countries may have different data
              protection laws than your country of residence. By using ScamDunk, you consent to
              this transfer. We ensure appropriate safeguards are in place through standard contractual
              clauses and other legally approved mechanisms.
            </p>
          </div>
        </section>

        {/* Changes to Policy */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Bell className="text-blue-500" />
            Changes to This Policy
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300">
              We may update this Privacy Policy from time to time. We will notify you of any material
              changes by posting the new policy on this page and updating the &quot;Last Updated&quot; date.
              For significant changes, we may also send you an email notification. We encourage you
              to review this policy periodically.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Trash2 className="text-blue-500" />
            Contact Us & Data Requests
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300 mb-4">
              To exercise your privacy rights or ask questions about this policy, contact us at:
            </p>
            <ul className="space-y-2 text-gray-300">
              <li><strong>Email:</strong> <a href="mailto:privacy@scamdunk.com" className="text-blue-400 hover:underline">privacy@scamdunk.com</a></li>
              <li><strong>Subject Line:</strong> Include &quot;Privacy Request&quot; for data-related requests</li>
            </ul>
            <p className="text-gray-400 text-sm mt-4">
              We will respond to verified requests within 30 days (or sooner as required by applicable law).
            </p>
          </div>
        </section>

        {/* Last Updated */}
        <div className="text-center text-gray-500 text-sm">
          <p>Last Updated: December 2024</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
          <div className="flex justify-center gap-6">
            <Link href="/about" className="hover:text-orange-400 transition">About</Link>
            <Link href="/privacy" className="text-orange-400">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-400 transition">Terms</Link>
            <Link href="/disclaimer" className="hover:text-orange-400 transition">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
