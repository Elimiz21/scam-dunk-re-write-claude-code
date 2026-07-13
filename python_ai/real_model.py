"""
Real-data crash model serving (ScamDunk RF v1).

Serves the RandomForest trained by scam_ai_trainer.py (v5) on the full US-stock
universe of 1-minute bars (7,614 symbols, 11.8M labeled observations,
walk-forward validated 12/12 quarters vs the rules baseline — see
models/production/scamdunk_rf_v1_meta.json for the full fold table).

The model predicts the probability that a stock crashes >= 40% within the next
~22 trading days, from 20 trailing price/volume features. Feature math here
MIRRORS the trainer exactly — any change must be made in both places.

Serving contract:
  * 17 of 20 features come from DAILY OHLCV history (>= 70 rows recommended).
    This includes the single most important feature, intraday_range_5dmax,
    which derives from daily High/Low.
  * 3-4 features are minute-derived (max_5min_ret, vol_top30_share,
    close_vs_vwap, active_minutes). When a recent 1-minute frame is provided
    (yfinance covers ~7 days of 1m bars) they are computed exactly as trained;
    otherwise they are imputed with documented small-cap medians and reported
    in `imputed_features` so callers can see the degradation.

Enable with REAL_MODEL_ENABLED=true. Tune REAL_MODEL_THRESHOLD (default 0.90 —
the walk-forward folds selected 0.875-0.90; raise it for fewer, surer flags).
"""

from __future__ import annotations

import json
import os
import threading
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "production")
MODEL_PATH = os.environ.get("REAL_MODEL_PATH",
                            os.path.join(MODEL_DIR, "scamdunk_rf_v1.joblib"))
META_PATH = os.path.splitext(MODEL_PATH)[0] + "_meta.json"
MODEL_VERSION = "rf_v1_2026-07"

# Fallbacks for minute-derived features when no minute frame is available.
# Rough small-cap medians; every use is reported via `imputed_features`.
IMPUTE_DEFAULTS = {
    "max5m_ret_5dmax": 0.04,
    "vol_top30_share_5dmean": 0.45,
    "close_vs_vwap_5dmean": 0.0,
    "active_minutes_5dmean": 300.0,
}

_lock = threading.Lock()
_model = None
_features: Optional[List[str]] = None
_load_error: Optional[str] = None


class RealModelUnavailable(RuntimeError):
    pass


def real_model_enabled() -> bool:
    return os.environ.get("REAL_MODEL_ENABLED", "false").strip().lower() in (
        "1", "true", "yes", "on")


def real_model_threshold() -> float:
    try:
        return float(os.environ.get("REAL_MODEL_THRESHOLD", "0.90"))
    except ValueError:
        return 0.90


def _load():
    """Load model + meta once, with the same integrity policy as other models."""
    global _model, _features, _load_error
    if _model is not None or _load_error is not None:
        return
    with _lock:
        if _model is not None or _load_error is not None:
            return
        try:
            from model_integrity import verify_model_file
            if not verify_model_file(MODEL_PATH):
                raise RealModelUnavailable(
                    "model integrity verification failed (see model_hashes.json)")
            import joblib
            _model = joblib.load(MODEL_PATH)
            with open(META_PATH) as fh:
                _features = json.load(fh)["features"]
            if getattr(_model, "n_features_in_", len(_features)) != len(_features):
                raise RealModelUnavailable("model/meta feature-count mismatch")
        except Exception as e:  # noqa: BLE001 — record and fail closed
            _load_error = f"{type(e).__name__}: {e}"
            _model = None


def status() -> Dict:
    if real_model_enabled():
        _load()
    return {
        "enabled": real_model_enabled(),
        "loaded": _model is not None,
        "error": _load_error,
        "model_path": os.path.relpath(MODEL_PATH, os.path.dirname(os.path.abspath(__file__))),
        "model_version": MODEL_VERSION,
        "threshold": real_model_threshold(),
    }


# ---------------------------------------------------------------------------
# Feature construction (mirrors scam_ai_trainer.build_dataset for ONE symbol)
# ---------------------------------------------------------------------------
def _norm_daily(daily: pd.DataFrame) -> pd.DataFrame:
    cols = {c.lower().strip(): c for c in daily.columns}
    need = {}
    for want, alts in (("open", ("open",)), ("high", ("high",)), ("low", ("low",)),
                       ("close", ("close", "adj close", "adj_close", "price")),
                       ("volume", ("volume", "vol"))):
        src = next((cols[a] for a in alts if a in cols), None)
        if src is None and want in ("open", "high", "low"):
            src = next((cols[a] for a in ("close", "adj close", "price") if a in cols), None)
        if src is None:
            raise RealModelUnavailable(f"daily data missing column: {want}")
        need[want] = pd.to_numeric(daily[src], errors="coerce")
    out = pd.DataFrame(need)
    out = out.dropna(subset=["close"])
    out = out[out["close"] > 0]
    return out.reset_index(drop=True)


def _rsi(p: pd.Series, w: int = 14) -> pd.Series:
    d = p.diff()
    up = d.clip(lower=0).rolling(w, min_periods=w).mean()
    dn = (-d.clip(upper=0)).rolling(w, min_periods=w).mean()
    return (100 - 100 / (1 + up / dn.replace(0, np.nan))).fillna(50.0)


def _minute_day_metrics(minute: pd.DataFrame) -> Optional[pd.DataFrame]:
    """Per-day intraday metrics from a recent 1-minute frame (>=5 sessions)."""
    if minute is None or len(minute) == 0:
        return None
    cols = {c.lower().strip(): c for c in minute.columns}
    tcol = next((cols[a] for a in ("datetime", "timestamp", "date", "time") if a in cols), None)
    ccol = next((cols[a] for a in ("close", "price") if a in cols), None)
    vcol = next((cols[a] for a in ("volume", "vol") if a in cols), None)
    if tcol is None and isinstance(minute.index, pd.DatetimeIndex):
        minute = minute.reset_index()
        tcol = minute.columns[0]
        cols = {c.lower().strip(): c for c in minute.columns}
        ccol = next((cols[a] for a in ("close", "price") if a in cols), None)
        vcol = next((cols[a] for a in ("volume", "vol") if a in cols), None)
    if tcol is None or ccol is None:
        return None
    dt = pd.to_datetime(minute[tcol], utc=True, errors="coerce").dt.tz_localize(None)
    df = pd.DataFrame({
        "day": dt.dt.normalize(),
        "close": pd.to_numeric(minute[ccol], errors="coerce"),
        "volume": pd.to_numeric(minute[vcol], errors="coerce") if vcol else 0.0,
    }).dropna(subset=["day", "close"])
    rows = []
    for day, g in df.groupby("day", sort=True):
        c = g["close"].to_numpy()
        v = g["volume"].to_numpy(dtype=float)
        tot = float(v.sum())
        max5 = float(np.nanmax(c[5:] / c[:-5] - 1.0)) if len(c) > 5 else 0.0
        vwap = float((c * v).sum() / tot) if tot > 0 else float(np.mean(c))
        top30 = float(np.sort(v)[-30:].sum() / tot) if tot > 0 and len(v) > 30 else (1.0 if tot > 0 else 0.0)
        rows.append({"day": day, "max_5min_ret": max5,
                     "vol_top30_share": top30,
                     "close_vs_vwap": (c[-1] / vwap - 1.0) if vwap > 0 else 0.0,
                     "active_minutes": int(len(g))})
    out = pd.DataFrame(rows)
    return out if len(out) >= 5 else None


def compute_features(daily: pd.DataFrame,
                     minute: Optional[pd.DataFrame] = None) -> Tuple[pd.DataFrame, List[str]]:
    """Latest-row feature vector. Returns (1xN DataFrame named per meta, imputed list)."""
    _load()
    if _model is None:
        raise RealModelUnavailable(_load_error or "model not loaded")
    d = _norm_daily(daily)
    if len(d) < 70:
        raise RealModelUnavailable(f"needs >=70 daily rows, got {len(d)}")
    p, v = d["close"], d["volume"].fillna(0)

    f: Dict[str, float] = {}
    for n in (1, 5, 10, 20):
        f[f"ret_{n}d"] = p.pct_change(n).iloc[-1]
    m20 = p.rolling(20, min_periods=20).mean()
    s20 = p.rolling(20, min_periods=20).std()
    f["price_zscore_20d"] = ((p - m20) / s20.replace(0, np.nan)).iloc[-1]
    f["ret_vol_20d"] = p.pct_change().rolling(20, min_periods=20).std().iloc[-1]
    rmax = p.rolling(20, min_periods=20).max()
    rmin = p.rolling(20, min_periods=20).min()
    f["max_runup_20d"] = ((p - rmin) / rmin.replace(0, np.nan)).iloc[-1]
    f["drawdown_from_high_20d"] = ((rmax - p) / rmax.replace(0, np.nan)).iloc[-1]
    f["dist_from_high_20d"] = (p / rmax.replace(0, np.nan)).iloc[-1]
    f["rsi_14"] = _rsi(p).iloc[-1]
    f["log_price"] = float(np.log1p(p.iloc[-1]))
    f["log_dollar_vol_20d"] = float(np.log1p((p * v).rolling(20, min_periods=20).mean().iloc[-1]))
    vm5 = v.rolling(5, min_periods=5).mean()
    vm20 = v.rolling(20, min_periods=20).mean()
    vs20 = v.rolling(20, min_periods=20).std()
    vm60 = v.rolling(60, min_periods=30).mean()
    f["vol_z_5d"] = ((v - vm5) / vs20.replace(0, np.nan)).iloc[-1]
    f["vol_z_20d"] = ((v - vm20) / vs20.replace(0, np.nan)).iloc[-1]
    f["volume_surge_factor"] = (vm5 / vm60.replace(0, np.nan)).iloc[-1]

    # Intraday range comes from DAILY high/low — identical to the trained
    # definition (per-day (high-low)/low, 5-day max). No minute data needed.
    intraday_range = ((d["high"] - d["low"]) / d["low"].replace(0, np.nan))
    f["intraday_range_5dmax"] = intraday_range.rolling(5, min_periods=5).max().iloc[-1]

    imputed: List[str] = []
    mm = _minute_day_metrics(minute)
    if mm is not None:
        last5 = mm.tail(5)
        f["max5m_ret_5dmax"] = float(last5["max_5min_ret"].max())
        f["vol_top30_share_5dmean"] = float(last5["vol_top30_share"].mean())
        f["close_vs_vwap_5dmean"] = float(last5["close_vs_vwap"].mean())
        f["active_minutes_5dmean"] = float(last5["active_minutes"].mean())
    else:
        for k, dv in IMPUTE_DEFAULTS.items():
            f[k] = dv
            imputed.append(k)

    row = pd.DataFrame([[f[name] for name in _features]], columns=_features)
    row = row.replace([np.inf, -np.inf], np.nan)
    if row.isna().any().any():
        bad = [c for c in row.columns if row[c].isna().any()]
        raise RealModelUnavailable(f"features not computable (insufficient history): {bad}")
    return row.astype(float), imputed


def score_for_pipeline(daily: pd.DataFrame,
                       minute: Optional[pd.DataFrame] = None) -> Dict:
    """Score one symbol. Raises RealModelUnavailable when it can't run."""
    row, imputed = compute_features(daily, minute)
    prob = float(_model.predict_proba(row)[0, 1])
    thr = real_model_threshold()
    return {
        "probability": round(prob, 4),
        "flagged": bool(prob >= thr),
        "threshold": thr,
        "imputed_features": imputed,
        "model_version": MODEL_VERSION,
    }
