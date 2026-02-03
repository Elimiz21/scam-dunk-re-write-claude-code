# ScamDunk Enhanced Daily Scanning Pipeline

This document describes the enhanced daily scanning pipeline that runs automatically on US market trading days to detect potential stock manipulation schemes.

## Pipeline Overview

The enhanced pipeline runs through 5 phases:

### Phase 1: Risk Scoring All Stocks
- Scans all US-listed stocks using the FMP API
- Runs **4 AI scanning layers** (if Python AI backend is available):

**Layer 1: Deterministic Signal Detection (Rule-Based)**
- Structural signals: market cap, price level, exchange type, liquidity
- Pattern signals: price spikes, volume explosions, pump-and-dump patterns
- Alert signals: SEC regulatory flags

**Layer 2: Statistical Anomaly Detection**
- Z-score analysis for price and volume deviations
- Keltner Channel breakout detection
- Average True Range (ATR) volatility analysis
- Surge detection metrics (volume surge factor, price change rates)

**Layer 3: Machine Learning Classification (Random Forest)**
- 31-dimensional feature vector analysis
- Trained on synthetic scam vs. normal stock patterns
- ~95% accuracy, ~93% precision

**Layer 4: Deep Learning Sequence Analysis (LSTM)**
- 30-day time series pattern analysis
- Captures temporal pump-and-dump signatures
- Learns accumulation → pump → dump sequences

**Ensemble Prediction:**
- Combines all 4 layers using weighted averaging
- Context-aware boosting for SEC flags, OTC + micro-cap combinations
- Final risk classification: LOW / MEDIUM / HIGH


### Phase 2: Size & Volume Filtering
High-risk stocks are filtered to remove those not susceptible to manipulation:
- **Market Cap Filter**: Removes stocks > $10B market cap
- **Volume Filter**: Removes stocks > $10M daily dollar volume
- **Top 100 Exclusion**: Optionally excludes largest companies

### Phase 3: News & SEC Filing Analysis
For remaining high-risk stocks, the pipeline checks for legitimate explanations:
- **Recent News**: Earnings, FDA approvals, partnerships, M&A
- **SEC Filings**: 8-K, 10-Q, 10-K, press releases
- **Press Releases**: Company announcements
- Uses AI to determine if news legitimately explains price/volume movements
- Stocks with legitimate news are filtered out

### Phase 4: Social Media Scanning
For suspicious stocks with no legitimate news explanation:
- **Reddit**: r/wallstreetbets, r/pennystocks, r/Shortsqueeze, etc.
- **StockTwits**: Real-time message analysis
- **Twitter/X**: Cashtag and fintwit analysis
- **YouTube**: Stock tip video detection
- **Discord/Telegram**: Pump group analysis
- **TikTok/Facebook/Instagram**: Influencer promotion detection

Generates:
- Platform-specific activity levels
- Promotion risk scores
- Potential promoter identification
- Coordination indicators

### Phase 5: Scheme Tracking
For stocks with high promotion scores:
- Creates numbered scheme records (e.g., `SCH-EVTV-20260202-XXXX`)
- Tracks scheme lifecycle: NEW → ONGOING → COOLING → RESOLVED
- Monitors price movements from detection
- Records promoter accounts and platforms
- Maintains timeline of events
- Generates daily reports with priority levels

## Output Files

The pipeline generates the following files daily:

```
evaluation/results/
├── enhanced-evaluation-YYYY-MM-DD.json    # Full results for all stocks
├── enhanced-high-risk-YYYY-MM-DD.json     # High-risk stocks before filtering
├── suspicious-stocks-YYYY-MM-DD.json       # After all filters + social scan
├── daily-report-YYYY-MM-DD.json            # Summary statistics
├── scheme-report-YYYY-MM-DD.md             # Human-readable scheme report

evaluation/scheme-database/
├── scheme-database.json                     # Persistent scheme tracking database
```

## Scheme Database Schema

Each scheme record contains:

```json
{
  "schemeId": "SCH-SYMBOL-YYYYMMDD-XXXX",
  "symbol": "TICKER",
  "name": "Company Name",
  "status": "NEW|ONGOING|COOLING|RESOLVED|CONFIRMED_FRAUD",
  "daysActive": 1,
  "peakRiskScore": 16,
  "currentRiskScore": 14,
  "peakPromotionScore": 80,
  "currentPromotionScore": 65,
  "priceAtDetection": 2.50,
  "peakPrice": 4.00,
  "currentPrice": 1.80,
  "priceChangeFromDetection": -28,
  "priceChangeFromPeak": -55,
  "promotionPlatforms": ["Reddit", "Twitter/X", "Discord"],
  "promoterAccounts": [...],
  "signalsDetected": ["SPIKE_7D", "VOLUME_EXPLOSION", ...],
  "coordinationIndicators": [...],
  "timeline": [...]
}
```

## Risk Assessment Levels

### Urgency Levels
- **CRITICAL**: Active pump with high promotion > 70, rising price, risk score >= 10
- **HIGH**: Active scheme with promotion >= 60 or risk >= 8, with identified promoters
- **MEDIUM**: Early stage or cooling schemes with moderate scores
- **LOW**: Monitored stocks with lower activity

### Status Lifecycle
1. **NEW**: First detection
2. **ONGOING**: Active for 2+ days
3. **COOLING**: Price dropped > 30% from peak (possible dump phase)
4. **RESOLVED**: No longer showing suspicious activity
5. **CONFIRMED_FRAUD**: SEC action or definitive evidence

## Running the Pipeline

### Full Production Run
```bash
# Via GitHub Actions (automatic on trading days)
# Or manually trigger with workflow_dispatch

# Local test with existing data
TEST_MODE=true npx ts-node evaluation/scripts/enhanced-daily-pipeline.ts
```

### Test with Existing Data
```bash
npx ts-node evaluation/scripts/test-enhanced-pipeline.ts
```

### Scheme Management CLI
```bash
# List active schemes
npx ts-node evaluation/scripts/scheme-tracker.ts list

# Generate report
npx ts-node evaluation/scripts/scheme-tracker.ts report YYYY-MM-DD

# Export data
npx ts-node evaluation/scripts/scheme-tracker.ts export json|csv

# Archive old schemes
npx ts-node evaluation/scripts/scheme-tracker.ts archive 30
```

## Configuration

Environment variables:
```
FMP_API_KEY=your-financial-modeling-prep-key
OPENAI_API_KEY=your-openai-key (for AI-powered analysis)
AI_BACKEND_URL=https://your-python-ai-backend (for full 4-layer analysis)
```

**Note on AI_BACKEND_URL:**
- If set, the pipeline will call the Python AI backend to run all 4 layers (Deterministic, Anomaly, Random Forest, LSTM)
- If not set, only Layer 1 (TypeScript deterministic scoring) is used
- The Python AI backend should be deployed and accessible at the specified URL

Thresholds (configurable in scripts):
- Market cap filter: $10B
- Volume filter: $10M daily
- Promotion score threshold for scheme creation: 50
- Minimum risk score for high-risk: 5

## GitHub Actions Workflow

The `enhanced-daily-evaluation.yml` workflow:
- Runs at **11 PM UTC (6 PM EST, 2 hours after market close)** on weekdays
- Checks for US market holidays
- Runs full pipeline with all 4 AI layers (if AI_BACKEND_URL is configured)
- Uploads results to Supabase storage
- Pushes to scam-dunk-data repository
- Creates issue on failure

Manual triggers available:
- `force_run`: Run on holidays/weekends
- `test_mode`: Process only 100 stocks
- `date_override`: Run for specific date
- `skip_social_scan`: Skip social media phase

