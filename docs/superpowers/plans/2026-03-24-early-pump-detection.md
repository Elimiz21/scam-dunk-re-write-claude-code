# Early Pump-and-Dump Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch pump-and-dump schemes at the beginning of the pump phase by adding OTC-tiered thresholds, 3-day detection windows, pre-pump structural signals from SEC EDGAR/FINRA, and a social media early warning watchlist system.

**Architecture:** Three additive layers: (1) lower detection thresholds with OTC-awareness, (2) new Python module for SEC/FINRA structural signals, (3) new Python module for social mention velocity tracking. All produce signals that feed into the existing signal-weight scoring system. A new "Phase 0" in the daily pipeline builds a watchlist from social/structural data that applies even tighter thresholds during Phase 1 scoring.

**Tech Stack:** Python (FastAPI, pandas, requests), TypeScript (Next.js), Prisma (PostgreSQL/Supabase), SEC EDGAR API, FINRA API, ApeWisdom API, StockTwits API

**Spec:** `docs/superpowers/specs/2026-03-24-early-pump-detection-design.md`

---

## File Structure

### New Files

| File                                           | Responsibility                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `python_ai/pre_pump_signals.py`                | SEC EDGAR filing monitor, insider filing analysis, FINRA short interest/FTD detection |
| `python_ai/social_early_warning.py`            | ApeWisdom + StockTwits mention velocity tracking, watchlist criteria evaluation       |
| `python_ai/tests/test_threshold_tuning.py`     | Tests for 3-day features, acceleration, OTC-tiered thresholds                         |
| `python_ai/tests/test_pre_pump_signals.py`     | Tests for EDGAR parsing, insider analysis, FINRA data                                 |
| `python_ai/tests/test_social_early_warning.py` | Tests for mention velocity, watchlist criteria, bot detection                         |
| `python_ai/tests/__init__.py`                  | Package init                                                                          |
| `python_ai/conftest.py`                        | Pytest fixtures for shared test data                                                  |

### Modified Files

| File                                                         | What Changes                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `python_ai/config.py` (147 lines)                            | Add `OTC_THRESHOLDS`, `MAJOR_EXCHANGE_THRESHOLDS`, `WATCHLIST_THRESHOLDS` dicts, `get_thresholds()` function                        |
| `python_ai/feature_engineering.py` (574 lines)               | Add 3-day features + acceleration features to `compute_surge_metrics()` (after line 194). Accept `thresholds` param.                |
| `python_ai/pipeline.py` (~900 lines)                         | Add new signals in `compute_signals()`. Determine threshold tier in `analyze()`. Append external signals after `compute_signals()`. |
| `python_ai/anomaly_detection.py` (491 lines)                 | Accept `thresholds` param in `detect_anomalies()`, `detect_surge_anomalies()`, `detect_zscore_anomalies()`. Add 3-day window.       |
| `python_ai/api_server.py` (429 lines)                        | Add `POST /pre-pump-scan` and `POST /social-early-warning` endpoints                                                                |
| `python_ai/requirements.txt` (13 lines)                      | Add `pytest`, `httpx`, `lxml`                                                                                                       |
| `src/lib/types.ts` (132 lines)                               | Add `"SOCIAL"` to `SignalCategory` union (line 7)                                                                                   |
| `src/lib/scoring.ts` (549 lines)                             | Add OTC-tiered thresholds, 4 new signals, update `getSignalsByCategory()`                                                           |
| `src/lib/marketData.ts` (~1350 lines)                        | No changes needed — 3-day detection is computed inline in `scoring.ts` `getPatternSignals()` using existing `priceHistory` data     |
| `evaluation/scripts/standalone-scorer.ts` (366 lines)        | Mirror all new signals + OTC-tiered thresholds                                                                                      |
| `evaluation/scripts/enhanced-daily-pipeline.ts` (2320 lines) | Add Phase 0 social early warning, integrate pre-pump signals into Phase 1, update `ScanStatus` interface                            |
| `prisma/schema.prisma` (1056 lines)                          | Add `PrePumpWatchlist` model after line 1055                                                                                        |

---

## Option 1: Threshold Tuning

### Task 1: Set Up Python Test Infrastructure

**Files:**

- Create: `python_ai/tests/__init__.py`
- Create: `python_ai/conftest.py`
- Modify: `python_ai/requirements.txt`

- [ ] **Step 1: Add pytest to requirements**

In `python_ai/requirements.txt`, append:

```
pytest==8.0.0
httpx==0.27.0
lxml==5.1.0
```

- [ ] **Step 2: Create test package**

Create `python_ai/tests/__init__.py` (empty file).

- [ ] **Step 3: Create conftest with shared fixtures**

Create `python_ai/conftest.py`:

```python
import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


@pytest.fixture
def sample_price_data():
    """30 days of normal stock price data."""
    dates = pd.date_range(end=datetime.now(), periods=30, freq='B')
    np.random.seed(42)
    base_price = 3.50
    returns = np.random.normal(0.001, 0.02, 30)
    prices = base_price * np.cumprod(1 + returns)
    volumes = np.random.randint(50000, 200000, 30)
    return pd.DataFrame({
        'Date': dates,
        'Open': prices * 0.99,
        'High': prices * 1.02,
        'Low': prices * 0.98,
        'Close': prices,
        'Volume': volumes,
    }).set_index('Date')


@pytest.fixture
def pump_price_data():
    """30 days with a 3-day pump pattern starting at day 25."""
    dates = pd.date_range(end=datetime.now(), periods=30, freq='B')
    np.random.seed(42)
    base_price = 2.00
    prices = np.full(30, base_price)
    volumes = np.full(30, 100000)
    # Normal for first 25 days
    for i in range(1, 25):
        prices[i] = prices[i-1] * (1 + np.random.normal(0.001, 0.01))
        volumes[i] = int(100000 * (1 + np.random.normal(0, 0.1)))
    # 3-day pump: accelerating gains + volume
    prices[25] = prices[24] * 1.04   # +4%
    prices[26] = prices[25] * 1.06   # +6%
    prices[27] = prices[26] * 1.09   # +9%
    prices[28] = prices[27] * 1.12   # +12%
    prices[29] = prices[28] * 1.05   # +5%
    volumes[25] = 250000   # 2.5x
    volumes[26] = 350000   # 3.5x
    volumes[27] = 500000   # 5x
    volumes[28] = 700000   # 7x
    volumes[29] = 400000   # 4x
    return pd.DataFrame({
        'Date': dates,
        'Open': prices * 0.99,
        'High': prices * 1.02,
        'Low': prices * 0.98,
        'Close': prices,
        'Volume': volumes.astype(int),
    }).set_index('Date')


@pytest.fixture
def otc_fundamentals():
    """Fundamentals for a typical OTC micro-cap stock."""
    return {
        'market_cap': 25_000_000,
        'exchange': 'OTC',
        'price': 2.50,
        'avg_volume': 100000,
        'float_shares': 10_000_000,
        'sector': 'Technology',
    }


@pytest.fixture
def major_exchange_fundamentals():
    """Fundamentals for a major exchange stock."""
    return {
        'market_cap': 500_000_000,
        'exchange': 'NASDAQ',
        'price': 45.00,
        'avg_volume': 2_000_000,
        'float_shares': 50_000_000,
        'sector': 'Technology',
    }
```

- [ ] **Step 4: Verify pytest runs**

Run: `cd python_ai && pip install pytest && python -m pytest tests/ -v --co`
Expected: "no tests ran" (collection only, no test files yet)

- [ ] **Step 5: Commit**

```bash
git add python_ai/tests/__init__.py python_ai/conftest.py python_ai/requirements.txt
git commit -m "chore: set up pytest infrastructure for Python AI backend"
```

---

### Task 2: Add OTC-Tiered Threshold Configuration

**Files:**

- Create: `python_ai/tests/test_threshold_tuning.py`
- Modify: `python_ai/config.py`

- [ ] **Step 1: Write failing tests for threshold selection**

Create `python_ai/tests/test_threshold_tuning.py`:

```python
from config import get_thresholds, OTC_THRESHOLDS, MAJOR_EXCHANGE_THRESHOLDS, WATCHLIST_THRESHOLDS


def test_otc_thresholds_more_aggressive():
    otc = get_thresholds(is_otc=True)
    major = get_thresholds(is_otc=False)
    assert otc['price_surge_7d_threshold'] < major['price_surge_7d_threshold']
    assert otc['volume_surge_moderate'] < major['volume_surge_moderate']
    assert otc['z_score_threshold'] < major['z_score_threshold']


def test_watchlist_thresholds_most_aggressive():
    watchlist = get_thresholds(is_otc=True, on_watchlist=True)
    otc = get_thresholds(is_otc=True)
    assert watchlist['price_surge_7d_threshold'] < otc['price_surge_7d_threshold']
    assert watchlist['volume_surge_moderate'] < otc['volume_surge_moderate']


def test_major_exchange_preserves_existing_values():
    major = get_thresholds(is_otc=False)
    assert major['price_surge_7d_threshold'] == 0.25
    assert major['volume_surge_moderate'] == 3.0
    assert major['z_score_threshold'] == 2.5


def test_otc_specific_values():
    otc = get_thresholds(is_otc=True)
    assert otc['price_surge_7d_threshold'] == 0.10
    assert otc['volume_surge_moderate'] == 2.0
    assert otc['z_score_threshold'] == 1.8


def test_all_tiers_have_3d_thresholds():
    for is_otc in [True, False]:
        for on_wl in [True, False]:
            t = get_thresholds(is_otc=is_otc, on_watchlist=on_wl)
            assert 'price_surge_3d_threshold' in t
            assert 'volume_surge_3d' in t


def test_watchlist_overrides_otc():
    """Watchlist tier takes priority even for non-OTC stocks."""
    wl = get_thresholds(is_otc=False, on_watchlist=True)
    assert wl['price_surge_7d_threshold'] == 0.05
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_threshold_tuning.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_thresholds'`

- [ ] **Step 3: Implement threshold tiers in config.py**

In `python_ai/config.py`, after the existing `ANOMALY_CONFIG` dict (after line 45), add:

```python
# --- OTC-tiered threshold system ---
# Aggressive thresholds for OTC/penny stocks (catches smaller early moves)
OTC_THRESHOLDS = {
    "price_surge_7d_threshold": 0.10,
    "price_surge_3d_threshold": 0.08,
    "volume_surge_moderate": 2.0,
    "volume_surge_3d": 2.0,
    "volume_surge_extreme": 4.0,
    "pump_dump_rise": 0.12,
    "z_score_threshold": 1.8,
    "volume_z_threshold": 1.5,
    "price_surge_1d_threshold": 0.08,
    "price_surge_extreme": 0.35,
}

# Standard thresholds for major exchange stocks (existing values preserved)
MAJOR_EXCHANGE_THRESHOLDS = {
    "price_surge_7d_threshold": 0.25,
    "price_surge_3d_threshold": 0.15,
    "volume_surge_moderate": 3.0,
    "volume_surge_3d": 3.0,
    "volume_surge_extreme": 5.0,
    "pump_dump_rise": 0.20,
    "z_score_threshold": 2.5,
    "volume_z_threshold": 2.0,
    "price_surge_1d_threshold": 0.10,
    "price_surge_extreme": 0.50,
}

# Ultra-sensitive thresholds for stocks on the pre-pump watchlist
WATCHLIST_THRESHOLDS = {
    "price_surge_7d_threshold": 0.05,
    "price_surge_3d_threshold": 0.04,
    "volume_surge_moderate": 1.5,
    "volume_surge_3d": 1.5,
    "volume_surge_extreme": 3.0,
    "pump_dump_rise": 0.08,
    "z_score_threshold": 1.5,
    "volume_z_threshold": 1.2,
    "price_surge_1d_threshold": 0.05,
    "price_surge_extreme": 0.25,
}


def get_thresholds(is_otc: bool, on_watchlist: bool = False) -> dict:
    """Select threshold tier based on stock context.

    Priority: watchlist > OTC > major exchange.
    Falls back to ANOMALY_CONFIG values for any key not in the tier dict.
    """
    if on_watchlist:
        return {**ANOMALY_CONFIG, **WATCHLIST_THRESHOLDS}
    if is_otc:
        return {**ANOMALY_CONFIG, **OTC_THRESHOLDS}
    return {**ANOMALY_CONFIG, **MAJOR_EXCHANGE_THRESHOLDS}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python_ai && python -m pytest tests/test_threshold_tuning.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add python_ai/config.py python_ai/tests/test_threshold_tuning.py
git commit -m "feat: add OTC-tiered threshold system to config"
```

---

### Task 3: Add 3-Day Features and Acceleration to Feature Engineering

**Files:**

- Modify: `python_ai/tests/test_threshold_tuning.py` (add feature tests)
- Modify: `python_ai/feature_engineering.py`

- [ ] **Step 1: Write failing tests for new features**

Append to `python_ai/tests/test_threshold_tuning.py`:

```python
import pandas as pd
from feature_engineering import compute_surge_metrics


def test_3d_price_change_computed(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Price_Change_3d' in result.columns
    # Last 3 days of pump data should show significant positive change
    assert result['Price_Change_3d'].iloc[-1] > 0.05


def test_3d_volume_surge_computed(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Volume_Surge_3d' in result.columns
    # Last 3 days should have elevated volume vs 30-day avg
    assert result['Volume_Surge_3d'].iloc[-1] > 1.5


def test_price_acceleration_detected(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Price_Acceleration' in result.columns
    # Pump data has accelerating daily gains
    assert result['Price_Acceleration'].iloc[-3] == 1


def test_volume_acceleration_detected(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Volume_Acceleration' in result.columns


def test_normal_data_no_acceleration(sample_price_data):
    result = compute_surge_metrics(sample_price_data)
    # Normal data should mostly not trigger acceleration
    assert result['Price_Acceleration'].sum() < 5  # few random hits
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_threshold_tuning.py::test_3d_price_change_computed -v`
Expected: FAIL — `KeyError: 'Price_Change_3d'`

- [ ] **Step 3: Add 3-day features to compute_surge_metrics()**

In `python_ai/feature_engineering.py`:

First, update `compute_surge_metrics()` signature at line 167 to accept thresholds:

```python
def compute_surge_metrics(df: pd.DataFrame, thresholds: dict = None) -> pd.DataFrame:
```

At line 179-180, replace direct `ANOMALY_CONFIG` reads:

```python
    _thresholds = thresholds or ANOMALY_CONFIG
    short_window = _thresholds['short_window']
    long_window = _thresholds['long_window']
```

At lines 202-211, replace all `ANOMALY_CONFIG[...]` with `_thresholds.get(...)`:

```python
    df['Is_Pumping_7d'] = (df['Price_Change_7d'] > _thresholds.get('price_surge_7d_threshold', 0.25)).astype(int)
    df['Is_Dumping_7d'] = (df['Price_Change_7d'] < -_thresholds.get('price_surge_7d_threshold', 0.25)).astype(int)
    # ... same pattern for volume_surge_moderate, volume_surge_extreme
```

Then, after line 194 (where `Price_Change_7d` is computed), add:

```python
    # 3-day window features (early pump detection)
    df['Price_Change_3d'] = df['Close'].pct_change(periods=3)

    # 3-day volume surge vs 30-day average
    vol_avg_3d = df['Volume'].rolling(window=3, min_periods=1).mean()
    vol_avg_30d = df['Volume'].rolling(window=long_window, min_periods=5).mean()
    df['Volume_Surge_3d'] = vol_avg_3d / vol_avg_30d.replace(0, np.nan)
    df['Volume_Surge_3d'] = df['Volume_Surge_3d'].fillna(1.0)

    # Price acceleration: 3 consecutive days of increasing daily returns
    daily_returns = df['Close'].pct_change()
    df['Price_Acceleration'] = (
        (daily_returns > daily_returns.shift(1)) &
        (daily_returns.shift(1) > daily_returns.shift(2)) &
        (daily_returns > 0)  # must be positive returns
    ).astype(int)

    # Volume acceleration: 3+ consecutive days of increasing volume
    vol_increasing = df['Volume'] > df['Volume'].shift(1)
    df['Volume_Acceleration'] = (
        vol_increasing &
        vol_increasing.shift(1) &
        vol_increasing.shift(2)
    ).astype(int)
```

Also add `import numpy as np` to the imports if not already present (check line 1-15).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python_ai && python -m pytest tests/test_threshold_tuning.py -v`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add python_ai/feature_engineering.py python_ai/tests/test_threshold_tuning.py
git commit -m "feat: add 3-day price/volume features and acceleration detection"
```

---

### Task 4: Thread Thresholds Through Anomaly Detection

**Files:**

- Modify: `python_ai/anomaly_detection.py`

- [ ] **Step 1: Update detect_zscore_anomalies() to accept thresholds parameter**

In `python_ai/anomaly_detection.py`, modify the function signature at line 30 to:

```python
def detect_zscore_anomalies(df, z_threshold=None, volume_z_threshold=None, thresholds=None):
```

Replace lines 46-47 with:

```python
    _thresholds = thresholds or ANOMALY_CONFIG
    z_threshold = z_threshold or _thresholds.get('z_score_threshold', 2.5)
    volume_z_threshold = volume_z_threshold or _thresholds.get('volume_z_threshold', 2.0)
```

- [ ] **Step 2: Update detect_surge_anomalies() to accept thresholds parameter**

Modify the function signature at line 149 to:

```python
def detect_surge_anomalies(df, price_surge_threshold=None, volume_surge_threshold=None, thresholds=None):
```

Replace lines 165-166 with:

```python
    _thresholds = thresholds or ANOMALY_CONFIG
    price_threshold = price_surge_threshold or _thresholds.get('price_surge_7d_threshold', 0.25)
    volume_threshold = volume_surge_threshold or _thresholds.get('volume_surge_moderate', 3.0)
```

Also update the other ANOMALY_CONFIG references at lines 177, 186, 191 to use `_thresholds`:

```python
    # Line 177: replace ANOMALY_CONFIG with _thresholds
    # Line 186: replace ANOMALY_CONFIG with _thresholds
    # Line 191: replace ANOMALY_CONFIG with _thresholds
```

- [ ] **Step 3: Update detect_pattern_anomalies() to accept thresholds parameter**

Modify the function signature at line 218 to accept `thresholds=None`:

```python
def detect_pattern_anomalies(df, lookback=14, thresholds=None):
```

Replace lines 259-260 with (keeping original variable names `pump_rise_threshold`/`pump_fall_threshold` to avoid breaking downstream references at line 261+):

```python
    _thresholds = thresholds or ANOMALY_CONFIG
    pump_rise_threshold = _thresholds.get('pump_dump_rise', 0.20)
    pump_fall_threshold = _thresholds.get('pump_dump_fall', -0.15)
```

- [ ] **Step 4: Update detect_anomalies() to accept and pass thresholds**

Modify the function signature at line 291 to:

```python
def detect_anomalies(df, news_flag=False, sensitivity=1.0, thresholds=None):
```

Inside the function body, pass `thresholds=thresholds` to each sub-detector call:

```python
    zscore_result = detect_zscore_anomalies(df, thresholds=thresholds)
    volatility_result = detect_volatility_anomalies(df)  # no thresholds needed
    surge_result = detect_surge_anomalies(df, thresholds=thresholds)
    pattern_result = detect_pattern_anomalies(df, thresholds=thresholds)
```

- [ ] **Step 5: Run existing tests to verify no regressions**

Run: `cd python_ai && python -m pytest tests/ -v`
Expected: All existing tests still PASS (default `thresholds=None` falls back to `ANOMALY_CONFIG`)

- [ ] **Step 6: Commit**

```bash
git add python_ai/anomaly_detection.py
git commit -m "refactor: thread thresholds parameter through anomaly detection"
```

---

### Task 5: Add New Signals to Python Pipeline

**Files:**

- Modify: `python_ai/pipeline.py`

- [ ] **Step 1: Add threshold tier determination to analyze()**

In `python_ai/pipeline.py`, in the `analyze()` method (line 585), after fundamentals are loaded (around line 640-650 where `sec_flagged` is determined), add:

```python
        # Determine threshold tier based on stock characteristics
        is_otc = fundamentals.get('exchange', '').upper() in OTC_EXCHANGES
        on_watchlist = fundamentals.get('on_watchlist', False)
        thresholds = get_thresholds(is_otc=is_otc, on_watchlist=on_watchlist)
```

Add import at top of file: `from config import get_thresholds, OTC_EXCHANGES`

- [ ] **Step 2: Pass thresholds to anomaly detection call**

In `analyze()`, find the `detect_anomalies()` call and add the thresholds parameter:

```python
        anomaly_result = detect_anomalies(price_data, news_flag=news_flag, thresholds=thresholds)
```

- [ ] **Step 3: Add 4 new signal blocks to compute_signals()**

In `python_ai/pipeline.py`, inside `compute_signals()`, after the existing PATTERN signals section (before the ALERT_LIST_HIT block at line ~372), add:

```python
        # --- 3-DAY EARLY DETECTION SIGNALS ---
        # Use feat dict built earlier via: feat = dict(zip(feature_names, features))
        price_change_3d = feat.get('Price_Change_3d', 0)
        volume_surge_3d = feat.get('Volume_Surge_3d', 1.0)
        price_accel = feat.get('Price_Acceleration', 0)
        volume_accel = feat.get('Volume_Acceleration', 0)

        # Use thresholds from fundamentals context (passed through)
        _thresholds = fundamentals.get('_thresholds', ANOMALY_CONFIG)
        surge_3d_thresh = _thresholds.get('price_surge_3d_threshold', 0.15)
        vol_3d_thresh = _thresholds.get('volume_surge_3d', 3.0)

        if abs(price_change_3d) >= surge_3d_thresh:
            weight = 3 if abs(price_change_3d) >= surge_3d_thresh * 2.5 else 2
            signals.append(SignalDetail(
                code='SPIKE_3D',
                category='PATTERN',
                description=f'Price moved {price_change_3d*100:.1f}% in 3 days',
                weight=weight,
            ))

        if volume_surge_3d >= vol_3d_thresh:
            signals.append(SignalDetail(
                code='VOLUME_SURGE_3D',
                category='PATTERN',
                description=f'3-day volume {volume_surge_3d:.1f}x above 30-day average',
                weight=2,
            ))

        if price_accel:
            signals.append(SignalDetail(
                code='PRICE_ACCELERATION',
                category='PATTERN',
                description='Price gains accelerating over 3 consecutive days',
                weight=2,
            ))

        if volume_accel:
            signals.append(SignalDetail(
                code='VOLUME_ACCELERATION',
                category='PATTERN',
                description='Volume increasing for 3+ consecutive days',
                weight=2,
            ))
```

- [ ] **Step 4: Pass thresholds through fundamentals dict**

In `analyze()`, before the `compute_signals()` call, inject thresholds into fundamentals:

```python
        fundamentals['_thresholds'] = thresholds
```

This avoids changing `compute_signals()`'s parameter list, passing thresholds through the existing `fundamentals` dict.

- [ ] **Step 5: Run full test suite**

Run: `cd python_ai && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add python_ai/pipeline.py
git commit -m "feat: add SPIKE_3D, VOLUME_SURGE_3D, PRICE_ACCELERATION, VOLUME_ACCELERATION signals with OTC-tiered thresholds"
```

---

### Task 6: Add TypeScript Type Updates

**Files:**

- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add SOCIAL to SignalCategory**

In `src/lib/types.ts` at line 7, change:

```typescript
export type SignalCategory = "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL";
```

to:

```typescript
export type SignalCategory =
  | "STRUCTURAL"
  | "PATTERN"
  | "ALERT"
  | "BEHAVIORAL"
  | "SOCIAL";
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add SOCIAL signal category to TypeScript types"
```

---

### Task 7: Add OTC-Tiered Thresholds to TypeScript Scoring

**Files:**

- Modify: `src/lib/scoring.ts`

- [ ] **Step 1: Add threshold tiers after existing THRESHOLDS constant**

In `src/lib/scoring.ts`, after the `THRESHOLDS` constant (after line 65), add:

```typescript
// OTC-tiered threshold system
const OTC_THRESHOLDS = {
  spike7dMedium: 10, // 10% (was 25%)
  spike7dHigh: 25, // 25% (was 50%)
  spike3dMedium: 8, // 8% in 3 days
  spike3dHigh: 20, // 20% in 3 days
  volumeExplosionMedium: 2, // 2x (was 3x)
  volumeExplosionHigh: 4, // 4x (was 5x)
  volumeSurge3d: 2, // 2x in 3 days
  smallMarketCap: 300_000_000,
  microLiquidity: 150_000,
};

const MAJOR_THRESHOLDS = {
  ...THRESHOLDS,
  spike3dMedium: 15,
  spike3dHigh: 35,
  volumeSurge3d: 3,
};

const WATCHLIST_THRESHOLDS_TS = {
  spike7dMedium: 5,
  spike7dHigh: 15,
  spike3dMedium: 4,
  spike3dHigh: 12,
  volumeExplosionMedium: 1.5,
  volumeExplosionHigh: 3,
  volumeSurge3d: 1.5,
  smallMarketCap: 300_000_000,
  microLiquidity: 150_000,
};

function getThresholds(isOTC: boolean, onWatchlist: boolean = false) {
  if (onWatchlist) return WATCHLIST_THRESHOLDS_TS;
  if (isOTC) return OTC_THRESHOLDS;
  return MAJOR_THRESHOLDS;
}
```

- [ ] **Step 2: Update getPatternSignals() to use tiered thresholds and add new signals**

In `src/lib/scoring.ts`, in `getPatternSignals()` (line 210), add `isOTC` and `onWatchlist` extraction from market data, then replace hardcoded threshold references with `getThresholds()`:

At the start of the function, add:

```typescript
const isOTC = marketData.isOTC || false;
const t = getThresholds(isOTC, (marketData as any).onWatchlist || false);
```

Replace the spike/volume threshold checks to use `t.spike7dMedium`, `t.spike7dHigh`, `t.volumeExplosionMedium`, `t.volumeExplosionHigh` instead of the old `THRESHOLDS.*` values.

After the existing pattern signals, add:

```typescript
// 3-day early detection signals
if (marketData.priceHistory && marketData.priceHistory.length >= 4) {
  const prices = marketData.priceHistory;
  const recent = prices[prices.length - 1];
  const threeDaysAgo = prices[prices.length - 4];
  if (recent && threeDaysAgo && threeDaysAgo.close > 0) {
    const change3d =
      ((recent.close - threeDaysAgo.close) / threeDaysAgo.close) * 100;
    if (Math.abs(change3d) >= t.spike3dHigh) {
      signals.push({
        code: "SPIKE_3D",
        category: "PATTERN",
        description: `Price moved ${change3d.toFixed(1)}% in 3 days`,
        weight: 3,
      });
    } else if (Math.abs(change3d) >= t.spike3dMedium) {
      signals.push({
        code: "SPIKE_3D",
        category: "PATTERN",
        description: `Price moved ${change3d.toFixed(1)}% in 3 days`,
        weight: 2,
      });
    }
  }

  // Volume surge 3-day: compare last 3 days avg volume to 30-day avg
  if (prices.length >= 30) {
    const vol3d = prices.slice(-3).reduce((s, p) => s + (p.volume || 0), 0) / 3;
    const vol30d =
      prices.slice(-30).reduce((s, p) => s + (p.volume || 0), 0) / 30;
    if (vol30d > 0) {
      const volRatio3d = vol3d / vol30d;
      if (volRatio3d >= t.volumeSurge3d) {
        signals.push({
          code: "VOLUME_SURGE_3D",
          category: "PATTERN",
          description: `3-day volume ${volRatio3d.toFixed(1)}x above 30-day average`,
          weight: 2,
        });
      }
    }
  }

  // Price acceleration: 3 consecutive days of increasing gains
  if (prices.length >= 4) {
    const returns = prices
      .slice(-4)
      .map((p, i, arr) =>
        i > 0 ? (p.close - arr[i - 1].close) / arr[i - 1].close : 0,
      )
      .slice(1);
    if (returns[2] > returns[1] && returns[1] > returns[0] && returns[2] > 0) {
      signals.push({
        code: "PRICE_ACCELERATION",
        category: "PATTERN",
        description: "Price gains accelerating over 3 consecutive days",
        weight: 2,
      });
    }
  }

  // Volume acceleration: 3+ consecutive days of increasing volume
  if (prices.length >= 4) {
    const vols = prices.slice(-4).map((p) => p.volume || 0);
    if (vols[3] > vols[2] && vols[2] > vols[1] && vols[1] > vols[0]) {
      signals.push({
        code: "VOLUME_ACCELERATION",
        category: "PATTERN",
        description: "Volume increasing for 3+ consecutive days",
        weight: 2,
      });
    }
  }
}
```

- [ ] **Step 3: Update getSignalsByCategory() to include SOCIAL**

In `src/lib/scoring.ts`, in `getSignalsByCategory()` (line 536-548), update both the return type annotation AND the return object:

```typescript
export function getSignalsByCategory(signals: RiskSignal[]): {
  structural: RiskSignal[];
  pattern: RiskSignal[];
  alert: RiskSignal[];
  behavioral: RiskSignal[];
  social: RiskSignal[];
} {
  return {
    structural: signals.filter((s) => s.category === "STRUCTURAL"),
    pattern: signals.filter((s) => s.category === "PATTERN"),
    alert: signals.filter((s) => s.category === "ALERT"),
    behavioral: signals.filter((s) => s.category === "BEHAVIORAL"),
    social: signals.filter((s) => s.category === "SOCIAL"),
  };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/elimizroch/ai_projects/scam-dunk-re-write-claude-code && npx tsc --noEmit --skipLibCheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.ts
git commit -m "feat: add OTC-tiered thresholds and 3-day signals to TypeScript scoring"
```

---

### Task 8: Mirror Changes in Standalone Scorer

**Files:**

- Modify: `evaluation/scripts/standalone-scorer.ts`

- [ ] **Step 1: Add SOCIAL to local RiskSignal type**

In `evaluation/scripts/standalone-scorer.ts` at line 38, update the `category` field in the local `RiskSignal` interface to include `'SOCIAL'`:

```typescript
category: "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL" | "SOCIAL";
```

- [ ] **Step 2: Add OTC-tiered thresholds and new signals**

After the existing `THRESHOLDS` constant (line 63-72), add the same tier dicts and `getThresholds` function as in `scoring.ts`.

In `checkPatternSignals()` (line 221), add the same 3-day detection logic: `SPIKE_3D`, `PRICE_ACCELERATION`. Use tiered thresholds.

- [ ] **Step 3: Add new signal codes to SIGNAL_CODES**

In the `SIGNAL_CODES` set (line 51-61), add: `'SPIKE_3D'`, `'VOLUME_SURGE_3D'`, `'PRICE_ACCELERATION'`, `'VOLUME_ACCELERATION'`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/elimizroch/ai_projects/scam-dunk-re-write-claude-code && npx tsc --noEmit --skipLibCheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add evaluation/scripts/standalone-scorer.ts
git commit -m "feat: mirror OTC-tiered thresholds and new signals in standalone scorer"
```

---

## Option 2: Pre-Pump Structural Signals

### Task 9: Create Pre-Pump Signals Module — EDGAR Filing Monitor

**Files:**

- Create: `python_ai/pre_pump_signals.py`
- Create: `python_ai/tests/test_pre_pump_signals.py`

- [ ] **Step 1: Write failing tests for EDGAR filing analysis**

Create `python_ai/tests/test_pre_pump_signals.py`:

```python
import pytest
from pre_pump_signals import (
    analyze_filing_patterns,
    analyze_insider_behavior,
    PrePumpSignal,
)


@pytest.fixture
def dormant_then_active_filings():
    """Company with no filings for 8 months, then 4 filings in 2 weeks."""
    return {
        'ticker': 'SCAM',
        'cik': '0001234567',
        'filings': [
            {'type': '8-K', 'date': '2026-03-20', 'title': 'Change of Control'},
            {'type': '8-K', 'date': '2026-03-18', 'title': 'Reverse Merger Agreement'},
            {'type': '10-K', 'date': '2026-03-15', 'title': 'Annual Report'},
            {'type': '8-K', 'date': '2026-03-10', 'title': 'Name Change'},
        ],
        'last_filing_before_gap': '2025-07-01',  # 8 months ago
    }


@pytest.fixture
def normal_filings():
    """Company with regular quarterly filings."""
    return {
        'ticker': 'GOOD',
        'cik': '0009876543',
        'filings': [
            {'type': '10-Q', 'date': '2026-03-15', 'title': 'Quarterly Report'},
            {'type': '10-Q', 'date': '2025-12-15', 'title': 'Quarterly Report'},
            {'type': '10-Q', 'date': '2025-09-15', 'title': 'Quarterly Report'},
            {'type': '10-K', 'date': '2025-06-15', 'title': 'Annual Report'},
        ],
        'last_filing_before_gap': None,
    }


def test_shell_reactivation_detected(dormant_then_active_filings):
    signals = analyze_filing_patterns(dormant_then_active_filings)
    codes = [s.code for s in signals]
    assert 'SHELL_REACTIVATION' in codes


def test_reverse_merger_detected(dormant_then_active_filings):
    signals = analyze_filing_patterns(dormant_then_active_filings)
    codes = [s.code for s in signals]
    assert 'REVERSE_MERGER_OTC' in codes


def test_filing_burst_detected(dormant_then_active_filings):
    signals = analyze_filing_patterns(dormant_then_active_filings)
    codes = [s.code for s in signals]
    assert 'SUSPICIOUS_FILING_BURST' in codes


def test_normal_filings_no_signals(normal_filings):
    signals = analyze_filing_patterns(normal_filings)
    assert len(signals) == 0


def test_insider_selling_during_pump():
    insider_data = {
        'form4_filings': [],  # no insider buying
        'form144_filings': [
            {'date': '2026-03-15', 'shares': 500000, 'insider': 'CEO'},
        ],
        'price_change_90d': 0.35,  # stock up 35%
    }
    signals = analyze_insider_behavior(insider_data)
    codes = [s.code for s in signals]
    assert 'INSIDER_SELLING_SETUP' in codes


def test_no_insider_buying_on_rising_stock():
    insider_data = {
        'form4_filings': [],
        'form144_filings': [],
        'price_change_90d': 0.25,
    }
    signals = analyze_insider_behavior(insider_data)
    codes = [s.code for s in signals]
    assert 'NO_INSIDER_BUYING' in codes
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_pre_pump_signals.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pre_pump_signals'`

- [ ] **Step 3: Implement pre_pump_signals.py**

Create `python_ai/pre_pump_signals.py`:

```python
"""Pre-pump structural signal detection.

Monitors SEC EDGAR filings, insider transactions, and FINRA short interest
for manipulation setup indicators that appear weeks before a pump.
"""
import logging
import requests
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import time

logger = logging.getLogger(__name__)

SEC_EDGAR_HEADERS = {
    'User-Agent': 'ScamDunk Research Tool support@scamdunk.com',
    'Accept': 'application/json',
}

REVERSE_MERGER_KEYWORDS = [
    'reverse merger', 'change of control', 'reverse stock split',
    'share exchange agreement', 'business combination',
]

SHELL_KEYWORDS = [
    'shell company', 'blank check', 'going concern',
    'no operations', 'nominal operations',
]

NAME_CHANGE_KEYWORDS = [
    'name change', 'formerly known as', 'change of name',
    'amended and restated',
]


@dataclass
class PrePumpSignal:
    code: str
    category: str
    description: str
    weight: int


def analyze_filing_patterns(filing_data: Dict) -> List[PrePumpSignal]:
    """Analyze SEC filing patterns for pre-pump structural signals.

    Args:
        filing_data: Dict with keys:
            - ticker: str
            - cik: str
            - filings: List[Dict] with type, date, title
            - last_filing_before_gap: Optional[str] ISO date of last filing before dormancy

    Returns:
        List of PrePumpSignal objects
    """
    signals = []
    filings = filing_data.get('filings', [])
    last_before_gap = filing_data.get('last_filing_before_gap')

    if not filings:
        return signals

    # Check for dormancy → reactivation (SHELL_REACTIVATION)
    if last_before_gap:
        gap_start = datetime.fromisoformat(last_before_gap)
        earliest_recent = min(
            datetime.fromisoformat(f['date']) for f in filings
        )
        gap_days = (earliest_recent - gap_start).days
        if gap_days >= 180:  # 6+ months dormant
            signals.append(PrePumpSignal(
                code='SHELL_REACTIVATION',
                category='STRUCTURAL',
                description=f'Company dormant for {gap_days} days, then resumed filing',
                weight=3,
            ))

    # Check for reverse merger / change of control keywords
    for filing in filings:
        title_lower = filing.get('title', '').lower()
        if filing.get('type') == '8-K':
            for keyword in REVERSE_MERGER_KEYWORDS:
                if keyword in title_lower:
                    signals.append(PrePumpSignal(
                        code='REVERSE_MERGER_OTC',
                        category='STRUCTURAL',
                        description=f'8-K filing: "{filing["title"]}"',
                        weight=2,
                    ))
                    break  # one signal per filing

    # Check for filing burst (3+ filings in 30 days after dormancy)
    if last_before_gap and len(filings) >= 3:
        recent_dates = sorted(
            datetime.fromisoformat(f['date']) for f in filings
        )
        if len(recent_dates) >= 3:
            span = (recent_dates[-1] - recent_dates[0]).days
            if span <= 30:
                signals.append(PrePumpSignal(
                    code='SUSPICIOUS_FILING_BURST',
                    category='STRUCTURAL',
                    description=f'{len(filings)} filings in {span} days after dormancy',
                    weight=2,
                ))

    # Deduplicate by code
    seen_codes = set()
    deduped = []
    for s in signals:
        if s.code not in seen_codes:
            seen_codes.add(s.code)
            deduped.append(s)

    return deduped


def analyze_insider_behavior(insider_data: Dict) -> List[PrePumpSignal]:
    """Analyze insider filing patterns for pre-dump signals.

    Args:
        insider_data: Dict with keys:
            - form4_filings: List of Form 4 purchase filings
            - form144_filings: List of Form 144 intent-to-sell filings
            - price_change_90d: float, 90-day price change as decimal

    Returns:
        List of PrePumpSignal objects
    """
    signals = []
    form4 = insider_data.get('form4_filings', [])
    form144 = insider_data.get('form144_filings', [])
    price_change = insider_data.get('price_change_90d', 0)

    # Form 144 filed while stock is rising = insider selling setup
    if form144 and price_change > 0.10:
        total_shares = sum(f.get('shares', 0) for f in form144)
        signals.append(PrePumpSignal(
            code='INSIDER_SELLING_SETUP',
            category='STRUCTURAL',
            description=f'Form 144 filed for {total_shares:,} shares while stock up {price_change*100:.0f}%',
            weight=2,
        ))

    # No insider buying despite significant price increase
    purchases = [f for f in form4 if f.get('transaction_type') == 'purchase']
    if not purchases and price_change >= 0.20:
        signals.append(PrePumpSignal(
            code='NO_INSIDER_BUYING',
            category='STRUCTURAL',
            description=f'Zero insider purchases in 90 days despite {price_change*100:.0f}% price increase',
            weight=1,
        ))

    return signals


def fetch_edgar_filings(ticker: str, cik: str = None) -> Dict:
    """Fetch recent SEC filings for a ticker from EDGAR.

    Returns filing_data dict suitable for analyze_filing_patterns().
    """
    try:
        # Step 1: Resolve CIK if not provided
        if not cik:
            cik = _resolve_cik(ticker)
        if not cik:
            return {'ticker': ticker, 'cik': None, 'filings': [], 'last_filing_before_gap': None}

        # Step 2: Fetch submissions from modern EDGAR API
        padded_cik = cik.zfill(10)
        url = f'https://data.sec.gov/submissions/CIK{padded_cik}.json'
        resp = requests.get(url, headers=SEC_EDGAR_HEADERS, timeout=10)

        if resp.status_code != 200:
            logger.warning(f"EDGAR submissions failed for {ticker}: HTTP {resp.status_code}")
            return {'ticker': ticker, 'cik': cik, 'filings': [], 'last_filing_before_gap': None}

        data = resp.json()
        recent = data.get('filings', {}).get('recent', {})

        forms = recent.get('form', [])
        dates = recent.get('filingDate', [])
        descriptions = recent.get('primaryDocDescription', [])

        # Build filing list (last 90 days)
        cutoff = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
        filings = []
        last_before_gap = None

        for i, (form, date, desc) in enumerate(zip(forms, dates, descriptions)):
            if date >= cutoff:
                filings.append({
                    'type': form,
                    'date': date,
                    'title': desc or form,
                })
            elif last_before_gap is None:
                # First filing older than 90 days = check for gap
                last_before_gap = date

        # Check if there's a true dormancy gap
        if last_before_gap and filings:
            gap_start = datetime.fromisoformat(last_before_gap)
            earliest = min(datetime.fromisoformat(f['date']) for f in filings)
            if (earliest - gap_start).days < 180:
                last_before_gap = None  # Not dormant enough

        return {
            'ticker': ticker,
            'cik': cik,
            'filings': filings,
            'last_filing_before_gap': last_before_gap,
        }
    except Exception as e:
        logger.error(f"EDGAR fetch failed for {ticker}: {e}")
        return {'ticker': ticker, 'cik': None, 'filings': [], 'last_filing_before_gap': None}


def fetch_insider_filings(ticker: str, cik: str = None) -> Dict:
    """Fetch Form 4 and Form 144 insider filings from EDGAR.

    Returns insider_data dict suitable for analyze_insider_behavior().
    """
    try:
        if not cik:
            cik = _resolve_cik(ticker)
        if not cik:
            return {'form4_filings': [], 'form144_filings': [], 'price_change_90d': 0}

        padded_cik = cik.zfill(10)
        url = f'https://data.sec.gov/submissions/CIK{padded_cik}.json'
        resp = requests.get(url, headers=SEC_EDGAR_HEADERS, timeout=10)

        if resp.status_code != 200:
            return {'form4_filings': [], 'form144_filings': [], 'price_change_90d': 0}

        data = resp.json()
        recent = data.get('filings', {}).get('recent', {})
        forms = recent.get('form', [])
        dates = recent.get('filingDate', [])

        cutoff = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')

        form4_filings = []
        form144_filings = []

        for form, date in zip(forms, dates):
            if date < cutoff:
                continue
            if form in ('4', '4/A'):
                form4_filings.append({'date': date, 'transaction_type': 'unknown'})
            elif form in ('144', '144/A'):
                form144_filings.append({'date': date, 'shares': 0})

        return {
            'form4_filings': form4_filings,
            'form144_filings': form144_filings,
            'price_change_90d': 0,  # Caller must fill this from price data
        }
    except Exception as e:
        logger.error(f"Insider filing fetch failed for {ticker}: {e}")
        return {'form4_filings': [], 'form144_filings': [], 'price_change_90d': 0}


def _resolve_cik(ticker: str) -> Optional[str]:
    """Resolve ticker to CIK number via SEC company tickers JSON."""
    try:
        url = 'https://www.sec.gov/files/company_tickers.json'
        resp = requests.get(url, headers=SEC_EDGAR_HEADERS, timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()
        ticker_upper = ticker.upper()
        for entry in data.values():
            if entry.get('ticker') == ticker_upper:
                return str(entry.get('cik_str', ''))
        return None
    except Exception as e:
        logger.error(f"CIK resolution failed for {ticker}: {e}")
        return None


def scan_pre_pump_signals(
    tickers: List[str],
    fundamentals: Dict[str, Dict],
) -> Dict[str, Dict]:
    """Batch scan tickers for pre-pump structural signals.

    Args:
        tickers: List of ticker symbols to scan
        fundamentals: Dict mapping ticker -> {market_cap, exchange, sector}

    Returns:
        Dict mapping ticker -> {signals: List[dict], watchlist_recommended: bool}
    """
    results = {}

    for ticker in tickers:
        fund = fundamentals.get(ticker, {})
        # Only process small caps on OTC
        if fund.get('market_cap', 0) > 300_000_000:
            continue

        signals = []

        # EDGAR filing analysis
        try:
            filing_data = fetch_edgar_filings(ticker)
            filing_signals = analyze_filing_patterns(filing_data)
            signals.extend(filing_signals)
            time.sleep(0.2)  # Rate limit: 5 req/sec to EDGAR
        except Exception as e:
            logger.error(f"EDGAR scan failed for {ticker}: {e}")

        # Insider filing analysis (only if other signals present or stock is suspicious)
        if signals or fund.get('exchange', '').upper() in ('OTC', 'OTCQX', 'OTCQB', 'PINK', 'GREY'):
            try:
                insider_data = fetch_insider_filings(ticker)
                # Fill price_change_90d from yfinance if available
                try:
                    import yfinance as yf
                    hist = yf.Ticker(ticker).history(period='3mo')
                    if len(hist) >= 2:
                        insider_data['price_change_90d'] = (hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0]
                except Exception:
                    pass  # price_change_90d stays 0, insider signals won't fire
                insider_signals = analyze_insider_behavior(insider_data)
                signals.extend(insider_signals)
                time.sleep(0.2)
            except Exception as e:
                logger.error(f"Insider scan failed for {ticker}: {e}")

        if signals:
            results[ticker] = {
                'signals': [{'code': s.code, 'category': s.category, 'description': s.description, 'weight': s.weight} for s in signals],
                'watchlist_recommended': any(s.weight >= 3 for s in signals),
            }

    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python_ai && python -m pytest tests/test_pre_pump_signals.py -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add python_ai/pre_pump_signals.py python_ai/tests/test_pre_pump_signals.py
git commit -m "feat: add pre-pump structural signals module (SEC EDGAR, insider filings)"
```

---

### Task 10: Add Pre-Pump Scan API Endpoint

**Files:**

- Modify: `python_ai/api_server.py`

- [ ] **Step 1: Add Pydantic models for the endpoint**

In `python_ai/api_server.py`, after the existing `AnalysisResponse` model (after line ~155), add:

```python
class PrePumpScanRequest(BaseModel):
    tickers: List[str] = Field(..., description="List of ticker symbols to scan")
    fundamentals: Dict[str, Dict] = Field(default_factory=dict, description="Ticker -> {market_cap, exchange, sector}")

class PrePumpSignalResponse(BaseModel):
    code: str
    category: str
    description: str
    weight: int

class PrePumpTickerResult(BaseModel):
    signals: List[PrePumpSignalResponse]
    watchlist_recommended: bool

class PrePumpScanResponse(BaseModel):
    results: Dict[str, PrePumpTickerResult]
    tickers_scanned: int
    tickers_with_signals: int
```

Add `from pre_pump_signals import scan_pre_pump_signals` to imports.

- [ ] **Step 2: Add the endpoint**

After the existing endpoints (after line ~422), add:

```python
@app.post("/pre-pump-scan", response_model=PrePumpScanResponse)
async def pre_pump_scan(request: PrePumpScanRequest):
    """Batch scan tickers for pre-pump structural signals (SEC EDGAR, insider filings)."""
    logger.info(f"Pre-pump scan requested for {len(request.tickers)} tickers")

    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(
        None,
        lambda: scan_pre_pump_signals(request.tickers, request.fundamentals)
    )

    return PrePumpScanResponse(
        results=results,
        tickers_scanned=len(request.tickers),
        tickers_with_signals=len(results),
    )
```

- [ ] **Step 3: Verify server starts without errors**

Run: `cd python_ai && python -c "from api_server import app; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add python_ai/api_server.py
git commit -m "feat: add POST /pre-pump-scan endpoint to Python AI backend"
```

---

## Option 3: Social Media Early Warning

### Task 11: Create Social Early Warning Module

**Files:**

- Create: `python_ai/social_early_warning.py`
- Create: `python_ai/tests/test_social_early_warning.py`

- [ ] **Step 1: Write failing tests**

Create `python_ai/tests/test_social_early_warning.py`:

```python
import pytest
from social_early_warning import (
    compute_mention_velocity,
    evaluate_watchlist_criteria,
    WatchlistSignal,
)


def test_velocity_spike_detected():
    mention_data = {
        'ticker': 'PUMP',
        'mention_count_24h': 150,
        'mention_baseline_7d': 10,
        'unique_authors': 8,
        'total_mentions': 150,
    }
    velocity = compute_mention_velocity(mention_data)
    assert velocity['mention_velocity'] == 15.0  # 150/10
    assert velocity['unique_authors_ratio'] < 0.1


def test_normal_mentions_low_velocity():
    mention_data = {
        'ticker': 'NORMAL',
        'mention_count_24h': 12,
        'mention_baseline_7d': 10,
        'unique_authors': 10,
        'total_mentions': 12,
    }
    velocity = compute_mention_velocity(mention_data)
    assert velocity['mention_velocity'] < 2.0


def test_watchlist_criteria_high_velocity():
    velocity_data = {
        'ticker': 'PUMP',
        'mention_velocity': 5.0,
        'mention_count_24h': 50,
        'unique_authors_ratio': 0.5,
    }
    result = evaluate_watchlist_criteria(velocity_data)
    assert result['watchlist_recommended'] is True
    signal_codes = [s.code for s in result['signals']]
    assert 'SOCIAL_PROMOTION_DETECTED' in signal_codes


def test_coordinated_bot_activity():
    velocity_data = {
        'ticker': 'BOT',
        'mention_velocity': 8.0,
        'mention_count_24h': 80,
        'unique_authors_ratio': 0.15,  # very few unique authors
    }
    result = evaluate_watchlist_criteria(velocity_data)
    signal_codes = [s.code for s in result['signals']]
    assert 'COORDINATED_BOT_ACTIVITY' in signal_codes


def test_low_count_no_bot_signal():
    """Require minimum 10 mentions to avoid false positives on low-activity stocks."""
    velocity_data = {
        'ticker': 'LOW',
        'mention_velocity': 6.0,
        'mention_count_24h': 6,  # too few
        'unique_authors_ratio': 0.2,
    }
    result = evaluate_watchlist_criteria(velocity_data)
    signal_codes = [s.code for s in result['signals']]
    assert 'COORDINATED_BOT_ACTIVITY' not in signal_codes


def test_below_threshold_no_watchlist():
    velocity_data = {
        'ticker': 'QUIET',
        'mention_velocity': 1.5,
        'mention_count_24h': 15,
        'unique_authors_ratio': 0.8,
    }
    result = evaluate_watchlist_criteria(velocity_data)
    assert result['watchlist_recommended'] is False
    assert len(result['signals']) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_social_early_warning.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement social_early_warning.py**

Create `python_ai/social_early_warning.py`:

```python
"""Social media early warning system.

Monitors mention velocity across Reddit (via ApeWisdom) and StockTwits
to build a pre-pump watchlist of stocks being promoted before price movement.
"""
import logging
import requests
import time
from dataclasses import dataclass
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

APEWISDOM_URL = 'https://apewisdom.io/api/v1.0/filter/all-stocks/'
STOCKTWITS_URL = 'https://api.stocktwits.com/api/2/streams/symbol'

STOCKTWITS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; ScamDunkBot/1.0)',
}


@dataclass
class WatchlistSignal:
    code: str
    category: str
    description: str
    weight: int


def compute_mention_velocity(mention_data: Dict) -> Dict:
    """Compute mention velocity metrics from raw mention counts.

    Args:
        mention_data: Dict with mention_count_24h, mention_baseline_7d,
                      unique_authors, total_mentions

    Returns:
        Dict with mention_velocity, unique_authors_ratio, mention_acceleration
    """
    count_24h = mention_data.get('mention_count_24h', 0)
    baseline = max(mention_data.get('mention_baseline_7d', 1), 1)  # avoid div by zero
    unique = mention_data.get('unique_authors', 0)
    total = max(mention_data.get('total_mentions', 1), 1)

    return {
        'ticker': mention_data.get('ticker', ''),
        'mention_velocity': count_24h / baseline,
        'mention_count_24h': count_24h,
        'unique_authors_ratio': unique / total,
    }


def evaluate_watchlist_criteria(velocity_data: Dict) -> Dict:
    """Evaluate whether a stock should be added to the pre-pump watchlist.

    Args:
        velocity_data: Dict with mention_velocity, mention_count_24h, unique_authors_ratio

    Returns:
        Dict with watchlist_recommended (bool) and signals (List[WatchlistSignal])
    """
    signals = []
    velocity = velocity_data.get('mention_velocity', 0)
    count = velocity_data.get('mention_count_24h', 0)
    author_ratio = velocity_data.get('unique_authors_ratio', 1.0)
    ticker = velocity_data.get('ticker', '')

    # SOCIAL_PROMOTION_DETECTED: velocity >= 3x baseline
    if velocity >= 3.0:
        signals.append(WatchlistSignal(
            code='SOCIAL_PROMOTION_DETECTED',
            category='SOCIAL',
            description=f'{ticker}: mention velocity {velocity:.1f}x baseline ({count} mentions in 24h)',
            weight=3,
        ))

    # MENTION_VELOCITY_SPIKE: velocity >= 5x baseline
    if velocity >= 5.0:
        signals.append(WatchlistSignal(
            code='MENTION_VELOCITY_SPIKE',
            category='SOCIAL',
            description=f'{ticker}: extreme mention velocity {velocity:.1f}x baseline',
            weight=2,
        ))

    # COORDINATED_BOT_ACTIVITY: velocity >= 5x AND low author ratio AND min count
    if velocity >= 5.0 and author_ratio < 0.3 and count >= 10:
        signals.append(WatchlistSignal(
            code='COORDINATED_BOT_ACTIVITY',
            category='SOCIAL',
            description=f'{ticker}: suspected coordinated promotion — {author_ratio:.0%} unique authors, {velocity:.1f}x velocity',
            weight=3,
        ))

    watchlist_recommended = len(signals) > 0

    return {
        'watchlist_recommended': watchlist_recommended,
        'signals': signals,
    }


def fetch_apewisdom_mentions() -> Dict[str, Dict]:
    """Fetch current Reddit mention counts from ApeWisdom.

    Returns dict mapping ticker -> {mentions_24h, upvotes, rank}.
    """
    try:
        resp = requests.get(APEWISDOM_URL, timeout=15)
        if resp.status_code != 200:
            logger.warning(f"ApeWisdom API returned {resp.status_code}")
            return {}

        data = resp.json()
        results = data.get('results', [])

        mentions = {}
        for item in results:
            ticker = item.get('ticker', '').upper()
            if ticker:
                mentions[ticker] = {
                    'mentions_24h': item.get('mentions', 0),
                    'upvotes': item.get('upvotes', 0),
                    'rank': item.get('rank', 0),
                }

        return mentions
    except Exception as e:
        logger.error(f"ApeWisdom fetch failed: {e}")
        return {}


def fetch_stocktwits_volume(ticker: str) -> Dict:
    """Fetch recent StockTwits message volume for a ticker.

    Returns dict with message_count, unique_authors, avg_sentiment.
    """
    try:
        url = f"{STOCKTWITS_URL}/{ticker}.json"
        resp = requests.get(url, headers=STOCKTWITS_HEADERS, timeout=10)

        # Check for Cloudflare block
        if resp.status_code != 200 or resp.text.startswith('<'):
            return {'message_count': 0, 'unique_authors': 0, 'avg_sentiment': 'neutral'}

        data = resp.json()
        messages = data.get('messages', [])

        authors = set()
        bullish = 0
        for msg in messages:
            user = msg.get('user', {})
            authors.add(user.get('id', 0))
            sentiment = msg.get('entities', {}).get('sentiment', {}).get('basic')
            if sentiment == 'Bullish':
                bullish += 1

        total = len(messages)
        return {
            'message_count': total,
            'unique_authors': len(authors),
            'avg_sentiment': 'bullish' if bullish > total * 0.7 else 'neutral',
        }
    except Exception as e:
        logger.error(f"StockTwits fetch failed for {ticker}: {e}")
        return {'message_count': 0, 'unique_authors': 0, 'avg_sentiment': 'neutral'}


def scan_social_early_warning(
    tickers: List[str],
    mention_baselines: Optional[Dict[str, float]] = None,
) -> Dict[str, Dict]:
    """Scan tickers for social media early warning signals.

    Args:
        tickers: List of OTC/penny stock tickers to monitor
        mention_baselines: Optional dict of ticker -> 7-day avg daily mentions

    Returns:
        Dict mapping ticker -> {mention_velocity, signals, watchlist_recommended}
    """
    baselines = mention_baselines or {}
    results = {}

    # Step 1: Bulk fetch Reddit mentions from ApeWisdom
    ape_data = fetch_apewisdom_mentions()

    # Step 2: For tickers with elevated Reddit mentions, check StockTwits too
    for ticker in tickers:
        ape = ape_data.get(ticker, {})
        reddit_count = ape.get('mentions_24h', 0)
        baseline = baselines.get(ticker, 1)

        # Quick velocity check — only dig deeper if Reddit shows activity
        if reddit_count < 3 and baseline < 2:
            continue

        # Fetch StockTwits for additional signal
        st_data = fetch_stocktwits_volume(ticker)
        time.sleep(2)  # StockTwits rate limit

        total_mentions = reddit_count + st_data.get('message_count', 0)
        total_unique = st_data.get('unique_authors', 0) + min(reddit_count, 20)  # estimate

        mention_data = {
            'ticker': ticker,
            'mention_count_24h': total_mentions,
            'mention_baseline_7d': baseline,
            'unique_authors': total_unique,
            'total_mentions': max(total_mentions, 1),
        }

        velocity = compute_mention_velocity(mention_data)
        watchlist_result = evaluate_watchlist_criteria(velocity)

        if watchlist_result['watchlist_recommended']:
            results[ticker] = {
                'mention_velocity': velocity['mention_velocity'],
                'mention_count_24h': total_mentions,
                'unique_authors_ratio': velocity['unique_authors_ratio'],
                'signals': [
                    {'code': s.code, 'category': s.category, 'description': s.description, 'weight': s.weight}
                    for s in watchlist_result['signals']
                ],
                'watchlist_recommended': True,
            }

    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python_ai && python -m pytest tests/test_social_early_warning.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add python_ai/social_early_warning.py python_ai/tests/test_social_early_warning.py
git commit -m "feat: add social media early warning module (ApeWisdom + StockTwits)"
```

---

### Task 12: Add Social Early Warning API Endpoint

**Files:**

- Modify: `python_ai/api_server.py`

- [ ] **Step 1: Add Pydantic models and endpoint**

In `python_ai/api_server.py`, add:

```python
from social_early_warning import scan_social_early_warning

class SocialEarlyWarningRequest(BaseModel):
    tickers: List[str] = Field(..., description="OTC/penny stock tickers to scan")
    mention_baselines: Dict[str, float] = Field(default_factory=dict, description="Ticker -> 7-day avg daily mentions")

class SocialWatchlistEntry(BaseModel):
    mention_velocity: float
    mention_count_24h: int
    unique_authors_ratio: float
    signals: List[Dict]
    watchlist_recommended: bool

class SocialEarlyWarningResponse(BaseModel):
    watchlist: Dict[str, SocialWatchlistEntry]
    tickers_scanned: int
    tickers_flagged: int

@app.post("/social-early-warning", response_model=SocialEarlyWarningResponse)
async def social_early_warning(request: SocialEarlyWarningRequest):
    """Scan tickers for social media promotion signals to build pre-pump watchlist."""
    logger.info(f"Social early warning scan for {len(request.tickers)} tickers")

    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(
        None,
        lambda: scan_social_early_warning(request.tickers, request.mention_baselines)
    )

    return SocialEarlyWarningResponse(
        watchlist=results,
        tickers_scanned=len(request.tickers),
        tickers_flagged=len(results),
    )
```

- [ ] **Step 2: Verify server imports work**

Run: `cd python_ai && python -c "from api_server import app; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add python_ai/api_server.py
git commit -m "feat: add POST /social-early-warning endpoint"
```

---

### Task 13: Add Prisma Schema for Watchlist

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add PrePumpWatchlist model**

In `prisma/schema.prisma`, after the last model (after line 1055), add:

```prisma
model PrePumpWatchlist {
  id                  String    @id @default(uuid())
  ticker              String
  addedDate           DateTime  @default(now())
  source              String    // 'social_velocity', 'edgar_filing', 'short_interest'
  mentionVelocity     Float?
  mentionCount24h     Int?
  uniqueAuthorsRatio  Float?
  signals             Json?     // array of signal objects that triggered watchlist addition
  isActive            Boolean   @default(true)
  deactivatedDate     DateTime?
  deactivationReason  String?   // 'no_activity_7d', 'confirmed_legitimate', 'scheme_tracked'
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@index([isActive, ticker])
  @@index([addedDate])
  @@map("pre_pump_watchlist")
}
```

- [ ] **Step 2: Generate Prisma client**

Run: `cd /Users/elimizroch/ai_projects/scam-dunk-re-write-claude-code && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 3: Create migration**

Run: `cd /Users/elimizroch/ai_projects/scam-dunk-re-write-claude-code && npx prisma migrate dev --name add_pre_pump_watchlist`
Expected: Migration created and applied

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add PrePumpWatchlist model for early pump detection"
```

---

### Task 14: Integrate Phase 0 into Daily Pipeline

**Files:**

- Modify: `evaluation/scripts/enhanced-daily-pipeline.ts`

This is the largest single change. Adds Phase 0 (social early warning) before Phase 1 and integrates pre-pump signals into Phase 1.

- [ ] **Step 1: Update ScanStatus interface**

In `evaluation/scripts/enhanced-daily-pipeline.ts`, in the `ScanStatus` interface area (around line 945-963), add `phase0_socialEarlyWarning` to the phases object:

```typescript
phase0_socialEarlyWarning: {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  details?: {
    tickersScanned: number;
    watchlistAdded: number;
    existingWatchlist: number;
  };
};
```

Also initialize it in `createInitialScanStatus()` (around line 1000).

- [ ] **Step 2: Add Phase 0 before Phase 1**

Before Phase 1 (before line 1161), add Phase 0:

```typescript
// ============================================================
// PHASE 0: Social Early Warning + Pre-Pump Structural Signals
// ============================================================
console.log("\n📡 Phase 0: Social Early Warning & Pre-Pump Scan...");
scanStatus.phases.phase0_socialEarlyWarning.status = "running";
scanStatus.phases.phase0_socialEarlyWarning.startedAt =
  new Date().toISOString();

const watchlistTickers = new Set<string>();

// Call Python backend social early warning
if (AI_BACKEND_URL) {
  try {
    const otcTickers = stocks
      .filter((s) => {
        const exchange = (s.exchange || "").toUpperCase();
        return (
          ["OTC", "OTCQX", "OTCQB", "PINK", "GREY"].includes(exchange) ||
          (s.marketCap && s.marketCap < 300_000_000)
        );
      })
      .map((s) => s.symbol);

    console.log(
      `  Scanning ${otcTickers.length} OTC/penny tickers for social signals...`,
    );

    const socialResp = await fetch(`${AI_BACKEND_URL}/social-early-warning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": AI_API_SECRET || "",
      },
      body: JSON.stringify({ tickers: otcTickers.slice(0, 500) }),
    });

    if (socialResp.ok) {
      const socialData = await socialResp.json();
      for (const [ticker, data] of Object.entries(socialData.watchlist || {})) {
        watchlistTickers.add(ticker);
      }
      console.log(
        `  Social early warning: ${watchlistTickers.size} tickers flagged`,
      );
    }

    // Pre-pump structural scan
    const fundamentalsMap: Record<string, any> = {};
    for (const s of stocks.filter((s) => otcTickers.includes(s.symbol))) {
      fundamentalsMap[s.symbol] = {
        market_cap: s.marketCap,
        exchange: s.exchange,
        sector: s.sector,
      };
    }

    const prePumpResp = await fetch(`${AI_BACKEND_URL}/pre-pump-scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": AI_API_SECRET || "",
      },
      body: JSON.stringify({
        tickers: otcTickers.slice(0, 200),
        fundamentals: fundamentalsMap,
      }),
    });

    if (prePumpResp.ok) {
      const prePumpData = await prePumpResp.json();
      for (const [ticker, data] of Object.entries(prePumpData.results || {})) {
        if ((data as any).watchlist_recommended) {
          watchlistTickers.add(ticker);
        }
      }
      console.log(
        `  Pre-pump scan: ${Object.keys(prePumpData.results || {}).length} tickers with structural signals`,
      );
    }
  } catch (error) {
    console.error("  Phase 0 error (non-fatal, continuing):", error);
  }
}

scanStatus.phases.phase0_socialEarlyWarning.status = "completed";
scanStatus.phases.phase0_socialEarlyWarning.completedAt =
  new Date().toISOString();
scanStatus.phases.phase0_socialEarlyWarning.details = {
  tickersScanned: 0, // filled from response
  watchlistAdded: watchlistTickers.size,
  existingWatchlist: 0,
};
console.log(
  `  Phase 0 complete: ${watchlistTickers.size} tickers on watchlist\n`,
);
```

- [ ] **Step 3: Pass watchlist context to Phase 1 scoring**

In Phase 1's per-stock scoring loop (around line 1203), before calling the scorer, check if the ticker is on the watchlist:

```typescript
const onWatchlist = watchlistTickers.has(stock.symbol);
// Pass onWatchlist flag to the Python backend if calling it
// For TypeScript fallback scorer: pass as context
```

When calling the Python backend's `/analyze` endpoint for each stock, add `on_watchlist: true` to the fundamentals:

```typescript
if (onWatchlist) {
  // Inject watchlist flag into the fundamentals sent to Python backend
  requestBody.fundamentals = {
    ...(requestBody.fundamentals || {}),
    on_watchlist: true,
  };
}
```

- [ ] **Step 4: Fix SOCIAL category type cast in pipeline signal processing**

In `enhanced-daily-pipeline.ts`, find the signal type cast (around line 1241-1245) where Python backend signals are mapped:

```typescript
category: s.category as "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL",
```

Update to include SOCIAL:

```typescript
category: s.category as "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL" | "SOCIAL",
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/elimizroch/ai_projects/scam-dunk-re-write-claude-code && npx tsc --noEmit --skipLibCheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add evaluation/scripts/enhanced-daily-pipeline.ts
git commit -m "feat: add Phase 0 social early warning + pre-pump signals to daily pipeline"
```

---

### Task 15: Integration Verification

- [ ] **Step 1: Run all Python tests**

Run: `cd python_ai && python -m pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript typecheck**

Run: `cd /Users/elimizroch/ai_projects/scam-dunk-re-write-claude-code && npx tsc --noEmit --skipLibCheck`
Expected: No type errors

- [ ] **Step 3: Run full build**

Run: `cd /Users/elimizroch/ai_projects/scam-dunk-re-write-claude-code && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Test Python server starts with new endpoints**

Run: `cd python_ai && python -c "from api_server import app; print([r.path for r in app.routes])"`
Expected: Output includes `/pre-pump-scan` and `/social-early-warning`

- [ ] **Step 5: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: complete early pump-and-dump detection system (Options 1-3)"
```
