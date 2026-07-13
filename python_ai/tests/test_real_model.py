"""Serving tests for the real-data crash model (models/production/scamdunk_rf_v1).

These exercise the ACTUAL committed artifact end-to-end: feature construction
from daily OHLCV (+ optional minute bars), imputation fallback, threshold
flagging, and the enable/disable switch.
"""

import numpy as np
import pandas as pd
import pytest

import real_model
from real_model import (
    IMPUTE_DEFAULTS,
    RealModelUnavailable,
    compute_features,
    real_model_enabled,
    score_for_pipeline,
    status,
)


def _daily(rows: int = 120, pump: bool = False, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    price = 4.0
    recs = []
    for i in range(rows):
        drift = 1.06 if (pump and i >= rows - 12) else rng.uniform(0.995, 1.005)
        price = max(price * drift, 0.05)
        hi, lo = price * rng.uniform(1.0, 1.05), price * rng.uniform(0.95, 1.0)
        vol = rng.uniform(1e5, 5e5) * (8 if (pump and i >= rows - 12) else 1)
        recs.append({"Open": price * 0.99, "High": hi, "Low": lo,
                     "Close": price, "Volume": vol})
    return pd.DataFrame(recs)


def _minute(days: int = 6, seed: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    base = pd.Timestamp("2026-06-01 13:30:00")
    rows = []
    price = 4.0
    for d in range(days):
        day = base + pd.Timedelta(days=d)
        for m in range(240):
            price *= rng.uniform(0.999, 1.001)
            rows.append({"Datetime": day + pd.Timedelta(minutes=m),
                         "Close": price, "Volume": int(rng.uniform(100, 900))})
    return pd.DataFrame(rows)


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("REAL_MODEL_ENABLED", raising=False)
    assert real_model_enabled() is False


def test_status_reports_loaded(monkeypatch):
    monkeypatch.setenv("REAL_MODEL_ENABLED", "true")
    s = status()
    assert s["enabled"] is True
    assert s["loaded"] is True, f"model failed to load: {s['error']}"
    assert s["model_version"]


def test_features_with_minute_data():
    row, imputed = compute_features(_daily(), _minute())
    assert list(row.columns) == real_model._features
    assert row.shape == (1, 20)
    assert np.isfinite(row.to_numpy()).all()
    assert imputed == []  # minute frame provided -> nothing imputed


def test_features_impute_without_minute_data():
    row, imputed = compute_features(_daily(), None)
    assert sorted(imputed) == sorted(IMPUTE_DEFAULTS)
    for k, v in IMPUTE_DEFAULTS.items():
        assert row[k].iloc[0] == v
    # the #1 feature must come from daily high/low, never imputation
    assert "intraday_range_5dmax" not in imputed


def test_score_bounds_and_flag_semantics(monkeypatch):
    monkeypatch.setenv("REAL_MODEL_THRESHOLD", "0.90")
    out = score_for_pipeline(_daily(), _minute())
    assert 0.0 <= out["probability"] <= 1.0
    assert out["threshold"] == 0.90
    assert out["flagged"] == (out["probability"] >= 0.90)
    assert out["model_version"]


def test_pump_scores_higher_than_quiet():
    quiet = score_for_pipeline(_daily(pump=False, seed=11))["probability"]
    pumped = score_for_pipeline(_daily(pump=True, seed=11))["probability"]
    assert pumped > quiet


def test_insufficient_history_raises():
    with pytest.raises(RealModelUnavailable):
        compute_features(_daily(rows=40), None)
