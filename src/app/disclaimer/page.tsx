"use client";

import Link from "next/link";
import { AlertTriangle, XCircle, ShieldAlert, Scale, FileWarning } from "lucide-react";

export default function DisclaimerPage() {
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
            <Link href="/terms" className="hover:text-orange-400 transition">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-900/50 rounded-full mb-6">
            <AlertTriangle className="text-red-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Disclaimer & <span className="text-red-500">Limitations</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Please read this entire page carefully before using ScamDunk. Understanding our limitations
            is essential for using this tool responsibly.
          </p>
        </div>

        {/* Critical Warning Box */}
        <div className="bg-red-900/30 border-2 border-red-600 rounded-xl p-8 mb-12">
          <h2 className="text-2xl font-bold text-red-400 mb-4 flex items-center gap-3">
            <ShieldAlert size={28} />
            CRITICAL DISCLAIMER
          </h2>
          <div className="space-y-4 text-gray-200">
            <p className="text-lg font-semibold">
              ScamDunk is NOT financial advice. ScamDunk is NOT investment advice. ScamDunk does NOT
              recommend buying or selling any securities.
            </p>
            <p>
              ScamDunk is an educational and informational tool designed to help users identify potential
              red flags in stock promotions. Our analysis is based on pattern recognition and publicly
              available data. <strong>We cannot and do not guarantee the accuracy, completeness, or
              reliability of our assessments.</strong>
            </p>
            <p>
              <strong className="text-red-400">You are solely responsible for your own investment decisions.</strong> Always
              conduct your own due diligence and consult with qualified financial professionals before
              making any investment.
            </p>
          </div>
        </div>

        {/* What We Do NOT Check */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <XCircle className="text-red-500" />
            What Our Scans Do NOT Check
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300 mb-6">
              Our automated analysis has significant limitations. The following are examples of things
              we <strong className="text-red-400">cannot detect or verify</strong>:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Financial statement fraud</strong> - We do not audit or analyze company financials</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Management integrity</strong> - We cannot assess the honesty of company leadership</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Business viability</strong> - We don&apos;t evaluate if a company&apos;s business model works</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Coordinated manipulation</strong> - Sophisticated schemes may not trigger our patterns</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Insider trading</strong> - We cannot detect non-public information trading</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Regulatory compliance</strong> - We don&apos;t verify SEC filing accuracy</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Social media manipulation</strong> - Coordinated online campaigns</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Celebrity/influencer schemes</strong> - Paid promotions and endorsements</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Shell company structures</strong> - Complex corporate fraud</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Early-stage manipulation</strong> - Schemes before patterns emerge</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>International fraud</strong> - Non-US market manipulation</span>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 mt-1 flex-shrink-0" size={18} />
                  <span className="text-gray-300"><strong>Future performance</strong> - We cannot predict stock movements</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Potential for Errors */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <FileWarning className="text-yellow-500" />
            We Can Make Mistakes
          </h2>

          <div className="space-y-4">
            <div className="bg-yellow-900/20 rounded-lg p-6 border border-yellow-700/50">
              <h3 className="text-lg font-semibold mb-3 text-yellow-400">False Positives</h3>
              <p className="text-gray-300">
                Our system may flag legitimate stocks as high risk. Legitimate companies, especially
                smaller ones, may exhibit characteristics similar to manipulation targets (low price,
                small market cap, high volatility) for entirely valid reasons. A HIGH risk score does
                not mean a stock is definitely a scam.
              </p>
            </div>

            <div className="bg-yellow-900/20 rounded-lg p-6 border border-yellow-700/50">
              <h3 className="text-lg font-semibold mb-3 text-yellow-400">False Negatives</h3>
              <p className="text-gray-300">
                Our system may fail to detect actual scams. Sophisticated manipulators may use techniques
                that don&apos;t trigger our pattern detection. A LOW risk score does not mean a stock is safe
                or a good investment. <strong>Never rely solely on our assessment.</strong>
              </p>
            </div>

            <div className="bg-yellow-900/20 rounded-lg p-6 border border-yellow-700/50">
              <h3 className="text-lg font-semibold mb-3 text-yellow-400">Data Errors</h3>
              <p className="text-gray-300">
                Market data may be delayed, incomplete, or incorrect. Data providers may have outages
                or errors. Historical data may not reflect stock splits, dividends, or other corporate
                actions accurately. We rely on third-party data sources and cannot guarantee their accuracy.
              </p>
            </div>

            <div className="bg-yellow-900/20 rounded-lg p-6 border border-yellow-700/50">
              <h3 className="text-lg font-semibold mb-3 text-yellow-400">Algorithm Limitations</h3>
              <p className="text-gray-300">
                Our pattern detection algorithms are based on historical manipulation schemes. New
                manipulation tactics may not be detected. Market conditions change, and patterns that
                indicated manipulation in the past may occur for legitimate reasons today.
              </p>
            </div>
          </div>
        </section>

        {/* Geographic Limitations */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Geographic & Asset Limitations</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <ul className="space-y-4 text-gray-300">
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <span>
                  <strong>US Markets Only:</strong> ScamDunk only analyzes securities traded on US exchanges
                  (NYSE, NASDAQ, OTC Markets). International stocks, ADRs, and foreign securities are not supported.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <span>
                  <strong>Stocks Only:</strong> We do not analyze cryptocurrencies, options, futures, bonds,
                  ETFs, mutual funds, or other financial instruments.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <span>
                  <strong>Data Delays:</strong> Market data may be delayed by 15 minutes or more. Real-time
                  data is not guaranteed.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <span>
                  <strong>Historical Data:</strong> We analyze approximately 100 days of historical data.
                  Longer-term patterns may not be captured.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* No Professional Relationship */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Scale className="text-blue-500" />
            No Professional Relationship
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4 text-gray-300">
            <p>
              <strong>No Fiduciary Duty:</strong> ScamDunk does not owe you any fiduciary duty. We are not
              your financial advisor, investment advisor, broker, or legal counsel.
            </p>
            <p>
              <strong>No Attorney-Client Relationship:</strong> Nothing on this platform creates an
              attorney-client relationship or provides legal advice.
            </p>
            <p>
              <strong>No Investment Advisory Relationship:</strong> ScamDunk is not registered as an
              investment advisor with the SEC or any state securities regulator. We do not provide
              personalized investment advice.
            </p>
            <p>
              <strong>Educational Purpose:</strong> All information provided is for educational and
              informational purposes only. It should not be construed as a recommendation to buy, sell,
              or hold any security.
            </p>
          </div>
        </section>

        {/* Risk of Loss */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Investment Risk Warning</h2>

          <div className="bg-red-900/20 rounded-xl p-6 border border-red-700/50 space-y-4 text-gray-300">
            <p className="text-lg font-semibold text-red-400">
              Investing in securities involves substantial risk of loss. You may lose some or all of
              your investment.
            </p>
            <p>
              Past performance is not indicative of future results. The fact that a stock received a
              LOW risk score in the past does not mean it will perform well or that it won&apos;t be involved
              in manipulation in the future.
            </p>
            <p>
              Penny stocks and OTC securities are particularly risky. Many are thinly traded, have
              limited disclosure requirements, and are frequently targets of manipulation schemes.
              Only invest money you can afford to lose entirely.
            </p>
          </div>
        </section>

        {/* Limitation of Liability */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Limitation of Liability</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4 text-gray-300">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCAMDUNK AND ITS OWNERS, OPERATORS, AFFILIATES,
              EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THIS SERVICE.
            </p>
            <p>
              This includes, without limitation, damages for lost profits, lost data, business interruption,
              personal injury, or any other commercial damages or losses, even if ScamDunk has been advised
              of the possibility of such damages.
            </p>
            <p>
              <strong>YOU EXPRESSLY AGREE THAT YOUR USE OF SCAMDUNK IS AT YOUR SOLE RISK.</strong> The
              service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind.
            </p>
          </div>
        </section>

        {/* Indemnification */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Indemnification</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 text-gray-300">
            <p>
              You agree to indemnify, defend, and hold harmless ScamDunk and its owners, operators,
              affiliates, employees, and agents from any claims, damages, losses, liabilities, costs,
              or expenses (including reasonable attorneys&apos; fees) arising out of or related to your use
              of the service, your violation of these terms, or your violation of any rights of another party.
            </p>
          </div>
        </section>

        {/* Acknowledgment */}
        <section className="mb-12">
          <div className="bg-orange-900/30 rounded-xl p-8 border border-orange-600">
            <h2 className="text-2xl font-bold mb-4 text-orange-400">By Using ScamDunk, You Acknowledge:</h2>
            <ul className="space-y-3 text-gray-200">
              <li className="flex items-start gap-3">
                <span className="text-orange-400 font-bold">1.</span>
                <span>You have read and understood this entire disclaimer</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orange-400 font-bold">2.</span>
                <span>ScamDunk is not providing financial, investment, or legal advice</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orange-400 font-bold">3.</span>
                <span>Our analysis may contain errors and should not be relied upon exclusively</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orange-400 font-bold">4.</span>
                <span>You are solely responsible for your investment decisions</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orange-400 font-bold">5.</span>
                <span>Investing involves risk of loss, including total loss of principal</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orange-400 font-bold">6.</span>
                <span>You will consult qualified professionals before making investment decisions</span>
              </li>
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
            <Link href="/terms" className="hover:text-orange-400 transition">Terms</Link>
            <Link href="/disclaimer" className="text-orange-400">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
