# Pump Discovery Overhaul Plan

## Problem Statement

The current system catches pump-and-dump schemes too late — either at the end of the pump phase or during the dump phase. Every detection signal requires the price to have already moved significantly before it fires.

### Evidence: All Current Signals Are Lagging Indicators

| Signal                  | When It Fires                     | P&D Phase                 |
| ----------------------- | --------------------------------- | ------------------------- |
| `SPIKE_7D` (25%+)       | After 25%+ price move over 7 days | **Mid-to-late pump**      |
| `SPIKE_7D` (50%+)       | After 50%+ price move             | **Late pump**             |
| `VOLUME_EXPLOSION` (3x) | After volume already 3x average   | **Mid pump**              |
| `SPIKE_THEN_DROP`       | After 25% rise AND 20% fall       | **Dump phase (too late)** |
| `REVERSAL_PATTERN`      | After 14-day rise-then-decline    | **Dump phase**            |
| `PUMP_PATTERN`          | 7d price up 25% + volume 3x       | **Mid-to-late pump**      |
| `OVERBOUGHT_RSI`        | RSI > 70                          | **Mid-to-late pump**      |
| `PRICE_ANOMALY` (Z≥2)   | After 2+ standard deviation move  | **Mid pump at earliest**  |

Every single pattern signal requires the price to have already moved significantly. By the time a stock is up 25% in 7 days with 3x volume, the pump is often 50-80% complete. The organizers already accumulated their shares weeks ago and are distributing into the buying frenzy the system is just now detecting.

The daily scan runs once at 11 PM UTC — a single snapshot per day. An intraday pump-and-dump is completely invisible.

The scheme lifecycle tracker confirms this: stocks enter as `NEW` when they already have HIGH risk scores, meaning the pump is already obvious. The `COOLING` and `PUMP_AND_DUMP_ENDED` statuses are retrospective confirmations, not actionable warnings.

---

## Current Architecture (for context)

```
User Request (ticker + context)
        |
        v
[/api/check/route.ts]  ← entry point
        |
        +-- SEC regulatory check (checkAlertList)
        |
        +-- [PRIMARY] Python AI backend (Railway) → /analyze
        |       - Statistical anomaly detection
        |       - Random Forest (RF) ML model
        |       - LSTM deep learning model
        |       - Signal-weight scoring
        |       - News verification (for HIGH results)
        |
        +-- [FALLBACK or GUARD] TypeScript scoring (src/lib/scoring.ts)
        |       - Same signal categories, different depth
        |
        v
 No-Downgrade Guard: take whichever is HIGHER (AI vs baseline)
        |
        v
 generateNarrative() → LLM generates text only, never changes score
        |
        v
 Response: { riskLevel, totalScore, signals, narrative }
```

### Daily Pipeline Flow

```
GitHub Actions (11 PM UTC weekdays)
  → Phase 1: Risk Scoring (all ~7k stocks via FMP)
  → Phase 2: Size Filtering (drop >$10B market cap, >$10M/day volume)
  → Phase 3: News & SEC Analysis (GPT-4o-mini legitimacy filter)
  → Phase 4: Social Media Scanning (top 50 suspicious stocks)
  → Phase 5: Scheme Tracking (lifecycle state machine)
```

### What We Have That's Reusable

1. **Python AI backend on Railway** — deployed, FastAPI, ready for new endpoints
2. **Feature engineering module** (`python_ai/feature_engineering.py`) — 44 features, extensible
3. **Anomaly detection framework** (`python_ai/anomaly_detection.py`) — Z-score infra, combine-and-weight architecture
4. **Social media scanner infrastructure** — 6 scanners (Serper, Perplexity, Reddit, YouTube, StockTwits, Discord)
5. **SEC alert list checking** (`src/lib/marketData.ts` `checkAlertList`) — EDGAR RSS, FINRA, OTC Markets
6. **Scheme tracking database** — lifecycle state machine, promoter tracking, timeline events
7. **Signal-weight architecture** — easy to add new signals with weights
8. **No-downgrade guard** — Python can only elevate risk, safe to add aggressive early signals
9. **Supabase + Prisma data layer** — ready for new tables (watchlists, pre-pump candidates, real-time alerts)

---

## The Key Architectural Insight

**Social media and SEC filing monitoring should be upstream of the price/volume scan, not downstream.**

Current flow: Find unusual prices → check social
New flow: **Find unusual promotion → watch for price confirmation**

Build a daily "watchlist" from social + filing signals, then apply tighter price/volume thresholds to watchlist stocks.

---

## Option 1: Tune Existing Thresholds

**Time**: 1-2 days | **Cost**: Free | **Detection improvement**: 2-3 days earlier

### Changes to `python_ai/config.py`

| Parameter                  | Current | New                  | Rationale                                             |
| -------------------------- | ------- | -------------------- | ----------------------------------------------------- |
| `price_surge_7d_threshold` | 0.25    | 0.10                 | 10% in 7d is already unusual for micro/OTC            |
| `volume_surge_moderate`    | 3.0     | 2.0 (for OTC stocks) | OTC stocks have low baseline volume; 2x is meaningful |
| `pump_dump_rise`           | 0.20    | 0.12                 | Catch smaller initial moves                           |
| Z-score threshold          | 2.5     | 1.8 (for OTC/penny)  | OTC stocks have different distributions               |

### New Signals to Add

**3-day detection window** (alongside existing 7-day):

- `SPIKE_3D`: 10%+ move in 3 days → weight 2; 20%+ → weight 3
- `VOLUME_SURGE_3D`: 2x average in 3-day window → weight 2
- Many pumps are 3-5 day affairs; the 7-day window misses until day 5-6

**Velocity signals (second derivative)**:

- `PRICE_ACCELERATION`: Rate of price increase is accelerating (today's gain > yesterday's > day before)
- `VOLUME_ACCELERATION`: Volume increasing each day for 3+ consecutive days
- These detect pump momentum before absolute thresholds trigger
- Weight: 2 each

### Risk

More false positives on volatile penny stocks. Mitigated by existing news verification filter and the no-downgrade guard (conservative TypeScript baseline still acts as floor).

---

## Option 2: Pre-Pump Structural Signals

**Time**: 3-5 days | **Cost**: Free (all data sources are public) | **Detection improvement**: 1-4 weeks earlier

Targets the accumulation/setup phase BEFORE any price movement.

### SEC EDGAR Filing Pattern Monitor

- **Data source**: `data.sec.gov` EFTS API (free, no auth required)
- **What to monitor**: Form 8-K filings from OTC companies < $50M market cap
- **Red flags**:
  - Reverse mergers / change of control
  - Company name changes
  - Shell company reactivation (dormant entity suddenly filing again)
  - Going-concern audit opinions + sudden promotional activity
  - New OTC listings from previously dormant companies (Rule 15c2-11)
- **New signals**: `SHELL_REACTIVATION` (weight 3), `REVERSE_MERGER_OTC` (weight 2)
- **Implementation**: New Python module `pre_pump_signals.py` → daily poll EDGAR, results feed into signal-weight system

### Form 4 Insider Filing Analysis

- **Data source**: SEC EDGAR (free) or OpenInsider
- **Pattern**: In P&D targets, insiders DON'T buy (they already hold cheap pre-merger shares). Monitor for:
  - Zero insider buying despite promotional activity
  - Form 144 filings (intent to sell restricted shares) clustered before/during promotion
- **New signal**: `INSIDER_SELLING_SETUP` (weight 2)

### OTC Markets Compliance Tier Monitoring

- **Data source**: `otcmarkets.com` (limited free tier)
- **Pattern**: Stocks moving from "Expert Market" or "No Information" tier back to "Current Information" — shell company reactivation for pump purposes
- **New signal**: `COMPLIANCE_TIER_CHANGE` (weight 2)

### FINRA Short Interest + FTD Correlation

- **Data sources**: FINRA OTC Transparency API (free), SEC FTD data (free, published bi-monthly)
- **Patterns**:
  - Sudden spike in short interest on a previously dormant OTC stock = informed traders positioning before dump
  - High FTDs on a rising stock = potential naked short selling manipulation
- **New signals**: `SHORT_INTEREST_SPIKE` (weight 2), `HIGH_FTD_RATE` (weight 1)

---

## Option 3: Social Media Early Warning System

**Time**: 1-2 weeks | **Cost**: Free (ApeWisdom, Reddit, StockTwits APIs) | **Detection improvement**: 1-7 days earlier

**The single highest-ROI improvement.** Current social scan runs AFTER Phase 2 filtering — it only examines stocks already flagged as HIGH risk by price/volume. This must be inverted.

### Proactive Ticker Mention Monitoring

- **ApeWisdom API** (free): Track Reddit mention velocity across r/pennystocks, r/wallstreetbets, r/stocks
- **StockTwits API** (already have this scanner): Track message volume per ticker
- **Trigger**: Any OTC/penny stock where mentions spike >300% in 24-48 hours from baseline
- **This detects the promotional campaign BEFORE it drives meaningful price movement**

### Telegram/Discord Pump Group Infiltration

- **Research background**: 43+ active pump-and-dump Telegram channels identified by academic researchers
- **Tool**: Telethon (Python) to monitor these channels in real-time
- **Classifier**: BERTweet fine-tuned on 21,092 labeled pump messages achieves **0.982 F1** for detecting pump announcements, countdowns, and target releases
- **Impact**: Gives you the ticker symbol **minutes to hours** before the pump executes
- **Training data available**: 91,295+ labeled Telegram messages from published research

### Bot Network Detection

- 84% of users participating >10K times in pump activities are bots
- Track cashtag mentions on X/Twitter; flag when >50% of mentions come from accounts <90 days old
- Check for temporal clustering (many accounts posting within minutes of each other)
- Content similarity analysis (identical or near-identical text across accounts)

### Promotional Email Honeypots

- SEC estimates 100 million stock-spam messages sent daily
- Set up sacrificial email addresses on known penny stock sites
- Parse incoming promotional emails, extract ticker symbols
- Any ticker in >3 independent promotional emails within 7 days = strong pre-pump signal

### New Architecture: Social → Watchlist → Price Confirmation

```
Every 4-6 hours:
  ApeWisdom + StockTwits + Telegram monitors
    → Compute mention velocity per ticker
    → Flag tickers with >300% mention spike from baseline
    → Add to "watchlist" table in Supabase

Daily pipeline (11 PM UTC):
  Phase 0 (NEW): Load watchlist tickers
  Phase 1: Score all stocks, but apply TIGHTER thresholds for watchlist tickers
    - Watchlist stocks: SPIKE_3D at 5%, VOLUME at 1.5x = elevated risk
    - Non-watchlist stocks: existing thresholds
  Phase 2-5: Continue as normal
```

**New signal**: `SOCIAL_PROMOTION_DETECTED` (weight 3), `COORDINATED_BOT_ACTIVITY` (weight 4)

---

## Option 4: Intraday Real-Time Monitoring

**Time**: 2-4 weeks | **Cost**: $199/mo (Polygon.io real-time) | **Detection improvement**: Minutes

### Architecture

```
Polygon.io WebSocket (real-time NBBO + trades)
    → Python stream processor (new Railway service)
    → Compute rolling Z-scores every 5 minutes for watchlist tickers
    → EWMA thresholding (20-day window)
    → Alert via webhook → Next.js app → Supabase → user notifications
```

### What to Monitor in Real-Time

- Volume surge factor computed every 5 minutes against 30-day baseline
- Price momentum acceleration (second derivative)
- Bid-ask spread compression (informed traders create artificial liquidity before the pump)
- EWMA threshold crossings: flag when price > 70% above 20-day EWMA

### Tiered Alerting

- `WATCH`: Single signal fires (e.g., volume spike alone)
- `WARNING`: Two correlated signals (volume + price acceleration)
- `CRITICAL`: Three+ signals OR market anomaly + social anomaly on same ticker

### Data Sources

| Source                     | What It Provides                        | Cost                                        |
| -------------------------- | --------------------------------------- | ------------------------------------------- |
| Polygon.io                 | NBBO, trades, tick data                 | Free tier (15-min delay), $199/mo real-time |
| Databento                  | L2/L3 order book, nanosecond timestamps | $125 credit then usage-based                |
| Unusual Whales API         | Options flow, dark pool, sweeps         | $50-200/mo                                  |
| FINRA OTC Transparency API | Dark pool volume, ATS data              | Free                                        |

---

## Option 5: ML Model Overhaul

**Time**: 2-4 weeks | **Cost**: Free (uses own data) | **Detection improvement**: Better accuracy overall

### Current Problem

ML models are trained on **synthetic data only** (`python_ai/ml_model.py` generates 1,200 synthetic samples). The Random Forest and LSTM are essentially hard-coded heuristics wrapped in an ML framework. The pipeline acknowledges this: anomaly score dominates with 70% weight because models are trained on synthetic distributions.

### Replace Synthetic Training with Real Data

- The scheme database already tracks confirmed P&D schemes with timeline events
- Extract the 100-day price/volume history for every confirmed scheme
- Label the data: pre-pump (days -30 to -5), early pump (days -5 to -1), pump (days 0 to peak), dump (peak to -50%)
- Train new models on this real data

### Better Architectures

**Transformer Autoencoder (unsupervised)**:

- Learns "normal" market behavior from thousands of non-manipulated stocks
- Flags anomalies in the latent space WITHOUT needing labeled manipulation data
- Academic results: AUC-ROC 0.95
- No labeled P&D examples needed — just enough "normal" stock data

**GraphSAGE on Social Networks**:

- Identifies pump organizers through network topology
- Who's connected to whom, information flow patterns
- 90.3% accuracy in deployment (Perseus paper, arXiv:2503.01686)
- Catches organizers before the pump is announced to the public

**XGBoost Candidate Pre-Filter**:

- Narrows ~7,000 stocks to ~100-500 high-risk candidates
- Features: market cap, OTC status, filing patterns, dormancy, social engagement
- Reduces compute cost for expensive real-time monitoring

### SMOTE for Class Imbalance

- P&D events are rare (<1% of stocks on any given day)
- SMOTE synthetic oversampling on the minority class
- Gradient boosting on insider filing features achieved F1 up to 99.47% in academic research (IFD dataset)

---

## Option 6: Domain/Promotional Infrastructure Monitoring

**Time**: 1 week | **Cost**: ~$50/mo (WhoisXML API) | **Detection improvement**: 1-3 weeks earlier

Pump organizers set up promotional websites days-to-weeks before campaigns launch.

### Implementation

- **WhoisXML API**: Monitor for newly registered domains containing OTC ticker symbols, company names, or phrases like "investor alert," "stock pick," "next [company]"
- **Known promoter tracking**: Build a database of promoter registrant emails/organizations. Alert when they register new domains.
- **Wayback Machine API**: Check if dormant domains associated with shell companies are suddenly being updated

### New Signal

`PROMOTIONAL_DOMAIN_DETECTED` (weight 3)

### Why This Works

Very high signal-to-noise ratio. Legitimate companies don't register "investoralert-[ticker].com" domains. When a promotional domain appears for a micro-cap OTC stock, it's almost always a scheme setup.

---

## Implementation Priority

| Priority | Option                      | Time      | Cost    | Detection Improvement   |
| -------- | --------------------------- | --------- | ------- | ----------------------- |
| **1**    | Tune existing thresholds    | 1-2 days  | Free    | 2-3 days earlier        |
| **2**    | Social media early warning  | 1-2 weeks | Free    | 1-7 days earlier        |
| **3**    | Pre-pump structural signals | 3-5 days  | Free    | 1-4 weeks earlier       |
| **4**    | Domain monitoring           | 1 week    | ~$50/mo | 1-3 weeks earlier       |
| **5**    | Intraday monitoring         | 2-4 weeks | $199/mo | Minutes (intraday)      |
| **6**    | ML model overhaul           | 2-4 weeks | Free    | Better accuracy overall |

**Options 1-3 together transform detection from "catching the pump at 50-80% complete" to "catching the setup phase or the first 1-2 days of the pump."** All implementable within the existing architecture.

---

## Academic References

1. "Machine Learning-Based Detection of Pump-and-Dump Schemes in Real-Time" (Dec 2024, arXiv:2412.18848) — BERTweet + Z-score, 55.81% top-5 at 20 seconds pre-pump
2. "Microstructure and Manipulation: Quantifying Pump-and-Dump Dynamics" (Apr 2025, arXiv:2504.15790) — Two P&D archetypes, 70% of pre-event volume in final hour
3. "Perseus: Tracing the Masterminds Behind P&D Schemes" (Mar 2025, arXiv:2503.01686) — GraphSAGE, 438 masterminds identified, 90.3% accuracy
4. "Detecting Crypto P&D Schemes: Thresholding-Based Approach" (Mar 2025, arXiv:2503.08692) — EWMA + volatility, Precision 0.84, F1 0.71
5. "Deep Unsupervised Anomaly Detection in High-Frequency Markets" (2024, ScienceDirect) — Transformer autoencoder, AUC-ROC 0.95
6. "Detecting Multilevel Manipulation from LOB via Cascaded Contrastive Learning" (Aug 2025, arXiv:2508.17086) — AUROC 0.975
7. "Detecting P&D with Imbalanced Datasets and Insiders' Anticipated Purchases" (2023, MDPI) — SMOTE + ensemble, flags 60 minutes before pump
8. "Real-Time ML Detection of Telegram-Based P&D Schemes" (2025, ACM DeFi) — F1 94.5%, 25-second detection
9. "STAGE: Stock Dynamic Anomaly Detection via GAT" (2025, PLOS ONE) — GAT + VAE for cross-stock anomalies
10. "Network-informed Prompt Engineering against Organized Astroturfing" (Jan 2025, arXiv:2501.11849) — LLM+RAG, 2-3x precision improvement

## Key Data Sources

| Data Source                | What It Provides                           | Access                         | Cost                         |
| -------------------------- | ------------------------------------------ | ------------------------------ | ---------------------------- |
| SEC EDGAR API              | Filings, XBRL financials, full-text search | `data.sec.gov`                 | Free                         |
| FINRA OTC Transparency API | Dark pool volume, short interest, ATS data | `developer.finra.org`          | Free                         |
| SEC FTD Data               | Fails-to-deliver by security               | `sec.gov/data-research`        | Free                         |
| Polygon.io                 | NBBO, trades, tick data                    | `polygon.io`                   | Free tier, $199/mo real-time |
| Unusual Whales API         | Options flow, dark pool, sweeps            | `unusualwhales.com/public-api` | $50-200/mo                   |
| WhoisXML API               | Domain registration monitoring             | `whoisxmlapi.com`              | Paid tiers                   |
| ApeWisdom API              | Reddit stock mention tracking              | `apewisdom.io/api/`            | Free                         |
| Telethon                   | Telegram channel monitoring                | Python library                 | Free                         |
| LOBSTER                    | NASDAQ limit order books                   | `lobsterdata.com`              | Paid (academic pricing)      |
| Databento                  | Tick-level L2/L3 order book                | `databento.com`                | $125 credit + usage          |
| OTC Markets                | Compliance tiers, company data             | `otcmarkets.com`               | Limited free                 |
