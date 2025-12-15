"use client";

import Link from "next/link";
import { FileText, AlertTriangle, Scale, Shield, CreditCard, XCircle, CheckCircle, RefreshCw } from "lucide-react";

export default function TermsOfServicePage() {
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
            <Link href="/privacy" className="hover:text-orange-400 transition">Privacy</Link>
            <Link href="/terms" className="text-orange-400">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-900/50 rounded-full mb-6">
            <FileText className="text-purple-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Terms of <span className="text-purple-500">Service</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Please read these terms carefully before using ScamDunk.
          </p>
          <p className="text-gray-500 mt-4">Last Updated: December 2024</p>
        </div>

        {/* Agreement */}
        <section className="mb-12">
          <div className="bg-purple-900/20 rounded-xl p-6 border border-purple-700/50">
            <h2 className="text-xl font-bold mb-4 text-purple-400">Agreement to Terms</h2>
            <p className="text-gray-300">
              By accessing or using ScamDunk (&quot;Service&quot;), you agree to be bound by these Terms of Service
              (&quot;Terms&quot;). If you disagree with any part of these terms, you do not have permission to access
              the Service. These Terms apply to all visitors, users, and others who access or use the Service.
            </p>
          </div>
        </section>

        {/* Service Description */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Shield className="text-purple-500" />
            Description of Service
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4 text-gray-300">
            <p>
              ScamDunk is a stock analysis tool that helps users identify potential red flags and
              manipulation patterns in publicly traded securities. The Service analyzes market data
              and user-provided information to generate risk assessments.
            </p>
            <p>
              <strong>The Service is provided for educational and informational purposes only.</strong> ScamDunk
              does not provide financial advice, investment recommendations, or any form of professional
              financial guidance.
            </p>
          </div>
        </section>

        {/* Eligibility */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Eligibility</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <CheckCircle className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span>You must be at least 18 years old to use this Service</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span>You must provide accurate and complete registration information</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span>You must maintain the security of your account credentials</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="text-green-500 mt-1 flex-shrink-0" size={18} />
                <span>You must comply with all applicable laws and regulations</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Account Terms */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Account Terms</h2>

          <div className="space-y-4">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Account Creation</h3>
              <ul className="space-y-2 text-gray-300">
                <li>You must provide a valid email address</li>
                <li>You must create a secure password</li>
                <li>One person or entity may not maintain multiple free accounts</li>
                <li>You are responsible for all activity under your account</li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Account Security</h3>
              <ul className="space-y-2 text-gray-300">
                <li>You must keep your password confidential</li>
                <li>You must notify us immediately of any unauthorized access</li>
                <li>We are not liable for losses due to compromised credentials</li>
                <li>You may not share, transfer, or sell your account</li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Account Termination</h3>
              <ul className="space-y-2 text-gray-300">
                <li>You may delete your account at any time</li>
                <li>We may suspend or terminate accounts that violate these Terms</li>
                <li>We may terminate accounts for prolonged inactivity (12+ months)</li>
                <li>Upon termination, your right to use the Service ceases immediately</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Subscription & Payment */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <CreditCard className="text-purple-500" />
            Subscription & Payment Terms
          </h2>

          <div className="space-y-4">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Free Plan</h3>
              <ul className="space-y-2 text-gray-300">
                <li>Limited to 5 stock scans per calendar month</li>
                <li>Usage resets on the first day of each month</li>
                <li>All features available within usage limits</li>
                <li>No credit card required</li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Paid Plan</h3>
              <ul className="space-y-2 text-gray-300">
                <li>200 stock scans per calendar month</li>
                <li>Billed monthly via Stripe</li>
                <li>Payment due at the start of each billing cycle</li>
                <li>Prices are subject to change with 30 days notice</li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Billing & Refunds</h3>
              <ul className="space-y-2 text-gray-300">
                <li>All payments are processed securely through Stripe</li>
                <li>Subscriptions auto-renew unless cancelled</li>
                <li>Cancel anytime; access continues until end of billing period</li>
                <li>No refunds for partial months or unused scans</li>
                <li>We may offer refunds at our sole discretion for service issues</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Acceptable Use */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <CheckCircle className="text-green-500" />
            Acceptable Use
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300 mb-4">You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree NOT to:</p>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Use the Service for any illegal purpose or to violate any laws</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Attempt to gain unauthorized access to any part of the Service</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Use automated systems (bots, scrapers) to access the Service without permission</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Interfere with or disrupt the Service or servers</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Circumvent usage limits or access controls</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Redistribute, resell, or commercially exploit Service outputs without permission</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Use the Service to manipulate markets or facilitate fraud</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Impersonate any person or entity</span>
              </li>
              <li className="flex items-start gap-3">
                <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                <span>Upload malicious code or content</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Intellectual Property */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Intellectual Property</h2>

          <div className="space-y-4">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Our Content</h3>
              <p className="text-gray-300">
                The Service and its original content (excluding user-provided content), features, and
                functionality are owned by ScamDunk and are protected by copyright, trademark, and other
                intellectual property laws. Our trademarks may not be used without prior written consent.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Your Content</h3>
              <p className="text-gray-300">
                You retain ownership of any content you submit (such as pitch text for analysis). By
                submitting content, you grant us a non-exclusive, worldwide, royalty-free license to use,
                process, and analyze that content solely for providing the Service. We will not share
                your submitted content publicly.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Analysis Results</h3>
              <p className="text-gray-300">
                You may use analysis results for personal, non-commercial purposes. You may share results
                with others, but you may not systematically collect, republish, or sell results. Attribution
                to ScamDunk is appreciated but not required for personal sharing.
              </p>
            </div>
          </div>
        </section>

        {/* Disclaimers */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <AlertTriangle className="text-red-500" />
            Disclaimers
          </h2>

          <div className="bg-red-900/20 rounded-xl p-6 border border-red-700/50 space-y-4">
            <p className="text-lg font-semibold text-red-400">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND.
            </p>
            <p className="text-gray-300">
              We expressly disclaim all warranties, whether express, implied, statutory, or otherwise, including
              but not limited to implied warranties of merchantability, fitness for a particular purpose, and
              non-infringement.
            </p>
            <p className="text-gray-300">
              <strong>We do not warrant that:</strong>
            </p>
            <ul className="space-y-2 text-gray-300">
              <li>• The Service will meet your requirements</li>
              <li>• The Service will be uninterrupted, timely, secure, or error-free</li>
              <li>• Analysis results will be accurate, reliable, or complete</li>
              <li>• Any errors will be corrected</li>
              <li>• The Service is free of viruses or harmful components</li>
            </ul>
            <p className="text-gray-300 font-semibold">
              ScamDunk is NOT financial advice. You are solely responsible for your investment decisions.
            </p>
          </div>
        </section>

        {/* Limitation of Liability */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Scale className="text-purple-500" />
            Limitation of Liability
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4 text-gray-300">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCAMDUNK AND ITS DIRECTORS, EMPLOYEES, PARTNERS,
              AGENTS, SUPPLIERS, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="space-y-2">
              <li>• Loss of profits, revenue, or data</li>
              <li>• Loss of goodwill or reputation</li>
              <li>• Investment losses</li>
              <li>• Cost of substitute services</li>
              <li>• Any other intangible losses</li>
            </ul>
            <p>
              ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, REGARDLESS OF WHETHER WE HAVE
              BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p>
              IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRIOR
              TO THE CLAIM, OR $100, WHICHEVER IS GREATER.
            </p>
          </div>
        </section>

        {/* Indemnification */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Indemnification</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300">
              You agree to defend, indemnify, and hold harmless ScamDunk and its officers, directors, employees,
              contractors, agents, licensors, suppliers, successors, and assigns from and against any claims,
              liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable
              attorneys&apos; fees) arising out of or relating to your violation of these Terms or your use of the
              Service.
            </p>
          </div>
        </section>

        {/* Governing Law */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Governing Law & Disputes</h2>

          <div className="space-y-4">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Governing Law</h3>
              <p className="text-gray-300">
                These Terms shall be governed by and construed in accordance with the laws of the State of
                Delaware, United States, without regard to its conflict of law provisions.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">Dispute Resolution</h3>
              <p className="text-gray-300">
                Any dispute arising from these Terms or the Service shall first be attempted to be resolved
                through good-faith negotiation. If negotiation fails, disputes shall be resolved through
                binding arbitration in accordance with the rules of the American Arbitration Association.
                The arbitration shall take place in Delaware. You agree to waive any right to participate
                in a class action lawsuit or class-wide arbitration.
              </p>
            </div>
          </div>
        </section>

        {/* Service Modifications */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <RefreshCw className="text-purple-500" />
            Service Modifications
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4 text-gray-300">
            <p>
              We reserve the right to modify, suspend, or discontinue the Service (or any part thereof) at
              any time, with or without notice. We shall not be liable to you or any third party for any
              modification, suspension, or discontinuance of the Service.
            </p>
            <p>
              We may also modify these Terms at any time. We will provide notice of material changes by
              posting the new Terms on this page and updating the &quot;Last Updated&quot; date. Your continued use
              of the Service after changes constitutes acceptance of the new Terms.
            </p>
          </div>
        </section>

        {/* Miscellaneous */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Miscellaneous</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4 text-gray-300">
            <p>
              <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy and Disclaimer,
              constitute the entire agreement between you and ScamDunk regarding the Service.
            </p>
            <p>
              <strong>Severability:</strong> If any provision of these Terms is found to be unenforceable,
              the remaining provisions will remain in full force and effect.
            </p>
            <p>
              <strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms shall
              not be considered a waiver of those rights.
            </p>
            <p>
              <strong>Assignment:</strong> You may not assign or transfer these Terms without our prior
              written consent. We may assign our rights and obligations without restriction.
            </p>
            <p>
              <strong>Force Majeure:</strong> We shall not be liable for any failure to perform due to
              circumstances beyond our reasonable control.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Contact Us</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300 mb-4">
              If you have any questions about these Terms, please contact us:
            </p>
            <ul className="space-y-2 text-gray-300">
              <li><strong>Email:</strong> <a href="mailto:legal@scamdunk.com" className="text-purple-400 hover:underline">legal@scamdunk.com</a></li>
            </ul>
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
            <Link href="/privacy" className="hover:text-orange-400 transition">Privacy</Link>
            <Link href="/terms" className="text-orange-400">Terms</Link>
            <Link href="/disclaimer" className="hover:text-orange-400 transition">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
