# Early Pump-and-Dump Detection — Design Spec

**Date**: 2026-03-24
**Scope**: Options 1-3 from pump-discovery-overhaul-plan.md
**Goal**: Catch pump-and-dump schemes at the beginning of the pump phase instead of mid-to-late pump or dump phase.

---

## 1. Overview

Three coordinated changes to the detection pipeline:

1. **Threshold tuning** — Lower thresholds and add shorter detection windows to catch smaller, earlier price movements (especially on OTC/penny stocks)
2. **Pre-pump structural signals** — Monitor SEC EDGAR filings, insider transactions, and FINRA short interest for manipulation setup indicators that appear weeks before a pump
3. **Social media early warning** — Proactive mention-velocity monitoring to build a watchlist of stocks being promoted, feeding tighter scoring thresholds

**Key constraint**: The existing Phase 4 post-scoring social scan remains unchanged. The new social early warning (Phase 0) is additive — it builds a watchlist that feeds into Phase 1, while Phase 4 continues as confirmation/evidence for HIGH-risk stocks.

---

## 2. Option 1: Threshold Tuning

### 2.1 Files Modified

| File                                      | Changes                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `python_ai/config.py`                     | New threshold tier dicts (`OTC_THRESHOLDS`, `MAJOR_EXCHANGE_THRESHOLDS`, `WATCHLIST_THRESHOLDS`), `get_thresholds()` selector function, 3-day window params                              |
| `python_ai/feature_engineering.py`        | Add 3-day price/volume features, acceleration features. Pass `thresholds` dict to `compute_surge_metrics()` instead of reading `ANOMALY_CONFIG` directly                                 |
| `python_ai/pipeline.py`                   | Integrate new signals into `compute_signals()`. Determine stock's threshold tier (OTC/major/watchlist) early in `analyze()` and pass to all downstream functions                         |
| `python_ai/anomaly_detection.py`          | Add 3-day anomaly window. Accept `thresholds` parameter instead of reading `ANOMALY_CONFIG` directly (call sites: `detect_anomalies()` lines 46-47, `detect_surge_anomalies()` line 130) |
| `src/lib/scoring.ts`                      | Add `SPIKE_3D`, `VOLUME_SURGE_3D`, `PRICE_ACCELERATION`, `VOLUME_ACCELERATION` signals. Add OTC-tiered threshold selection logic using `isOTC` from `MarketData`                         |
| `src/lib/types.ts`                        | Add `"SOCIAL"` to `SignalCategory` union type                                                                                                                                            |
| `src/lib/marketData.ts`                   | Add 3-day spike detection, acceleration computation                                                                                                                                      |
| `evaluation/scripts/standalone-scorer.ts` | Mirror new signals + OTC-tiered thresholds. Update local `RiskSignal` type to include `"SOCIAL"` category                                                                                |

### 2.2 Threshold Changes

All changes are OTC-tiered: OTC/penny stocks get aggressive thresholds, major-exchange stocks keep existing values.

**`python_ai/config.py` changes:**

```python
# New OTC-specific thresholds (added alongside existing)
OTC_THRESHOLDS = {
    "price_surge_7d_threshold": 0.10,    # was 0.25 (global)
    "price_surge_3d_threshold": 0.08,    # NEW
    "volume_surge_moderate": 2.0,         # was 3.0 (global)
    "volume_surge_3d": 2.0,              # NEW
    "pump_dump_rise": 0.12,              # was 0.20 (global)
    "z_score_threshold": 1.8,            # was 2.5 (global)
}

# Major exchange stocks keep existing thresholds
MAJOR_EXCHANGE_THRESHOLDS = {
    "price_surge_7d_threshold": 0.25,    # unchanged
    "price_surge_3d_threshold": 0.15,    # NEW (higher bar for major)
    "volume_surge_moderate": 3.0,         # unchanged
    "volume_surge_3d": 3.0,              # NEW
    "pump_dump_rise": 0.20,              # unchanged
    "z_score_threshold": 2.5,            # unchanged
}
```

**Threshold selection function** (added to `config.py`):

```python
def get_thresholds(is_otc: bool, on_watchlist: bool = False) -> dict:
    """Select threshold tier based on stock context."""
    if on_watchlist:
        return WATCHLIST_THRESHOLDS
    if is_otc:
        return OTC_THRESHOLDS
    return MAJOR_EXCHANGE_THRESHOLDS
```

**Call sites that must pass thresholds instead of reading `ANOMALY_CONFIG` directly:**

- `feature_engineering.py`: `compute_surge_metrics()` (line ~202: `ANOMALY_CONFIG['price_surge_7d_threshold']`)
- `anomaly_detection.py`: `detect_anomalies()` (lines 46-47: `ANOMALY_CONFIG['z_score_threshold']`), `detect_surge_anomalies()` (line ~130)
- `pipeline.py`: `compute_signals()` — determine tier in `analyze()` and pass down

**TypeScript equivalent** (in `scoring.ts`):

```typescript
function getThresholds(isOTC: boolean, onWatchlist: boolean = false) {
  if (onWatchlist) return WATCHLIST_THRESHOLDS;
  if (isOTC) return OTC_THRESHOLDS;
  return MAJOR_EXCHANGE_THRESHOLDS;
}
```

Applied in `getPatternSignals()` which already receives `MarketData` containing `isOTC`. Same pattern in `standalone-scorer.ts`.

### 2.3 New Signals

| Signal                | Trigger (OTC)                                | Trigger (Major)        | Weight              | Category |
| --------------------- | -------------------------------------------- | ---------------------- | ------------------- | -------- |
| `SPIKE_3D`            | 8%+ in 3 days                                | 15%+ in 3 days         | 2 (8-20%), 3 (>20%) | PATTERN  |
| `VOLUME_SURGE_3D`     | 2x avg in 3-day window                       | 3x avg in 3-day window | 2                   | PATTERN  |
| `PRICE_ACCELERATION`  | 3 consecutive days of increasing daily gains | same                   | 2                   | PATTERN  |
| `VOLUME_ACCELERATION` | 3+ consecutive days of increasing volume     | same                   | 2                   | PATTERN  |

### 2.4 Feature Engineering Additions

In `python_ai/feature_engineering.py`, add to `compute_surge_metrics()`:

```python
# 3-day window features
price_change_3d = (current_close - close_3d_ago) / close_3d_ago
volume_avg_3d = volume[-3:].mean()
volume_surge_3d = volume_avg_3d / volume_avg_30d

# Acceleration features (second derivative)
daily_returns = df['Close'].pct_change()
price_acceleration = (daily_returns.iloc[-1] > daily_returns.iloc[-2] > daily_returns.iloc[-3])
volume_acceleration = all(df['Volume'].iloc[-i] > df['Volume'].iloc[-i-1] for i in range(1, 4))
```

These features feed into the existing feature vector and signal computation.

### 2.5 Watchlist Boost

When a stock appears on the pre-pump watchlist (from Option 3), thresholds drop further:

```python
WATCHLIST_THRESHOLDS = {
    "price_surge_7d_threshold": 0.05,    # 5% move on a watched stock
    "price_surge_3d_threshold": 0.04,    # very sensitive
    "volume_surge_moderate": 1.5,         # 1.5x is notable for watched stocks
    "z_score_threshold": 1.5,
}
```

---

## 3. Option 2: Pre-Pump Structural Signals

### 3.1 New Module: `python_ai/pre_pump_signals.py`

A self-contained module with three sub-detectors, each returning a list of signal dicts compatible with the existing signal-weight system.

### 3.2 SEC EDGAR Filing Monitor

**Data sources** (free, no auth):

- Filing lookups: `https://data.sec.gov/submissions/CIK{cik_padded}.json` (modern EDGAR API)
- Full-text search: `https://efts.sec.gov/LATEST/search-index?q=...` (EFTS)
- CIK lookup: `https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK={ticker}&type=&dateb=&owner=include&count=10&search_text=&action=getcompany` (legacy, fallback to `data.sec.gov/submissions/` for modern approach)

**What it checks** (for stocks with market cap < $300M):

- Form 8-K filings in last 90 days with keywords: "reverse merger", "change of control", "name change", "shell company", "going concern"
- Form S-1 filings (new registrations) from previously dormant entities
- Filing frequency anomalies: company that filed nothing for 6+ months then suddenly files multiple forms

**Signals produced:**

| Signal                    | Trigger                                                          | Weight |
| ------------------------- | ---------------------------------------------------------------- | ------ |
| `SHELL_REACTIVATION`      | Dormant entity (no filings 6+ months) resumes filing             | 3      |
| `REVERSE_MERGER_OTC`      | 8-K with reverse merger/change of control keywords for OTC stock | 2      |
| `SUSPICIOUS_FILING_BURST` | 3+ filings in 30 days after 6+ months of silence                 | 2      |

**Implementation approach:**

- `fetch_edgar_filings(ticker, cik)` — Fetch recent filings from EDGAR full-text search
- `analyze_filing_patterns(filings)` — Check for dormancy-then-activity, keyword matches
- Cache CIK lookups (ticker→CIK mapping from `https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK={ticker}&type=&dateb=&owner=include&count=10&search_text=&action=getcompany`)
- Rate limit: EDGAR asks for 10 requests/second max, use 5/sec to be safe

### 3.3 Form 4 Insider Filing Analysis

**Data source**: SEC EDGAR ATOM feed for Form 4 filings, filtered by CIK

**What it checks:**

- Zero insider buying in last 90 days despite price movement or promotional activity
- Form 144 filings (intent to sell restricted shares) — clustered filings from multiple insiders
- Insider selling while price is rising (classic pre-dump distribution)

**Signals produced:**

| Signal                  | Trigger                                                           | Weight |
| ----------------------- | ----------------------------------------------------------------- | ------ |
| `INSIDER_SELLING_SETUP` | Form 144 filed + stock showing price increase                     | 2      |
| `NO_INSIDER_BUYING`     | Zero Form 4 purchase filings in 90 days on a stock with 20%+ gain | 1      |

**Implementation approach:**

- `fetch_insider_filings(cik)` — Fetch Form 4 and Form 144 from EDGAR
- `analyze_insider_behavior(filings, price_data)` — Cross-reference filing activity with price movement
- Only runs for stocks that are already flagged by other signals OR on the pre-pump watchlist (to limit API calls)

### 3.4 FINRA Short Interest / FTD

**Data sources:**

- FINRA OTC Transparency API (`https://api.finra.org/data/group/otcMarket/`) — free, requires registration
- SEC FTD data (`https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data`) — CSV, published twice monthly

**What it checks:**

- Short interest spike: >3x increase from previous reporting period on an OTC stock
- FTD concentration: FTDs > 0.5% of outstanding shares for 5+ consecutive settlement days
- Dark pool volume anomaly: ATS volume > 30% of daily average in a single block

**Signals produced:**

| Signal                 | Trigger                                                  | Weight |
| ---------------------- | -------------------------------------------------------- | ------ |
| `SHORT_INTEREST_SPIKE` | Short interest jumps >3x from previous period            | 2      |
| `HIGH_FTD_RATE`        | FTDs > 0.5% of float for 5+ days (RegSHO threshold list) | 1      |

**Implementation approach:**

- `fetch_short_interest(ticker)` — Query FINRA API
- `fetch_ftd_data(ticker)` — Parse latest SEC FTD CSV
- Results cached daily (short interest updates twice monthly, FTDs twice monthly)

### 3.5 Integration into Pipeline

**New FastAPI endpoint**: `POST /pre-pump-scan`

- Accepts: `{ tickers: string[], fundamentals: { [ticker]: { market_cap, exchange, sector } } }` (batch of tickers with basic fundamentals from the stock universe JSON, NOT price data — the Python backend fetches its own price data via yfinance for stocks that need it)
- Returns: `{ results: { [ticker]: { signals: Signal[], watchlist_recommended: bool } } }`
- Called during daily pipeline before Phase 1 scoring
- Only processes stocks with market cap < $300M and on OTC/micro-cap exchanges

**Daily pipeline integration** (`enhanced-daily-pipeline.ts`):

- After loading stock universe, before Phase 1 scoring loop:
  1. Filter to OTC/penny stocks (market cap < $300M from `us-stocks.json` fundamentals or previous day's snapshot)
  2. Batch-call `POST /pre-pump-scan` with filtered tickers + their basic fundamentals
  3. Store returned signals in a `Map<string, Signal[]>` keyed by ticker
  4. During Phase 1 per-stock scoring: merge pre-pump signals into the stock's signal array AFTER `compute_signals()` returns (append, don't inject into `compute_signals()` parameters)

**Signal merging approach**: Pre-pump signals (Option 2) and social early warning signals (Option 3) are appended to the signal list at the `analyze()` method level in `pipeline.py`, AFTER `compute_signals()` returns. This avoids modifying `compute_signals()`'s parameter list for external data. The `analyze()` method already has access to the final signal list and can extend it.

---

## 4. Option 3: Social Media Early Warning

### 4.1 Architecture: Two-Pass Social Scanning

```
PHASE 0 (NEW — upstream, proactive)
  Run: Every execution of daily pipeline, BEFORE Phase 1
  Scope: All OTC/penny stocks (from stock universe)
  Purpose: Build watchlist from social mention velocity
  Output: watchlist table in Supabase + tighter thresholds for Phase 1

PHASE 4 (EXISTING — downstream, confirmatory)
  Run: After Phase 3 news filtering (unchanged)
  Scope: Top 50 HIGH-risk stocks after scoring
  Purpose: Gather social proof for scheme tracker
  Output: Social mentions, promotion scores, promoter accounts
  STATUS: NO CHANGES — continues working exactly as today
```

### 4.2 New Module: `python_ai/social_early_warning.py`

Lightweight mention-velocity tracker. NOT a full social scanner — just monitors mention counts and velocity.

**Data sources (all free):**

- ApeWisdom API (`https://apewisdom.io/api/v1.0/filter/all-stocks/`) — Reddit mention counts, updated hourly
- StockTwits API (new Python client needed — existing scanner is TypeScript-only in `evaluation/scripts/social-scan/stocktwits-scanner.ts`) — message volume per ticker
- Optional: Serper API (already have key) for Google trending queries

**What it tracks:**

For each OTC/penny stock:

- `mention_count_24h`: Total mentions across Reddit + StockTwits in last 24 hours
- `mention_baseline_7d`: Average daily mentions over previous 7 days
- `mention_velocity`: `mention_count_24h / max(mention_baseline_7d, 1)`
- `mention_acceleration`: Is velocity increasing day-over-day?
- `unique_authors_ratio`: Number of unique posters / total mentions (low ratio = bot/coordinated behavior)

**Watchlist criteria:**

- `mention_velocity >= 3.0` (3x baseline mentions) → add to watchlist
- `mention_velocity >= 5.0` AND `unique_authors_ratio < 0.3` → add to watchlist with `COORDINATED_PROMOTION` flag

### 4.3 Signals Produced

| Signal                      | Trigger                                                                   | Weight                                            |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| `SOCIAL_PROMOTION_DETECTED` | mention_velocity >= 3x baseline on OTC/penny stock                        | 3                                                 |
| `MENTION_VELOCITY_SPIKE`    | mention_velocity >= 5x baseline                                           | 2                                                 |
| `COORDINATED_BOT_ACTIVITY`  | velocity >= 5x AND unique_authors_ratio < 0.3 AND mention_count_24h >= 10 | 3 (start conservative, tune up after calibration) |

### 4.4 Watchlist Storage

**Watchlist storage via Prisma migration** (see Section 4.7 for Prisma model — that is the source of truth; no raw SQL needed):

**Lifecycle:**

- Stocks are added when social velocity or structural signals cross thresholds
- Stocks are deactivated after 7 days of no continued signals
- Stocks move to scheme tracker if they graduate to HIGH risk during Phase 1

### 4.5 New FastAPI Endpoint

`POST /social-early-warning`

- Accepts: `{ tickers: string[] }` (OTC/penny stock list)
- Returns: `{ watchlist: { [ticker]: { mention_velocity, signals, watchlist_recommended } } }`
- Called at the start of the daily pipeline (Phase 0)

### 4.6 Daily Pipeline Integration

In `enhanced-daily-pipeline.ts`, add Phase 0 before Phase 1:

```
Phase 0 — Social Early Warning
  1. Load stock universe, filter to OTC/penny (market cap < $300M)
  2. Call Python backend POST /social-early-warning with filtered tickers
  3. For tickers meeting watchlist criteria:
     a. Upsert into pre_pump_watchlist table
     b. Flag in-memory for Phase 1 threshold reduction
  4. Load existing active watchlist entries from Supabase
  5. Combine: all currently-active watchlist tickers get WATCHLIST_THRESHOLDS during Phase 1
  6. Deactivate stale entries (>7 days, no new signals)
```

Phase 1 scoring then checks: `is this ticker on the watchlist?` → if yes, use `WATCHLIST_THRESHOLDS` instead of `OTC_THRESHOLDS`.

Phase 4 social scanning continues unchanged on top-50 HIGH-risk stocks.

### 4.7 Prisma Schema Addition

```prisma
model PrePumpWatchlist {
  id                  String    @id @default(uuid())
  ticker              String
  addedDate           DateTime  @default(now())
  source              String
  mentionVelocity     Float?
  mentionCount24h     Int?
  uniqueAuthorsRatio  Float?
  signals             Json?
  isActive            Boolean   @default(true)
  deactivatedDate     DateTime?
  deactivationReason  String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@index([isActive, ticker])
  @@index([addedDate])
  @@map("pre_pump_watchlist")
}
```

---

## 5. Signal Integration Summary

All new signals feed into the existing signal-weight architecture. No changes to the scoring formula — just new inputs.

### Complete New Signal Registry

| Signal                      | Weight | Category   | Source            | Option |
| --------------------------- | ------ | ---------- | ----------------- | ------ |
| `SPIKE_3D`                  | 2-3    | PATTERN    | Price data        | 1      |
| `VOLUME_SURGE_3D`           | 2      | PATTERN    | Volume data       | 1      |
| `PRICE_ACCELERATION`        | 2      | PATTERN    | Price data        | 1      |
| `VOLUME_ACCELERATION`       | 2      | PATTERN    | Volume data       | 1      |
| `SHELL_REACTIVATION`        | 3      | STRUCTURAL | SEC EDGAR         | 2      |
| `REVERSE_MERGER_OTC`        | 2      | STRUCTURAL | SEC EDGAR         | 2      |
| `SUSPICIOUS_FILING_BURST`   | 2      | STRUCTURAL | SEC EDGAR         | 2      |
| `INSIDER_SELLING_SETUP`     | 2      | STRUCTURAL | SEC EDGAR         | 2      |
| `NO_INSIDER_BUYING`         | 1      | STRUCTURAL | SEC EDGAR         | 2      |
| `SHORT_INTEREST_SPIKE`      | 2      | STRUCTURAL | FINRA             | 2      |
| `HIGH_FTD_RATE`             | 1      | STRUCTURAL | SEC FTD           | 2      |
| `SOCIAL_PROMOTION_DETECTED` | 3      | SOCIAL     | Reddit/StockTwits | 3      |
| `MENTION_VELOCITY_SPIKE`    | 2      | SOCIAL     | Reddit/StockTwits | 3      |
| `COORDINATED_BOT_ACTIVITY`  | 3      | SOCIAL     | Reddit/StockTwits | 3      |

### Threshold Tier Summary

| Tier           | When Applied                    | price_surge_7d | volume_surge | z_score |
| -------------- | ------------------------------- | -------------- | ------------ | ------- |
| MAJOR_EXCHANGE | NYSE/NASDAQ listed, cap > $300M | 0.25           | 3.0          | 2.5     |
| OTC_DEFAULT    | OTC/penny, not on watchlist     | 0.10           | 2.0          | 1.8     |
| WATCHLIST      | On pre_pump_watchlist           | 0.05           | 1.5          | 1.5     |

---

## 6. Prerequisites & New Environment Variables

| Variable                | Source                            | Required For                                                  | Required?                                             |
| ----------------------- | --------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| (none new for Option 1) | —                                 | Threshold tuning                                              | —                                                     |
| `FINRA_API_KEY`         | Register at `developer.finra.org` | Option 2: Short interest/FTD data                             | Optional (FTD data available via SEC CSV without key) |
| (none new for Option 3) | —                                 | Social early warning (ApeWisdom + StockTwits are public APIs) | —                                                     |

**Note on data staleness**: FINRA short interest is published twice monthly. SEC FTD data has a 2-week delay. These are leading structural indicators but not real-time. They detect setup conditions days/weeks ahead, which is the intent.

---

## 7. Pipeline Infrastructure Changes

### Phase 0 Integration

The existing `scanStatus.phases` object in `enhanced-daily-pipeline.ts` tracks phases 1-5. Add:

```typescript
// In the PhaseStatus / scanStatus interface:
phase0_socialEarlyWarning: {
  (status, startTime, endTime, stocksProcessed, watchlistAdded);
}
```

The email report template (line ~1098) and `scan-status-{date}.json` output both need updating to include Phase 0 results.

### `getSignalsByCategory()` Update

In `scoring.ts` (lines 536-548), the function returns an object with fixed keys `{ structural, pattern, alert, behavioral }`. Add `social` key to the return type and grouping logic.

---

## 8. Testing Strategy

- **Unit tests**: Each new signal computation function gets isolated tests with known inputs/outputs
- **Regression tests**: Run existing scheme database entries through new scoring — confirm all previously-caught schemes still get caught (no regressions)
- **False positive analysis**: Run new thresholds against last 30 days of daily scan results — measure increase in HIGH-risk flags and spot-check for legitimacy
- **Integration test**: End-to-end daily pipeline run in test mode (100 stocks) with new Phase 0 + modified Phase 1

---

## 9. Rollout Plan

1. Deploy Option 1 (threshold tuning) first — lowest risk, immediate improvement
2. Deploy Option 2 (structural signals) — additive, can't break existing scoring
3. Deploy Option 3 (social early warning) — requires new Supabase table + Phase 0 pipeline changes
4. Monitor for 1 week, compare detection timing against known schemes
5. Tune weights based on real-world false positive/negative rates
