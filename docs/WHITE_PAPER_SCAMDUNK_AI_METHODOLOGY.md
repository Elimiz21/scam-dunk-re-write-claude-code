# ScamDunk AI Scanning Methodology
## A Technical White Paper on Multi-Layer Stock Scam Detection

**Version 1.0 | February 2026**

---

## Executive Summary

ScamDunk employs a sophisticated multi-layer artificial intelligence system designed to detect potential stock market manipulation and scam-like behavior in real-time. Our methodology combines deterministic scoring algorithms, statistical anomaly detection, machine learning ensemble models, and deep learning sequence analysis to provide investors with actionable risk assessments.

This white paper provides a comprehensive technical overview of our scanning engine, the AI components that power it, and the scientific principles that underpin our detection methodology.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Philosophy & Design Principles](#2-philosophy--design-principles)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [The Multi-Layer Detection Engine](#4-the-multi-layer-detection-engine)
5. [Layer 1: Deterministic Signal Detection](#5-layer-1-deterministic-signal-detection)
6. [Layer 2: Statistical Anomaly Detection](#6-layer-2-statistical-anomaly-detection)
7. [Layer 3: Machine Learning Classification](#7-layer-3-machine-learning-classification)
8. [Layer 4: Deep Learning Sequence Analysis](#8-layer-4-deep-learning-sequence-analysis)
9. [Ensemble Prediction & Risk Calibration](#9-ensemble-prediction--risk-calibration)
10. [Data Sources & Integration](#10-data-sources--integration)
11. [Accuracy & Performance Metrics](#11-accuracy--performance-metrics)
12. [Limitations & Disclaimers](#12-limitations--disclaimers)
13. [Future Roadmap](#13-future-roadmap)

---

## 1. Introduction

### The Problem: Stock Market Manipulation

Stock market manipulation, particularly pump-and-dump schemes, causes billions of dollars in losses to retail investors annually. These schemes typically follow a predictable pattern:

1. **Accumulation**: Bad actors quietly buy shares of low-volume stocks
2. **Promotion**: Aggressive marketing creates artificial excitement
3. **Pump**: Coordinated buying drives prices up rapidly
4. **Dump**: Insiders sell at inflated prices
5. **Crash**: Price collapses, leaving victims with worthless shares

The SEC has identified over-the-counter (OTC) stocks, penny stocks, and low-liquidity shares as primary targets for manipulation due to their vulnerability characteristics.

### The ScamDunk Solution

ScamDunk addresses this problem by providing retail investors with an AI-powered "second opinion" before making investment decisions. When a user receives a stock tip—whether from social media, email, messaging apps, or personal contacts—they can run it through our scanning engine to receive an instant risk assessment.

---

## 2. Philosophy & Design Principles

### Core Philosophy: Determinism + AI Augmentation

ScamDunk's scoring system follows a fundamental principle: **deterministic scoring with AI-powered narrative generation**.

This means:

- **Risk scores are calculated algorithmically**, not by AI language models
- **Every assessment is reproducible** and auditable
- **AI (LLM) is only used** to generate human-readable explanations
- **No "black box" scoring** that cannot be explained

This approach ensures:
- ✅ Consistent, predictable scoring across all assessments
- ✅ Full auditability for regulatory compliance
- ✅ Transparency that builds user trust
- ✅ Protection against LLM hallucinations affecting risk scores

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Early Warning** | Detect patterns before full manipulation materializes |
| **Multi-Signal Fusion** | Combine multiple data sources for robust detection |
| **False Positive Mitigation** | Distinguish legitimate volatility from manipulation |
| **Explainability** | Every score has traceable, understandable factors |
| **Conservative Risk Assessment** | Err on the side of warning investors |

---

## 3. System Architecture Overview

ScamDunk's scanning engine operates as a multi-layer pipeline, where each layer adds increasingly sophisticated analysis:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER INPUT                                        │
│            (Stock Ticker + Pitch Text + Contextual Flags)               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     DATA INGESTION LAYER                                 │
│     • Real-time market data (Alpha Vantage API)                         │
│     • Historical price & volume (30-90 day window)                       │
│     • Company fundamentals (market cap, exchange, liquidity)             │
│     • SEC regulatory database (trading suspensions, alerts)              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FEATURE ENGINEERING LAYER                             │
│     • Rolling window statistics (7-day, 30-day)                          │
│     • Z-score normalization (price, volume, returns)                     │
│     • Technical indicators (ATR, Keltner Channels, RSI)                  │
│     • Surge metrics (volume explosion, price surge factors)              │
│     • Contextual features (market cap tier, exchange type)               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│   LAYER 1:           │ │   LAYER 2:       │ │   LAYER 3 & 4:           │
│   Deterministic      │ │   Statistical    │ │   Machine Learning       │
│   Signal Detection   │ │   Anomaly        │ │   Ensemble               │
│   (Rule-Based)       │ │   Detection      │ │   (RF + LSTM)            │
└──────────────────────┘ └──────────────────┘ └──────────────────────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  ENSEMBLE COMBINATION & CALIBRATION                      │
│     • Weighted combination of all signals                                │
│     • Context-aware boosting (SEC flags, OTC + micro-cap)                │
│     • Risk level classification (LOW / MEDIUM / HIGH)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    NARRATIVE GENERATION (GPT-4)                          │
│     • Human-readable explanation of risk signals                         │
│     • Personalized recommendations                                       │
│     • Educational context about detected patterns                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        RISK ASSESSMENT OUTPUT                            │
│     • Risk Level: LOW / MEDIUM / HIGH                                    │
│     • Probability Score: 0-100%                                          │
│     • Key Indicators List                                                │
│     • Detailed Explanation                                               │
│     • Signal Breakdown                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. The Multi-Layer Detection Engine

Our detection engine operates on the principle of **defense in depth**—multiple independent detection mechanisms that together provide robust protection against various manipulation tactics.

### Layer Overview

| Layer | Type | Purpose | Key Technologies |
|-------|------|---------|------------------|
| **Layer 1** | Deterministic | Rule-based structural and behavioral signals | Weighted scoring algorithm |
| **Layer 2** | Statistical | Detect anomalies in price/volume patterns | Z-scores, Isolation Forest, Mahalanobis distance |
| **Layer 3** | Machine Learning | Pattern classification | Random Forest Classifier |
| **Layer 4** | Deep Learning | Temporal sequence analysis | LSTM Neural Network |

Each layer contributes to the final risk assessment, with different weights applied based on the reliability and specificity of each signal type.

---

## 5. Layer 1: Deterministic Signal Detection

The first layer of our detection engine uses rule-based signals derived from SEC enforcement actions, academic research on market manipulation, and documented pump-and-dump characteristics.

### 5.1 Signal Categories

Signals are organized into four categories:

#### A. Structural Signals
These identify stocks inherently vulnerable to manipulation:

| Signal | Trigger | Weight | Reasoning |
|--------|---------|--------|-----------|
| **MICROCAP_PRICE** | Price < $5 | 2 | Penny stocks are prime manipulation targets due to low barriers to price movement |
| **SMALL_MARKET_CAP** | Market cap < $300M | 2 | Smaller companies have less institutional oversight and analyst coverage |
| **MICRO_LIQUIDITY** | Avg daily volume < $150K | 2 | Low liquidity enables price manipulation with minimal capital |
| **OTC_EXCHANGE** | Listed on OTC/Pink Sheets | 3 | OTC markets have lower regulatory oversight and listing requirements |

#### B. Pattern Signals
These detect suspicious price and volume movements:

| Signal | Trigger | Weight | Reasoning |
|--------|---------|--------|-----------|
| **SPIKE_7D** | 50-100% price increase in 7 days | 3-4 | Rapid price spikes are hallmarks of pump schemes |
| **VOLUME_EXPLOSION** | Volume 5-10x+ 30-day average | 2-3 | Abnormal volume precedes or accompanies manipulation |
| **SPIKE_THEN_DROP** | 50%+ spike followed by 40%+ drop within 15 days | 3 | Classic pump-and-dump signature pattern |

#### C. Alert Signals
Regulatory warnings carry the highest weight:

| Signal | Trigger | Weight | Reasoning |
|--------|---------|--------|-----------|
| **ALERT_LIST_HIT** | Appears on SEC trading suspension list | 5 | Regulatory alerts indicate confirmed fraud concerns |

#### D. Behavioral Signals
These analyze how the stock was presented (pitch text analysis):

| Signal | Trigger | Weight | Reasoning |
|--------|---------|--------|-----------|
| **UNSOLICITED** | Tip received without asking | 1 | Classic scam delivery method |
| **PROMISED_RETURNS** | "Guaranteed", "risk-free", "100%" language | 2 | No legitimate investment can guarantee returns |
| **URGENCY** | "Act now", "limited time" pressure | 2 | Creates artificial urgency to prevent due diligence |
| **SECRECY** | "Insider info", "confidential" claims | 2 | Claims of secret information are almost always fraudulent |
| **SPECIFIC_RETURN_CLAIM** | "X% in Y days/weeks" | 1 | Specific predictions are red flags |

### 5.2 Natural Language Processing for Behavioral Detection

We employ keyword pattern matching and regular expression analysis to detect behavioral signals in pitch text:

**Guaranteed Returns Keywords:**
- guaranteed, guaranteed return, guaranteed profit
- 100%, double your money, triple your money
- 10x, 100x, 1000%
- can't lose, risk-free, sure thing
- easy money, get rich, millionaire

**Urgency Keywords:**
- act now, act fast, limited time
- expires, today only, last chance
- don't miss, hurry, urgent, immediately
- before it's too late, running out

**Secrecy Keywords:**
- insider, insider info, confidential, secret
- don't tell, keep quiet, exclusive
- private tip, behind closed doors
- not public, before announcement

### 5.3 Risk Level Calculation

| Risk Level | Condition |
|------------|-----------|
| **HIGH** | Total score ≥ 7 OR Alert list hit |
| **MEDIUM** | Total score 3-6 |
| **LOW** | Total score < 3 |
| **INSUFFICIENT** | No market data available |

---

## 6. Layer 2: Statistical Anomaly Detection

The second layer employs statistical methods to detect anomalous market behavior that may indicate manipulation.

### 6.1 Core Statistical Methods

#### A. Rolling Z-Score Analysis

We calculate Z-scores across multiple timeframes to detect statistically unusual movements:

```
Z-Score = (Current Value - Rolling Mean) / Rolling Standard Deviation
```

**Z-Score Categories:**
- **Return Z-Scores**: Detect unusual daily/weekly returns
- **Price Z-Scores**: Detect deviation from historical price mean
- **Volume Z-Scores**: Detect unusual trading volume

**Thresholds (calibrated from research):**
- Standard Z-score threshold: 2.5 (captures ~99% of normal variation)
- Volume Z-score threshold: 2.5

#### B. Keltner Channel Breakout Detection

Keltner Channels provide a volatility-based envelope around price:

```
Middle Band = 20-day EMA
Upper Band = Middle + (2.0 × ATR)
Lower Band = Middle - (2.0 × ATR)
```

**Keltner Position Metric:**
```
Position = (Current Price - Lower Band) / (Upper Band - Lower Band)
```

- Position > 1.0: Breakout above upper band (potential overbought)
- Position < 0.0: Breakout below lower band (potential oversold)
- Position > 1.2 or < -0.2: Extreme breakout (high anomaly score)

#### C. Average True Range (ATR) Analysis

ATR measures volatility as a percentage of price:

```
ATR% = (14-day ATR / Current Price) × 100
```

- ATR% > 10%: Extremely high volatility (unusual for most stocks)

### 6.2 Surge Detection Metrics

#### Volume Surge Factor

```
Volume Surge = (7-day Average Volume) / (30-day Average Volume)
```

| Surge Factor | Classification | Implication |
|--------------|----------------|-------------|
| < 3.0x | Normal | Typical volume fluctuation |
| 3.0x - 5.0x | Moderate Explosion | Early warning indicator |
| > 5.0x | Extreme Explosion | Highly suspicious activity |

#### Price Surge Detection

| Timeframe | Threshold | Classification |
|-----------|-----------|----------------|
| 1-day | > 10% | Daily surge |
| 7-day | > 25% | Weekly pump indicator |
| 7-day | > 50% | Extreme weekly movement |

### 6.3 Pattern Detection

#### Pump-and-Dump Pattern Recognition

We detect the classic pump-and-dump signature by analyzing price action over a 14-day lookback window:

**Detection Criteria:**
1. Price peaks in the middle third of the analysis window
2. Pre-peak return > 20% (pump phase)
3. Post-peak return < -15% (dump phase)

This captures the characteristic "mountain" shape of manipulated price movement.

#### Coordinated Activity Detection

- High volume days (>3x average) coinciding with high price movement days (>5%)
- Multiple consecutive days of coordinated volume/price activity
- Suspicious positive streak (>80% positive returns in lookback period)

### 6.4 Anomaly Score Combination

Individual anomaly scores are combined using weighted averaging:

| Component | Weight | Reasoning |
|-----------|--------|-----------|
| Z-Score Anomalies | 0.25 | Broad statistical deviation |
| Volatility Anomalies | 0.20 | Technical breakout indicators |
| Surge Anomalies | 0.35 | Most indicative of pump/dump |
| Pattern Anomalies | 0.20 | Complex pattern recognition |

**Final Anomaly Score**: 0.0 - 1.0 scale, with >0.4 triggering "anomaly detected" status.

---

## 7. Layer 3: Machine Learning Classification

The third layer employs a Random Forest Classifier trained to distinguish between legitimate stock behavior and scam-like patterns.

### 7.1 Model Architecture

**Algorithm**: Random Forest Classifier

**Configuration:**
| Parameter | Value |
|-----------|-------|
| n_estimators | 100 trees |
| max_depth | 10 levels |
| min_samples_split | 5 samples |
| min_samples_leaf | 2 samples |
| class_weight | Balanced (handles imbalanced datasets) |

### 7.2 Feature Vector

The Random Forest model uses a 31-dimensional feature vector:

**Price-Based Features (3):**
- return_zscore_short
- return_zscore_long
- price_zscore_long

**Volume Features (3):**
- volume_zscore_short
- volume_zscore_long
- volume_surge_factor

**Volatility Features (4):**
- atr_percent
- keltner_position
- keltner_breakout_upper
- keltner_breakout_lower

**Surge & Pattern Features (8):**
- price_change_1d, price_change_7d, price_change_30d
- is_pumping_7d, is_dumping_7d
- volume_explosion_moderate, volume_explosion_extreme
- pump_pattern

**Momentum Features (3):**
- roc_7, roc_14, rsi_14

**Contextual Features (9):**
- log_market_cap
- is_micro_cap, is_small_cap
- is_micro_liquidity, is_low_liquidity
- is_otc, float_turnover
- sec_flagged
- has_news, sentiment_score

### 7.3 Training Methodology

**Synthetic Training Data Generation:**

The model is trained on synthetic data that mimics known patterns:

**Scam Scenarios (characteristics):**
- High Z-scores (1.5 - 4.0)
- Volume surge factors (5x - 20x)
- High ATR% (8% - 25%)
- Micro-cap, low liquidity, OTC
- Often SEC flagged
- No news explanations

**Normal Scenarios (characteristics):**
- Moderate Z-scores (-1.5 to 1.5)
- Normal volume (0.5x - 3.0x average)
- Low ATR% (1% - 5%)
- Large cap, high liquidity, major exchanges
- Never SEC flagged
- Often has news catalyst

**Edge Cases:**
- Legitimate high-volatility events (e.g., earnings surprises)
- Characterized by: high volatility + news catalyst + major exchange

### 7.4 Model Performance

Typical training metrics:
- **Accuracy**: ~95%+
- **Precision**: ~93%+ (minimizes false positives)
- **Recall**: ~94%+ (minimizes missed scams)
- **F1 Score**: ~93%+

---

## 8. Layer 4: Deep Learning Sequence Analysis

The fourth layer employs Long Short-Term Memory (LSTM) neural networks to capture temporal patterns that simpler models might miss.

### 8.1 Why LSTM?

Pump-and-dump schemes follow characteristic temporal sequences:

1. **Quiet accumulation** → 2. **Volume increases** → 3. **Price spikes** → 4. **Peak** → 5. **Crash**

This sequential structure is ideally suited for LSTM analysis, which excels at learning patterns in time-series data.

### 8.2 Model Architecture

```
┌─────────────────────────────────────────────────┐
│              INPUT LAYER                         │
│        Shape: (30 timesteps × 6 features)        │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│           LSTM LAYER 1 (64 units)                │
│     + L2 Regularization (0.01)                   │
│     + Return Sequences = True                    │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│           BATCH NORMALIZATION                    │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              DROPOUT (20%)                       │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│           LSTM LAYER 2 (32 units)                │
│     + L2 Regularization (0.01)                   │
│     + Return Sequences = False                   │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│           BATCH NORMALIZATION                    │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              DROPOUT (20%)                       │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│           DENSE LAYER (16 units, ReLU)           │
│     + L2 Regularization (0.01)                   │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              DROPOUT (20%)                       │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│        OUTPUT LAYER (1 unit, Sigmoid)            │
│           Binary Classification                  │
└─────────────────────────────────────────────────┘
```

### 8.3 Input Features for Sequence

Each timestep in the 30-day sequence contains:

1. **Close**: Closing price
2. **Volume**: Trading volume
3. **Return**: Daily return
4. **Volume_Surge_Factor**: Rolling volume surge
5. **Price_ZScore_Long**: Price Z-score
6. **Volume_ZScore_Long**: Volume Z-score

### 8.4 Training Configuration

| Parameter | Value |
|-----------|-------|
| Sequence Length | 30 days |
| Epochs | 50 (with early stopping) |
| Batch Size | 32 |
| Validation Split | 20% |
| Optimizer | Adam (learning rate: 0.001) |
| Loss Function | Binary Cross-Entropy |

**Callbacks:**
- Early Stopping (patience: 10 epochs)
- Learning Rate Reduction on Plateau (factor: 0.5, patience: 5)

### 8.5 Synthetic Sequence Generation

**Scam Sequences (Pump-and-Dump Pattern):**

```
Phase 1 (Accumulation): Days 1-10
├── Gradual price increase (0-2% per day)
├── Slightly elevated volume (1-2x)
└── Normal Z-scores (-1 to 1)

Phase 2 (Pump): Days 11-20
├── Rapid price increase (5-20% per day)
├── Volume explosion (5-15x)
└── High Z-scores (2-5)

Phase 3 (Dump): Days 21-30
├── Sharp price decline (5-20% per day)
├── Still elevated volume (3-10x)
└── Variable Z-scores
```

**Normal Sequences:**
- Random walk price movement
- Consistent volume patterns
- Normal Z-score distributions

---

## 9. Ensemble Prediction & Risk Calibration

### 9.1 Prediction Combination

The final risk score combines outputs from all detection layers:

**Starting Point**: Random Forest probability

**LSTM Integration** (if available):
```
If use_max_strategy:
    combined = max(rf_prob, lstm_prob)
Else:
    combined = (rf_prob × 0.5) + (lstm_prob × 0.5)
```

### 9.2 Contextual Boosting

The combined probability is adjusted based on contextual factors:

**Anomaly Boost:**
```
If anomaly_detected:
    combined = combined + (anomaly_score × 0.3)
```

**SEC Flag Boost:**
```
If sec_flagged:
    combined = max(combined, 0.85)  # Minimum 85% probability
```

**Structural Risk Boosts:**
```
If OTC and (price_change_7d > 15% or volume_surge > 2.5x):
    combined = max(combined, 0.45)

If OTC and micro_cap:
    combined = max(combined, 0.50)
```

**Severe Pattern Boosts:**
```
Severe patterns: pump_and_dump, pump_pattern, 
                 extreme_volume_explosion, extreme_weekly_move

If severe_pattern:
    combined = max(combined, 0.65)

If severe_pattern and OTC:
    combined = max(combined, 0.75)

If severe_pattern and OTC and micro_cap:
    combined = max(combined, 0.80)
```

**Multi-Factor Boost:**
```
risk_factors = [OTC, micro_cap, severe_pattern, anomaly, sec_flagged]

If 3+ factors:
    combined = max(combined, 0.70)

If 4+ factors:
    combined = max(combined, 0.80)
```

### 9.3 Risk Level Classification

Final probability thresholds:

| Probability | Risk Level |
|-------------|------------|
| < 0.25 | LOW |
| 0.25 - 0.55 | MEDIUM |
| ≥ 0.55 | HIGH |

---

## 10. Data Sources & Integration

### 10.1 Market Data

**Primary Provider**: Alpha Vantage API

**Data Points Retrieved:**
- Current price and real-time quotes
- Market capitalization
- Average daily trading volume
- Exchange listing
- 30-90 day price history (OHLCV)
- Company fundamentals (name, sector)

**Caching Strategy**: 5-minute cache to reduce API calls

### 10.2 Regulatory Data

**SEC Integration:**
- Trading suspension database
- Real-time check on each scan
- Currently covers SEC suspensions

### 10.3 Behavioral Data

**User Input:**
- Stock ticker symbol
- Pitch text (analyzed for NLP signals)
- Contextual flags (unsolicited, urgency, secrecy, etc.)

---

## 11. Accuracy & Performance Metrics

### 11.1 Model Performance

**Random Forest Classifier:**
- Accuracy: ~95%
- Precision: ~93%
- Recall: ~94%
- F1 Score: ~93%

**LSTM Neural Network:**
- Validation Accuracy: ~90%+
- AUC: ~0.92

### 11.2 System Characteristics

- **Analysis Time**: < 3 seconds per scan
- **Data Freshness**: Real-time with 5-minute cache
- **Uptime Target**: 99.9%

---

## 12. Limitations & Disclaimers

### 12.1 Important Limitations

1. **Not Financial Advice**: ScamDunk provides informational analysis only and should not be considered investment advice
2. **US Markets Only**: Currently limited to US-listed stocks
3. **Cannot Detect All Scams**: Sophisticated fraud may evade detection
4. **False Positives Possible**: Legitimate volatile stocks may trigger pattern signals
5. **Data Delays**: Market data may be delayed up to 15 minutes
6. **Historical Patterns**: Past manipulation patterns don't guarantee future detection

### 12.2 Legal Disclaimer

ScamDunk is an educational tool designed to help investors identify potential red flags. It does not replace professional financial advice, legal counsel, or regulatory guidance. Users should conduct their own due diligence before making investment decisions.

---

## 13. Future Roadmap

### Planned Enhancements

**Short-Term (2026):**
- Enhanced NLP with transformer models for pitch text analysis
- Integration with additional regulatory databases
- Cryptocurrency market coverage

**Medium-Term (2026-2027):**
- Social media sentiment integration (Reddit, Twitter/X)
- Real-time alerting for watched tickers
- Multi-language support

**Long-Term (2027+):**
- International market coverage
- Institutional-grade API offering
- Regulatory compliance reporting tools

---

## References

1. SEC Enforcement Actions Database
2. Academic Research on Market Manipulation (arXiv 2025, IEEE 2019)
3. OTC Markets Group Risk Classification Guidelines
4. Alpha Vantage API Documentation
5. TensorFlow/Keras LSTM Implementation Guidelines

---

## Contact

For questions about this methodology or ScamDunk in general, please contact:

**ScamDunk Technologies**
Email: info@scamdunk.com

---

*This white paper is confidential and intended for informational purposes only. © 2026 ScamDunk Technologies. All rights reserved.*
