"use client";

import Link from "next/link";
import { Shield, TrendingUp, AlertTriangle, Globe, BarChart3, Brain, Database, Clock } from "lucide-react";

export default function AboutPage() {
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
            <Link href="/about" className="text-orange-400">About</Link>
            <Link href="/how-it-works" className="hover:text-orange-400 transition">How It Works</Link>
            <Link href="/privacy" className="hover:text-orange-400 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-400 transition">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            About <span className="text-orange-500">ScamDunk</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Helping retail investors identify potential stock manipulation and pump-and-dump schemes
            through data-driven analysis.
          </p>
        </div>

        {/* Mission Section */}
        <section className="mb-16">
          <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
              <Shield className="text-orange-500" />
              Our Mission
            </h2>
            <p className="text-gray-300 leading-relaxed">
              ScamDunk was created to help everyday investors protect themselves from stock manipulation
              schemes. We believe that access to analytical tools shouldn&apos;t be limited to Wall Street
              professionals. Our platform analyzes publicly available market data and identifies patterns
              commonly associated with pump-and-dump schemes, helping you make more informed decisions
              about investment opportunities you encounter.
            </p>
          </div>
        </section>

        {/* How Scans Work */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <Brain className="text-orange-500" />
            How Our Scans Work
          </h2>

          <div className="space-y-6">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-orange-400">1. Market Data Analysis</h3>
              <p className="text-gray-300">
                When you enter a stock ticker, we fetch real-time and historical market data including
                current price, trading volume, market capitalization, and 100 days of price history.
                This data comes from regulated financial data providers.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-orange-400">2. Pattern Detection</h3>
              <p className="text-gray-300">
                Our algorithms analyze price and volume patterns looking for signatures commonly associated
                with manipulation: sudden price spikes, abnormal volume explosions, and the classic
                &quot;pump-then-drop&quot; pattern where prices surge dramatically then collapse.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-orange-400">3. Structural Risk Assessment</h3>
              <p className="text-gray-300">
                We evaluate structural characteristics that make stocks more vulnerable to manipulation:
                penny stock pricing (under $5), small market capitalization, low trading liquidity, and
                trading on less-regulated OTC markets.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-orange-400">4. Behavioral Analysis</h3>
              <p className="text-gray-300">
                If you provide pitch text (like a message you received promoting the stock), we analyze
                it for red-flag language: promises of guaranteed returns, urgency tactics, claims of
                &quot;insider information,&quot; and specific return predictions.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-orange-400">5. Regulatory Cross-Reference</h3>
              <p className="text-gray-300">
                We check if the stock appears on the SEC&apos;s trading suspension list, which indicates
                regulatory action has been taken against the security.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-orange-400">6. Risk Score Calculation</h3>
              <p className="text-gray-300">
                Each detected signal contributes points to a total risk score. The score determines the
                overall risk level: LOW (0-2 points), MEDIUM (3-6 points), or HIGH (7+ points). Stocks
                on SEC alert lists automatically receive HIGH risk ratings.
              </p>
            </div>
          </div>
        </section>

        {/* Coverage Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <Globe className="text-orange-500" />
            Geographic & Asset Coverage
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="text-green-500" size={20} />
                What We Cover
              </h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong>United States stocks</strong> - Our primary focus</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong>NYSE</strong> - New York Stock Exchange listed securities</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong>NASDAQ</strong> - NASDAQ listed securities</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong>OTC Markets</strong> - Pink sheets, OTCQB, OTCQX</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="text-red-500" size={20} />
                What We Don&apos;t Cover
              </h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">✗</span>
                  <span><strong>International stocks</strong> - Non-US markets</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">✗</span>
                  <span><strong>Cryptocurrencies</strong> - Not currently supported</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">✗</span>
                  <span><strong>Options & Futures</strong> - Derivatives not analyzed</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">✗</span>
                  <span><strong>Bonds & ETFs</strong> - Fixed income not covered</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* What Results Mean */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <BarChart3 className="text-orange-500" />
            Understanding Your Scan Results
          </h2>

          <div className="space-y-4">
            <div className="bg-red-900/30 rounded-lg p-6 border border-red-700/50">
              <h3 className="text-lg font-semibold mb-2 text-red-400">HIGH Risk</h3>
              <p className="text-gray-300">
                Multiple significant red flags detected. The stock exhibits several characteristics
                commonly associated with pump-and-dump schemes or is on regulatory alert lists.
                <strong className="text-red-400"> Extreme caution is warranted.</strong> This does not
                mean the stock is definitively a scam, but the risk profile is elevated.
              </p>
            </div>

            <div className="bg-yellow-900/30 rounded-lg p-6 border border-yellow-700/50">
              <h3 className="text-lg font-semibold mb-2 text-yellow-400">MEDIUM Risk</h3>
              <p className="text-gray-300">
                Some concerning signals detected. The stock has characteristics that could indicate
                vulnerability to manipulation or early-stage promotional activity.
                <strong className="text-yellow-400"> Additional research recommended</strong> before
                making any investment decisions.
              </p>
            </div>

            <div className="bg-green-900/30 rounded-lg p-6 border border-green-700/50">
              <h3 className="text-lg font-semibold mb-2 text-green-400">LOW Risk</h3>
              <p className="text-gray-300">
                Few or no manipulation indicators detected. The stock does not exhibit patterns
                commonly associated with pump-and-dump schemes based on our analysis.
                <strong className="text-green-400"> This does NOT mean the stock is a good investment</strong> -
                only that obvious manipulation signals were not detected.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-2 text-gray-400">INSUFFICIENT DATA</h3>
              <p className="text-gray-300">
                Unable to retrieve adequate market data for analysis. This may occur with very new
                listings, delisted securities, or incorrect ticker symbols. No risk assessment can
                be provided.
              </p>
            </div>
          </div>
        </section>

        {/* Data Sources */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <Database className="text-orange-500" />
            Our Data Sources
          </h2>

          <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
            <ul className="space-y-4 text-gray-300">
              <li className="flex items-start gap-3">
                <Clock className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <div>
                  <strong>Market Data:</strong> Real-time and historical price/volume data from
                  licensed financial data providers with up to 15-minute delay on quotes.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <div>
                  <strong>Company Information:</strong> Exchange listings, market capitalization,
                  and corporate data updated daily.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <div>
                  <strong>Regulatory Data:</strong> SEC EDGAR RSS feeds for trading suspensions
                  and enforcement actions, checked in real-time.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="text-orange-500 mt-1 flex-shrink-0" size={18} />
                <div>
                  <strong>Historical Analysis:</strong> 100 days of daily OHLCV (Open, High, Low,
                  Close, Volume) data for pattern detection.
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* Important Links */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Important Documents</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Link href="/disclaimer" className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-orange-500 transition group">
              <h3 className="font-semibold mb-2 group-hover:text-orange-400 transition">Disclaimer & Limitations →</h3>
              <p className="text-sm text-gray-400">What our scans cannot detect and important limitations</p>
            </Link>
            <Link href="/how-it-works" className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-orange-500 transition group">
              <h3 className="font-semibold mb-2 group-hover:text-orange-400 transition">Methodology Details →</h3>
              <p className="text-sm text-gray-400">Deep dive into our scoring system and signals</p>
            </Link>
            <Link href="/privacy" className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-orange-500 transition group">
              <h3 className="font-semibold mb-2 group-hover:text-orange-400 transition">Privacy Policy →</h3>
              <p className="text-sm text-gray-400">How we collect, use, and protect your data</p>
            </Link>
            <Link href="/terms" className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-orange-500 transition group">
              <h3 className="font-semibold mb-2 group-hover:text-orange-400 transition">Terms of Service →</h3>
              <p className="text-sm text-gray-400">Rules and conditions for using ScamDunk</p>
            </Link>
          </div>
        </section>

        {/* Contact */}
        <section className="text-center">
          <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold mb-4">Questions?</h2>
            <p className="text-gray-300 mb-4">
              If you have questions about how ScamDunk works or need assistance, please reach out.
            </p>
            <p className="text-gray-400 text-sm">
              Contact: <a href="mailto:support@scamdunk.com" className="text-orange-400 hover:underline">support@scamdunk.com</a>
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p className="mb-4">
            ScamDunk is an educational tool and does not provide financial advice.
            See our <Link href="/disclaimer" className="text-orange-400 hover:underline">full disclaimer</Link>.
          </p>
          <div className="flex justify-center gap-6">
            <Link href="/about" className="hover:text-orange-400 transition">About</Link>
            <Link href="/privacy" className="hover:text-orange-400 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-400 transition">Terms</Link>
            <Link href="/disclaimer" className="hover:text-orange-400 transition">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
