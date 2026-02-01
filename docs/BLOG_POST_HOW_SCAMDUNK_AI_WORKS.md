# How ScamDunk's AI Actually Works: A Look Under the Hood

*Your stock tip might be a scam. Here's how our AI figures that out in seconds.*

---

## The Problem We're Solving

Every day, thousands of retail investors receive unsolicited stock tips through emails, texts, social media DMs, and messaging apps. Some of these tips come from well-meaning friends. Others come from sophisticated scammers running pump-and-dump schemes designed to transfer your money into their pockets.

The challenge? It's nearly impossible for the average person to tell the difference.

**Enter ScamDunk.**

We built an AI-powered scanning engine that analyzes any stock tip in seconds and surfaces potential red flags before you invest. In this post, we're pulling back the curtain to show you exactly how our technology works.

---

## The Core Philosophy: No "Black Box" Scoring

Before we dive into the technical details, here's something important to understand about ScamDunk:

**Our risk scores are calculated algorithmically—not by AI language models.**

What does this mean for you?

- **Every score is reproducible.** The same inputs will always produce the same outputs.
- **Every score is explainable.** We can tell you exactly why a stock received its risk rating.
- **No AI hallucinations.** We don't let a chatbot guess whether something is dangerous.

We only use GPT-4 for one thing: writing the human-readable explanation of what our algorithms detected. The actual risk assessment? That's pure math and data science.

---

## The Four-Layer Detection Engine

Think of ScamDunk as having four specialized "detectives" that each analyze your stock from a different angle. When all four detectives compare notes, you get a comprehensive risk assessment.

### 🔍 Layer 1: The Rule Checker

**What it does:** Looks for known red flags that match SEC enforcement patterns.

Our first layer uses hard-coded rules based on decades of SEC enforcement actions and academic research on market manipulation. Here's what it checks:

#### Structural Red Flags
- **Penny stock status**: Is the stock trading below $5? ⚠️
- **Micro-cap vulnerability**: Is the market cap below $300 million? ⚠️
- **Low liquidity**: Is daily trading volume below $150,000? ⚠️
- **OTC/Pink Sheets listing**: More manipulation happens here than on major exchanges ⚠️

#### Price Pattern Red Flags
- **Abnormal spikes**: Did the price jump 50%+ in just 7 days? 🚨
- **Volume explosions**: Is trading volume 5x or 10x the normal average? 🚨
- **Pump-and-dump signature**: Price spiked 50%+, then crashed 40%+ within 15 days? 🚨

#### Behavioral Red Flags (from the pitch text)
When you paste in the message you received, our NLP engine scans for classic scammer language:

- "**Guaranteed returns**" or "**can't lose**" — No legitimate investment guarantees returns
- "**Act now**" or "**limited time**" — Creating fake urgency to prevent you from researching
- "**Insider info**" or "**confidential tip**" — If it were real insider info, sharing it would be illegal
- Specific predictions like "**10x in 2 weeks**" — Nobody can reliably predict this

### 📊 Layer 2: The Statistician

**What it does:** Detects mathematically unusual behavior using statistical analysis.

Our second layer is all about finding anomalies—things that are statistically unusual enough to warrant concern.

#### Z-Score Analysis
We calculate how many "standard deviations" the current price and volume are from their typical values:

- A Z-score of 2.5+ means the current behavior is more unusual than 99% of normal days
- We check both short-term (7-day) and long-term (30-day) windows

#### Keltner Channel Breakouts
This technical indicator creates a "normal range" envelope around the price. When a stock breaks above or below this envelope, it's often a sign of unusual activity.

#### Surge Detection
We measure how dramatically volume and price have shifted:

- **Volume Surge**: Is current week's volume 5x+ the previous month's average?
- **Price Surge**: Did the stock move 25%+ in a week?

#### Pattern Recognition
Our statistician also looks for the classic "pump-and-dump shape"—a rapid rise followed by a crash:

```
Price
  ^
  |        /\
  |       /  \
  |      /    \
  |     /      \____
  |____/
  +-------------------> Time
       ^      ^
     Pump   Dump
```

### 🤖 Layer 3: The Machine Learning Classifier

**What it does:** Uses a Random Forest model trained to distinguish scams from legitimate stocks.

Our third layer employs a Random Forest classifier—a type of machine learning algorithm that combines 100 decision trees to vote on whether a stock looks suspicious.

The model considers 31 different features, including:
- Price and volume Z-scores
- Volatility metrics
- Market cap and liquidity tiers
- Exchange type
- Surge patterns
- Technical indicators like RSI

**How we train it:**

We create thousands of synthetic examples that mimic known patterns:
- **Scam examples**: High volatility, OTC listing, micro-cap, no news catalyst, pump patterns
- **Normal examples**: Stable trading, major exchange, appropriate news coverage
- **Edge cases**: Legitimate high-volatility events like earnings surprises

The model learns to distinguish between these patterns and applies that knowledge to new stocks.

### 🧠 Layer 4: The Deep Learning Analyst

**What it does:** Uses an LSTM neural network to detect temporal patterns in 30-day sequences.

Our most sophisticated layer uses Long Short-Term Memory (LSTM) neural networks—the same type of AI used in speech recognition and natural language processing.

Why LSTM? Because pump-and-dump schemes have a characteristic *sequence*:

1. Quiet accumulation (days 1-10)
2. Pump phase with surging price and volume (days 11-20)
3. Crash as insiders sell off (days 21-30)

The LSTM learns to recognize this "signature" pattern by analyzing the last 30 days of trading data. It can catch patterns that might not be obvious from any single day's numbers.

---

## Putting It All Together: The Ensemble

When all four layers complete their analysis, we combine their outputs:

**Step 1: Combine ML predictions**
- Random Forest gives a probability
- LSTM gives a probability (if available)
- We take the higher of the two or average them

**Step 2: Apply contextual boosts**

This is where things get smart. We've built business logic that reflects real-world risk:

| Condition | Automatic Boost |
|-----------|-----------------|
| SEC regulatory flag | Minimum 85% risk score |
| OTC + significant price movement | Minimum 45% risk score |
| OTC + micro-cap | Minimum 50% risk score |
| Severe pattern detected | Minimum 65% risk score |
| OTC + severe pattern | Minimum 75% risk score |
| 4+ risk factors combined | Minimum 80% risk score |

**Step 3: Classify the risk level**

| Probability | Risk Level |
|-------------|------------|
| Below 25% | ✅ LOW |
| 25% - 55% | ⚠️ MEDIUM |
| Above 55% | 🚨 HIGH |

---

## Example: Anatomy of a Scam Detection

Let's walk through a real example of how ScamDunk might analyze a suspicious tip:

**Input:**
- Ticker: `ABCD` (fictional OTC stock)
- Pitch: "This stock is about to 10x. Insiders know about a merger announcement. Act now before it's too late. Don't tell anyone about this tip."

**Layer 1 Detection:**
- ⚠️ OTC Exchange: +3 points
- ⚠️ Price < $5: +2 points
- ⚠️ Market cap < $300M: +2 points
- 🚨 SECRECY language detected: +2 points
- 🚨 URGENCY language detected: +2 points
- 🚨 SPECIFIC_RETURN_CLAIM ("10x"): +1 point

**Layer 2 Detection:**
- 📊 Volume Z-score: 4.2 (highly unusual)
- 📊 7-day price change: +87% (extreme)
- 📊 Pump pattern detected ✓

**Layer 3 (Random Forest):** 92% scam probability

**Layer 4 (LSTM):** 88% scam probability

**Final Ensemble:**
- Base probability: 92%
- Contextual boost (OTC + pattern): Already above threshold
- **Final Risk: 92% — HIGH RISK 🚨**

**Generated Explanation:**
> "CRITICAL: This stock shows multiple severe red flags. It's listed on OTC markets with a micro-cap valuation, making it highly vulnerable to manipulation. The pitch text contains classic scam language including insider information claims, urgency pressure, and specific return predictions. Price has surged 87% in 7 days with volume 8x above normal—a classic pump pattern. We strongly recommend extreme caution."

---

## Why This Approach Works

### Multi-Angle Detection
Scammers can evolve their tactics, but they can't change the fundamental nature of pump-and-dump schemes. By analyzing structural factors, statistical patterns, ML classification, and temporal sequences, we catch manipulation from multiple angles.

### Conservative by Design
We'd rather warn you about a legitimate opportunity than let a scam slip through. Our threshold system is calibrated to err on the side of caution.

### Evolving Intelligence
As new manipulation tactics emerge, we retrain our models and update our detection rules. The system learns and improves over time.

---

## What ScamDunk Can't Do

We believe in transparency, so here's what we're upfront about:

❌ **Not financial advice** — We surface red flags, but invest decisions are yours
❌ **Can't catch everything** — Sophisticated fraud may evade detection
❌ **US markets only** — We currently support US-listed stocks only
❌ **Data delays possible** — Market data may be delayed up to 15 minutes
❌ **False positives happen** — Legitimate volatile stocks may trigger warnings

---

## The Bottom Line

ScamDunk combines rule-based logic, statistical analysis, machine learning, and deep learning into a unified detection engine that analyzes stock tips in seconds.

When your uncle, Discord server, or random email tells you about the next 10x opportunity, take 30 seconds to run it through ScamDunk first.

**Because the best scam defense is knowing what you're looking at before you invest.**

---

*Ready to check a stock tip? [Try ScamDunk free →](https://scamdunk.com)*

---

### Technical FAQ

**Q: How fast is the analysis?**
A: Under 3 seconds for most scans.

**Q: Do you store my data?**
A: We store minimal usage data for account features. We don't store or share your stock research with third parties.

**Q: What's your accuracy rate?**
A: Our Random Forest model achieves ~95% accuracy in testing. However, real-world accuracy depends on the specific tactic being used.

**Q: Can I use ScamDunk for crypto?**
A: Cryptocurrency support is on our roadmap.

---

*Written by the ScamDunk Engineering Team | February 2026*
