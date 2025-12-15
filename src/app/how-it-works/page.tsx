"use client";

import Link from "next/link";
import { Brain, TrendingUp, AlertTriangle, BarChart3, Shield, Zap, Database, Search, FileText } from "lucide-react";

export default function HowItWorksPage() {
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
            <Link href="/how-it-works" className="text-orange-400">How It Works</Link>
            <Link href="/privacy" className="hover:text-orange-400 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-400 transition">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-900/50 rounded-full mb-6">
            <Brain className="text-orange-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            How <span className="text-orange-500">ScamDunk</span> Works
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            A detailed look at our methodology for detecting potential stock manipulation patterns.
          </p>
        </div>

        {/* Analysis Pipeline */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <Zap className="text-orange-500" />
            The Analysis Pipeline
          </h2>

          <div className="relative">
            {/* Pipeline Steps */}
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-xl font-bold">1</div>
                <div className="flex-grow bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-orange-400">Input Processing</h3>
                  <p className="text-gray-300">
                    You enter a stock ticker symbol and optionally provide pitch text (promotional message you received).
                    We validate the ticker format and prepare the query for market data retrieval.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-xl font-bold">2</div>
                <div className="flex-grow bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-orange-400">Market Data Fetch</h3>
                  <p className="text-gray-300">
                    We retrieve real-time and historical market data including: current price, trading volume,
                    market capitalization, exchange listing, and 100 days of price history (OHLCV data).
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-xl font-bold">3</div>
                <div className="flex-grow bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-orange-400">Signal Detection</h3>
                  <p className="text-gray-300">
                    Our algorithms analyze the data looking for patterns commonly associated with manipulation:
                    structural vulnerabilities, price/volume anomalies, and regulatory red flags.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-xl font-bold">4</div>
                <div className="flex-grow bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-orange-400">Behavioral Analysis</h3>
                  <p className="text-gray-300">
                    If you provided pitch text, we perform NLP analysis to detect manipulation tactics:
                    guaranteed return promises, urgency pressure, claims of insider information, and more.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-xl font-bold">5</div>
                <div className="flex-grow bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-orange-400">Risk Scoring</h3>
                  <p className="text-gray-300">
                    Each detected signal contributes weighted points to a total score. Higher scores indicate
                    more red flags. The score determines the overall risk level classification.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-xl font-bold">6</div>
                <div className="flex-grow bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-orange-400">Report Generation</h3>
                  <p className="text-gray-300">
                    We generate a human-readable narrative explaining the detected signals, their significance,
                    and suggestions for further research. All findings are presented in an easy-to-understand format.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Signal Categories */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <BarChart3 className="text-orange-500" />
            Signal Categories & Weights
          </h2>

          <p className="text-gray-300 mb-6">
            Our scoring system uses four categories of signals, each contributing different weights based on
            their significance as manipulation indicators.
          </p>

          {/* Structural Signals */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Database className="text-blue-500" size={20} />
              Structural Signals
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
              Characteristics that make stocks more vulnerable to manipulation
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="py-3 px-4 text-gray-400 font-medium">Signal</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Weight</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Trigger</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Penny Stock Price</td>
                    <td className="py-3 px-4"><span className="bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded text-sm">+2</span></td>
                    <td className="py-3 px-4">Stock price below $5</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Small Market Cap</td>
                    <td className="py-3 px-4"><span className="bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded text-sm">+2</span></td>
                    <td className="py-3 px-4">Market cap under $300 million</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Low Liquidity</td>
                    <td className="py-3 px-4"><span className="bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded text-sm">+2</span></td>
                    <td className="py-3 px-4">Average daily volume under $150,000</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">OTC Exchange</td>
                    <td className="py-3 px-4"><span className="bg-orange-600/30 text-orange-400 px-2 py-1 rounded text-sm">+3</span></td>
                    <td className="py-3 px-4">Trades on OTC markets (pink sheets, OTCQB, etc.)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Pattern Signals */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="text-green-500" size={20} />
              Pattern Signals
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
              Suspicious price and volume movements that may indicate manipulation
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="py-3 px-4 text-gray-400 font-medium">Signal</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Weight</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Trigger</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Price Spike (Moderate)</td>
                    <td className="py-3 px-4"><span className="bg-orange-600/30 text-orange-400 px-2 py-1 rounded text-sm">+3</span></td>
                    <td className="py-3 px-4">50-100% price increase in 7 days</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Price Spike (Extreme)</td>
                    <td className="py-3 px-4"><span className="bg-red-600/30 text-red-400 px-2 py-1 rounded text-sm">+4</span></td>
                    <td className="py-3 px-4">Over 100% price increase in 7 days</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Volume Explosion (Moderate)</td>
                    <td className="py-3 px-4"><span className="bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded text-sm">+2</span></td>
                    <td className="py-3 px-4">7-day volume 5-10x the 30-day average</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Volume Explosion (Extreme)</td>
                    <td className="py-3 px-4"><span className="bg-orange-600/30 text-orange-400 px-2 py-1 rounded text-sm">+3</span></td>
                    <td className="py-3 px-4">7-day volume over 10x the 30-day average</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Pump-Then-Drop</td>
                    <td className="py-3 px-4"><span className="bg-orange-600/30 text-orange-400 px-2 py-1 rounded text-sm">+3</span></td>
                    <td className="py-3 px-4">50%+ spike followed by 40%+ drop within 15 days</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Alert Signals */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={20} />
              Alert Signals
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
              Regulatory red flags indicating official action
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="py-3 px-4 text-gray-400 font-medium">Signal</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Weight</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Trigger</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">SEC Alert List</td>
                    <td className="py-3 px-4"><span className="bg-red-600/30 text-red-400 px-2 py-1 rounded text-sm">+5</span></td>
                    <td className="py-3 px-4">Stock on SEC trading suspension list</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Behavioral Signals */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Search className="text-purple-500" size={20} />
              Behavioral Signals
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
              Red flags detected in pitch text through NLP analysis
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="py-3 px-4 text-gray-400 font-medium">Signal</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Weight</th>
                    <th className="py-3 px-4 text-gray-400 font-medium">Detection Keywords/Patterns</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Unsolicited Contact</td>
                    <td className="py-3 px-4"><span className="bg-gray-600/30 text-gray-400 px-2 py-1 rounded text-sm">+1</span></td>
                    <td className="py-3 px-4">User indicates tip was unsolicited</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Promised Returns</td>
                    <td className="py-3 px-4"><span className="bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded text-sm">+2</span></td>
                    <td className="py-3 px-4">&quot;guaranteed&quot;, &quot;100%&quot;, &quot;can&apos;t lose&quot;, &quot;double your money&quot;</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Urgency Pressure</td>
                    <td className="py-3 px-4"><span className="bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded text-sm">+2</span></td>
                    <td className="py-3 px-4">&quot;act now&quot;, &quot;limited time&quot;, &quot;last chance&quot;, &quot;today only&quot;</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Secrecy Claims</td>
                    <td className="py-3 px-4"><span className="bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded text-sm">+2</span></td>
                    <td className="py-3 px-4">&quot;insider&quot;, &quot;confidential&quot;, &quot;exclusive&quot;, &quot;don&apos;t tell&quot;</td>
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 px-4 font-medium">Specific Return Claims</td>
                    <td className="py-3 px-4"><span className="bg-gray-600/30 text-gray-400 px-2 py-1 rounded text-sm">+1</span></td>
                    <td className="py-3 px-4">Pattern: &quot;X% in Y days&quot; (e.g., &quot;50% in 2 weeks&quot;)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Risk Level Classification */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <Shield className="text-orange-500" />
            Risk Level Classification
          </h2>

          <div className="space-y-4">
            <div className="bg-red-900/30 rounded-lg p-6 border border-red-700/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-red-400">HIGH RISK</h3>
                <span className="text-red-400 font-mono">Score ≥ 7 OR SEC Alert</span>
              </div>
              <p className="text-gray-300">
                Multiple significant red flags detected. Stock exhibits characteristics strongly associated
                with pump-and-dump schemes. Extreme caution warranted. Could also trigger automatically
                if the stock is on SEC suspension lists.
              </p>
            </div>

            <div className="bg-yellow-900/30 rounded-lg p-6 border border-yellow-700/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-yellow-400">MEDIUM RISK</h3>
                <span className="text-yellow-400 font-mono">Score 3-6</span>
              </div>
              <p className="text-gray-300">
                Some concerning signals detected. Stock has characteristics that warrant additional research.
                May indicate early-stage manipulation or structural vulnerability without active manipulation.
              </p>
            </div>

            <div className="bg-green-900/30 rounded-lg p-6 border border-green-700/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-green-400">LOW RISK</h3>
                <span className="text-green-400 font-mono">Score 0-2</span>
              </div>
              <p className="text-gray-300">
                Few or no manipulation indicators detected. Does not exhibit patterns commonly associated
                with scams. <strong>This does NOT mean the stock is a good investment</strong> - only that
                obvious manipulation signals were not found.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-gray-400">INSUFFICIENT DATA</h3>
                <span className="text-gray-400 font-mono">No market data</span>
              </div>
              <p className="text-gray-300">
                Unable to retrieve adequate market data for analysis. May occur with incorrect tickers,
                very new listings, or delisted securities. No risk assessment possible.
              </p>
            </div>
          </div>
        </section>

        {/* What About Legitimate Stocks? */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">What About &quot;LEGITIMATE&quot; Classification?</h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300 mb-4">
              In rare cases, stocks may receive a special &quot;LEGITIMATE&quot; classification when they meet
              ALL of these criteria:
            </p>
            <ul className="space-y-2 text-gray-300 mb-4">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Market capitalization over $10 billion</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Average daily trading volume over $10 million</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Listed on major exchanges (NYSE, NASDAQ)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Zero signals detected</span>
              </li>
            </ul>
            <p className="text-gray-400 text-sm">
              Even &quot;LEGITIMATE&quot; stocks can still be poor investments. This classification only indicates
              that the stock is unlikely to be a pump-and-dump target due to its size and liquidity.
            </p>
          </div>
        </section>

        {/* ML Enhancement */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Brain className="text-orange-500" />
            Machine Learning Enhancement
          </h2>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-4">
            <p className="text-gray-300">
              In addition to our deterministic scoring system, we optionally employ machine learning models
              for enhanced pattern detection:
            </p>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <Brain className="text-purple-500 mt-1 flex-shrink-0" size={18} />
                <div>
                  <strong>Random Forest Classifier:</strong> Trained on historical manipulation cases to
                  identify feature combinations that predict fraudulent activity.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Brain className="text-purple-500 mt-1 flex-shrink-0" size={18} />
                <div>
                  <strong>LSTM Neural Network:</strong> Analyzes time-series price and volume sequences
                  to detect manipulation patterns that unfold over time.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Brain className="text-purple-500 mt-1 flex-shrink-0" size={18} />
                <div>
                  <strong>Statistical Anomaly Detection:</strong> Identifies statistically unusual
                  price/volume behavior compared to the stock&apos;s historical baseline.
                </div>
              </li>
            </ul>
            <p className="text-gray-400 text-sm mt-4">
              ML results inform but do not override the deterministic scoring. Final risk levels are
              always based on the transparent, explainable signal system.
            </p>
          </div>
        </section>

        {/* Important Caveats */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <AlertTriangle className="text-yellow-500" />
            Important Caveats
          </h2>

          <div className="bg-yellow-900/20 rounded-xl p-6 border border-yellow-700/50 space-y-4">
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-yellow-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Historical patterns:</strong> Our signals are based on past manipulation schemes. New tactics may not be detected.</span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-yellow-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>False positives:</strong> Legitimate volatile stocks may trigger signals. High risk ≠ confirmed scam.</span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-yellow-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>False negatives:</strong> Sophisticated schemes may evade detection. Low risk ≠ safe investment.</span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-yellow-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Data limitations:</strong> We only analyze US-listed securities. Data may be delayed or incomplete.</span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="text-yellow-500 mt-1 flex-shrink-0" size={18} />
                <span><strong>Not financial advice:</strong> Our analysis is informational only. Always do your own research.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Links */}
        <section className="mb-12">
          <div className="grid md:grid-cols-2 gap-4">
            <Link href="/disclaimer" className="bg-red-900/20 rounded-lg p-6 border border-red-700/50 hover:border-red-500 transition group">
              <h3 className="font-semibold mb-2 group-hover:text-red-400 transition flex items-center gap-2">
                <FileText size={18} />
                Full Disclaimer →
              </h3>
              <p className="text-sm text-gray-400">Complete limitations and legal disclosures</p>
            </Link>
            <Link href="/about" className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-orange-500 transition group">
              <h3 className="font-semibold mb-2 group-hover:text-orange-400 transition flex items-center gap-2">
                <Shield size={18} />
                About ScamDunk →
              </h3>
              <p className="text-sm text-gray-400">Learn more about our mission and coverage</p>
            </Link>
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
