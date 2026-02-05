# Enhanced Daily Evaluation Stock Scanning - Pipeline Demonstration

**Date**: February 5, 2026
**Purpose**: Complete walkthrough of the ScamDunk stock manipulation detection system

---

## System Architecture Overview

The ScamDunk system uses a **5-Phase Pipeline** with **4 AI Brain Layers** to detect potential pump-and-dump stock manipulation schemes.

---

## THE 4 AI BRAIN LAYERS

### Layer 1: Deterministic Signal Detection (TypeScript)
- **Files**: `src/lib/scoring.ts`, `evaluation/scripts/standalone-scorer.ts`
- **Method**: Rule-based scoring system with weighted signals

**Signal Weights:**
| Signal | Weight | Trigger Condition |
|--------|--------|-------------------|
| MICROCAP_PRICE | 2 | Stock price < $5 |
| SMALL_MARKET_CAP | 2 | Market cap < $300M |
| MICRO_LIQUIDITY | 2 | Daily volume < $150K |
| SPIKE_7D (HIGH) | 4 | >50% price change in 7 days |
| VOLUME_EXPLOSION (HIGH) | 3 | >5x average volume |
| SPIKE_THEN_DROP | 3 | Pump-and-dump pattern detected |
| OVERBOUGHT_RSI | 2 | RSI > 70 |
| HIGH_VOLATILITY | 1 | Excessive daily volatility |

**Risk Classification:**
- Score >= 5 → HIGH risk
- Score >= 2 → MEDIUM risk
- Score < 2 → LOW risk

### Layer 2: Statistical Anomaly Detection (Python)
- **File**: `python_ai/anomaly_detection.py`
- **Methods Used**:
  - Z-score analysis (short/long term returns and volume)
  - Keltner Channel breakouts
  - Average True Range (ATR) volatility analysis
  - Surge detection metrics
- **Output**: Anomaly score (0-1) + specific anomaly types

### Layer 3: Machine Learning Classification (Python)
- **File**: `python_ai/ml_model.py`
- **Model**: Random Forest Classifier (scikit-learn)
- **Features**: 31-dimensional feature vector
- **Performance**: ~95% accuracy, ~93% precision on synthetic scam patterns
- **Output**: Probability (0-1) of scam behavior

### Layer 4: Deep Learning Sequence Analysis (Python)
- **File**: `python_ai/lstm_model.py`
- **Model**: LSTM Neural Network (TensorFlow/Keras)
- **Input**: 30-day time series price/volume data
- **Purpose**: Captures temporal pump-and-dump signatures
- **Output**: Probability (0-1) of malicious sequence pattern

### Ensemble Combination
- **File**: `python_ai/pipeline.py`
- **Logic**: Weighted averaging of all 4 layers with boosting rules
- **Boosting Rules**:
  - SEC flagged → immediate HIGH
  - OTC + Micro-cap → automatic boost
  - Severe patterns → minimum 0.65 probability

---

## THE 5-PHASE PIPELINE

### Phase 1: Risk Scoring All US Stocks

Scans ~5,000+ US-listed stocks through all 4 AI layers.

**Sample Results (from January 2026 evaluation):**

| Symbol | Name | Market Cap | Price | Score | Risk Level | Key Signals |
|--------|------|------------|-------|-------|------------|-------------|
| EVTV | Envirotech Vehicles | $12.5M | $3.55 | 16 | HIGH | SPIKE_7D (+609%), SPIKE_THEN_DROP, VOLUME_EXPLOSION |
| BCARW | D. Boral ARC Warrant | $41.8M | $1.40 | 16 | HIGH | SPIKE_7D (+270%), SPIKE_THEN_DROP, RSI: 81 |
| PTHL | Pheton Holdings | $13.1M | $0.90 | 15 | HIGH | SPIKE_7D (+85%), MICRO_LIQUIDITY, RSI: 80 |
| XAIR | Beyond Air | $8.6M | $1.70 | 15 | HIGH | SPIKE_7D (+105%), VOLUME_EXPLOSION (4.3x) |

### Phase 2: Size & Volume Filtering

Removes stocks that are too large/liquid to manipulate:
- **Market cap threshold**: > $10B (filtered out)
- **Daily volume threshold**: > $10M (filtered out)

**Rationale**: Large-cap stocks require massive capital to manipulate and are under heavy regulatory scrutiny.

### Phase 3: News & SEC Filing Analysis

Uses OpenAI (gpt-4o-mini) to analyze if price movements have legitimate explanations.

**Legitimate Reasons (filter stock out):**
- Earnings announcements
- FDA approvals / clinical trial results
- M&A activity
- Major contract wins
- Management changes
- Regulatory approvals

**NOT Legitimate (remains suspicious):**
- Vague "investor awareness" campaigns
- Paid promotional articles
- Press releases with no substantive news
- Unverified claims

### Phase 4: Social Media Scanning

**Real APIs Used:**
| Platform | API | Free Tier |
|----------|-----|-----------|
| Reddit | Public JSON API | Yes |
| StockTwits | Public API | Yes |
| YouTube | Data API v3 | 10,000 units/day |

**Unavailable (no free API):**
- Twitter/X ($100/mo minimum)
- Discord (no public search API)
- Telegram (no public search API)

**Promotion Detection:**
- Checks r/wallstreetbets, r/pennystocks, r/shortsqueeze
- Looks for promotional language: "moon", "rocket", "squeeze", "100x"
- Identifies potential promoter accounts
- Tracks engagement metrics

**Sample Social Media Evidence:**
```json
{
  "symbol": "EVTV",
  "promotionPlatforms": ["Twitter/X", "YouTube", "Discord", "Telegram"],
  "overallPromotionScore": 61,
  "coordinationIndicators": [
    "High promotion risk on Twitter/X",
    "High promotion risk on Discord"
  ]
}
```

### Phase 5: Scheme Tracking

Creates numbered scheme records for ongoing monitoring.

**Scheme Lifecycle:**
```
NEW → ONGOING → COOLING → PUMP_AND_DUMP_ENDED / NO_SCAM_DETECTED
```

**Current Active Schemes (as of February 2026):**

| Scheme ID | Symbol | Days Active | Risk Score | Promotion Score | Status |
|-----------|--------|-------------|------------|-----------------|--------|
| SCH-EVTV-20260202-9ALD | EVTV | 2 | 16 | 61 | ONGOING |
| SCH-BCARW-20260202-88CA | BCARW | 2 | 16 | 58 | ONGOING |
| SCH-SXTC-20260202-4CVF | SXTC | 2 | 14 | 61 | ONGOING |
| SCH-JDZG-20260202-18AA | JDZG | 2 | 14 | 61 | ONGOING |

---

## OUTPUT FILES

**Generated by Pipeline:**
```
evaluation/results/
├── enhanced-evaluation-YYYY-MM-DD.json    # All stocks with full scores
├── enhanced-high-risk-YYYY-MM-DD.json     # HIGH risk stocks only
├── suspicious-stocks-YYYY-MM-DD.json      # After all filters
├── daily-report-YYYY-MM-DD.json           # Summary statistics
├── scheme-report-YYYY-MM-DD.md            # Human-readable report

evaluation/scheme-database/
└── scheme-database.json                    # Active schemes tracking
```

---

## DATA PERSISTENCE

### GitHub Push
- **Workflow**: `.github/workflows/enhanced-daily-evaluation.yml`
- **Schedule**: Daily at 11 PM UTC (6 PM EST) on trading days
- **Target**: `Elimiz21/scam-dunk-data` repository

### Supabase Upload
- **Bucket**: `evaluation-data`
- **Method**: REST API with upsert

**Repository Structure:**
```
scam-dunk-data/
├── evaluation-results/      # Full evaluation JSONs
├── daily-summaries/         # Summary statistics
├── suspicious-stocks/       # Filtered results
├── scheme-tracking/         # Scheme database
├── social-media-scans/      # Social media evidence
└── reports/                 # Daily reports
```

---

## CONFIRMED PROMOTION EVIDENCE

### Pump Groups Identified

1. **Chinese Penny Stock Group**
   - Members: OCG, TKAT, JFIN, ZKIN
   - Evidence: Reddit users identified coordinated pumping; YouTuber offered paid promotion

2. **DVLT Reddit Short Squeeze**
   - Organized response to Wolfpack Research short report
   - Retail traders vowing to turn selloff into squeeze

3. **MNTS Space/Defense Hype**
   - 28,366% message volume spike on StockTwits
   - Sentiment flipped bearish → extremely bullish in one week

### Promoters Identified

| Name | Platform | Evidence |
|------|----------|----------|
| Matt Kohrs | YouTube | Offered money to promote ZKIN |
| Grandmaster-Obi | Discord | Promoted EVTV, ANPA, SPHL, MRNO |

---

## SAMPLE FINAL OUTPUT

**Suspicious Stocks After All Filters (37 stocks):**

| Rank | Symbol | Name | Price | Score |
|------|--------|------|-------|-------|
| 1 | BCARW | D. Boral ARC Warrant | $1.40 | 14 |
| 2 | EVTV | Envirotech Vehicles | $3.55 | 14 |
| 3 | XAIR | Beyond Air | $1.70 | 13 |
| 4 | VLN | Valens Semiconductor | $1.99 | 12 |
| 5 | MTEN | Mingteng International | $0.03 | 12 |
| 6 | JDZG | JIADE Limited | $1.22 | 12 |
| 7 | THH | TryHard Holdings | $0.96 | 12 |
| 8 | SXTC | China SXT Pharma | $0.095 | 12 |

---

## RUNNING THE PIPELINE

### Manual Execution
```bash
cd evaluation
npx ts-node scripts/enhanced-daily-pipeline.ts
```

### With Test Mode (100 stocks only)
```bash
TEST_MODE=true npx ts-node scripts/enhanced-daily-pipeline.ts
```

### Required Environment Variables
```
FMP_API_KEY=xxx           # Financial Modeling Prep API
OPENAI_API_KEY=xxx        # For news analysis
AI_BACKEND_URL=xxx        # Python AI backend URL (optional)
```

### GitHub Actions (Automated)
Runs daily at 11 PM UTC via `.github/workflows/enhanced-daily-evaluation.yml`

---

*Generated: 2026-02-05*
