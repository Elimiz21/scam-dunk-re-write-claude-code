"""
Train a REAL scam/pump-and-dump detector on your own historical outcomes.

Unlike ml_model.py (which trains on synthetic data generated from the same rules
it's meant to replace — a circular exercise that scores a meaningless 100%), this
script learns from what actually happened:

  * Features  = price-action derived from each stock's real daily close series
                (StockDailySnapshot.lastPrice), computed only from data available
                UP TO the observation date (no look-ahead).
  * Label     = did that stock actually crash >= DROP_THRESHOLD within the next
                FORWARD_DAYS trading days? (a real pump-and-dump signature)
  * Baseline  = your existing rules engine's verdict (riskLevel == 'HIGH') on the
                SAME held-out test set — the bar the model has to beat.
  * Split     = TIME-BASED (train on the past, test on the future) so the reported
                numbers reflect real forward performance, not leakage.

The model is SAVED ONLY IF it beats the rules baseline on the test set. If it
doesn't, that's a real, honest result: stay on the rules engine.

------------------------------------------------------------------------------
USAGE
------------------------------------------------------------------------------
  pip install psycopg2-binary pandas scikit-learn numpy      # if not present

  # Option A — straight from the database (recommended):
  export DATABASE_URL='postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres'
  python train_real_model.py

  # Option B — from a CSV export (if the box can't reach Postgres directly).
  # Export these columns from StockDailySnapshot first:
  #   stockId, scanDate, lastPrice, totalScore, riskLevel, marketCap
  python train_real_model.py --csv snapshots.csv

Outputs a metrics report and, if it wins, writes:
  models/real_rf_scam_detector.joblib  +  models/real_rf_metadata.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Tunable definitions of "a scam outcome"
# ---------------------------------------------------------------------------
FORWARD_DAYS = 22          # ~30 calendar days of trading
DROP_THRESHOLD = 0.40      # >= 40% drawdown from the observation price = positive
MIN_FORWARD_POINTS = 10    # need this many future obs to trust the label
MIN_HISTORY_POINTS = 20    # need this much trailing history to build features
TEST_FRACTION_BY_TIME = 0.30  # most-recent 30% of dates -> test set
FEATURE_COLUMNS = [
    "ret_1d", "ret_5d", "ret_10d", "ret_20d",
    "price_zscore_20d", "ret_vol_20d",
    "max_runup_20d", "drawdown_from_high_20d",
    "rsi_14", "dist_from_high_20d", "dist_from_low_20d",
    "log_price", "log_market_cap",
]

# The pull query. Ordered so pandas groupby/rolling is cheap and correct.
PULL_SQL = """
SELECT "stockId", "scanDate", "lastPrice", "totalScore", "riskLevel", "marketCap"
FROM "StockDailySnapshot"
WHERE "lastPrice" IS NOT NULL AND "lastPrice" > 0
ORDER BY "stockId", "scanDate"
"""


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_snapshots(csv_path: str | None) -> pd.DataFrame:
    if csv_path:
        df = pd.read_csv(csv_path)
    else:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            sys.exit(
                "DATABASE_URL not set and no --csv given. Set DATABASE_URL to your "
                "Postgres connection string (use the :5432 direct host for a bulk "
                "read), or pass --csv <export.csv>."
            )
        try:
            import psycopg2  # noqa: F401
        except ImportError:
            sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary")
        import psycopg2
        conn = psycopg2.connect(database_url)
        try:
            df = pd.read_sql(PULL_SQL, conn)
        finally:
            conn.close()

    # Normalize column names/types regardless of source.
    df = df.rename(columns={"stockId": "stock_id", "scanDate": "scan_date"})
    df["scan_date"] = pd.to_datetime(df["scan_date"], utc=True).dt.tz_localize(None)
    df["lastPrice"] = pd.to_numeric(df["lastPrice"], errors="coerce")
    df["marketCap"] = pd.to_numeric(df.get("marketCap"), errors="coerce")
    df = df.dropna(subset=["lastPrice"])
    df = df[df["lastPrice"] > 0]
    df = df.sort_values(["stock_id", "scan_date"]).reset_index(drop=True)
    return df


# ---------------------------------------------------------------------------
# Feature engineering — all TRAILING (no look-ahead) — per stock
# ---------------------------------------------------------------------------
def _rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(window, min_periods=window).mean()
    loss = (-delta.clip(upper=0)).rolling(window, min_periods=window).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50.0)


def build_features_and_labels(df: pd.DataFrame) -> pd.DataFrame:
    """Vectorized per-stock features (trailing) and the forward-drawdown label."""
    out = []
    for stock_id, g in df.groupby("stock_id", sort=False):
        g = g.sort_values("scan_date")
        p = g["lastPrice"].astype(float)
        if len(g) < MIN_HISTORY_POINTS + MIN_FORWARD_POINTS:
            continue

        feats = pd.DataFrame(index=g.index)
        feats["stock_id"] = stock_id
        feats["scan_date"] = g["scan_date"].values
        feats["price"] = p.values
        feats["riskLevel"] = g["riskLevel"].values
        feats["totalScore"] = pd.to_numeric(g["totalScore"], errors="coerce").fillna(0).values

        # Trailing returns
        feats["ret_1d"] = p.pct_change(1).values
        feats["ret_5d"] = p.pct_change(5).values
        feats["ret_10d"] = p.pct_change(10).values
        feats["ret_20d"] = p.pct_change(20).values

        # Price z-score vs trailing 20d
        m20 = p.rolling(20, min_periods=20).mean()
        s20 = p.rolling(20, min_periods=20).std()
        feats["price_zscore_20d"] = ((p - m20) / s20.replace(0, np.nan)).values

        # Realized vol of daily returns (20d)
        feats["ret_vol_20d"] = p.pct_change().rolling(20, min_periods=20).std().values

        # Runup and drawdown within trailing 20d (pump signature)
        roll_max = p.rolling(20, min_periods=20).max()
        roll_min = p.rolling(20, min_periods=20).min()
        feats["max_runup_20d"] = ((p - roll_min) / roll_min.replace(0, np.nan)).values
        feats["drawdown_from_high_20d"] = ((roll_max - p) / roll_max.replace(0, np.nan)).values
        feats["dist_from_high_20d"] = (p / roll_max.replace(0, np.nan)).values
        feats["dist_from_low_20d"] = (p / roll_min.replace(0, np.nan)).values

        feats["rsi_14"] = _rsi(p).values
        feats["log_price"] = np.log1p(p).values
        mc = pd.to_numeric(g["marketCap"], errors="coerce")
        feats["log_market_cap"] = np.log1p(mc.fillna(0)).values

        # FORWARD label: min close over the next FORWARD_DAYS rows.
        rev = p.values[::-1]
        fwd_min = (
            pd.Series(rev)
            .rolling(FORWARD_DAYS, min_periods=MIN_FORWARD_POINTS)
            .min()
            .shift(1)
            .values[::-1]
        )
        fwd_count = (
            pd.Series(np.ones(len(rev)))
            .rolling(FORWARD_DAYS, min_periods=1)
            .sum()
            .shift(1)
            .values[::-1]
        )
        feats["fwd_min"] = fwd_min
        feats["fwd_points"] = fwd_count
        feats["label"] = (fwd_min <= (1 - DROP_THRESHOLD) * p.values).astype(float)

        out.append(feats)

    if not out:
        sys.exit("No stocks had enough history to build features. Check the data.")
    allf = pd.concat(out, ignore_index=True)

    # Keep only rows with a well-defined label and complete features.
    allf = allf[allf["fwd_points"] >= MIN_FORWARD_POINTS]
    allf = allf.replace([np.inf, -np.inf], np.nan).dropna(subset=FEATURE_COLUMNS + ["label"])
    return allf


# ---------------------------------------------------------------------------
# Train + honest evaluation vs the rules baseline
# ---------------------------------------------------------------------------
def _metrics(y_true, y_pred) -> dict:
    from sklearn.metrics import precision_score, recall_score, f1_score
    return {
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "positives_predicted": int(np.sum(y_pred)),
    }


def train_and_evaluate(data: pd.DataFrame) -> dict:
    from sklearn.ensemble import RandomForestClassifier

    # Time-based split: earliest 70% of dates train, most-recent 30% test.
    cutoff = data["scan_date"].quantile(1 - TEST_FRACTION_BY_TIME)
    train = data[data["scan_date"] < cutoff]
    test = data[data["scan_date"] >= cutoff]
    if len(test) == 0 or train["label"].nunique() < 2:
        sys.exit("Not enough temporal spread / class variety to split. Need more dates.")

    X_train, y_train = train[FEATURE_COLUMNS].values, train["label"].values
    X_test, y_test = test[FEATURE_COLUMNS].values, test["label"].values

    clf = RandomForestClassifier(
        n_estimators=300, max_depth=8, min_samples_leaf=50,
        class_weight="balanced", random_state=42, n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    # Choose the decision threshold on TRAIN that maximizes F1, apply to TEST.
    from sklearn.metrics import f1_score
    proba_train = clf.predict_proba(X_train)[:, 1]
    thresholds = np.linspace(0.1, 0.9, 33)
    best_t = max(thresholds, key=lambda t: f1_score(y_train, proba_train >= t, zero_division=0))
    proba_test = clf.predict_proba(X_test)[:, 1]
    ml_pred = (proba_test >= best_t).astype(float)

    # Baseline: the existing rules engine on the SAME test rows.
    rules_pred = (test["riskLevel"].values == "HIGH").astype(float)

    ml_m = _metrics(y_test, ml_pred)
    rules_m = _metrics(y_test, rules_pred)
    base_rate = round(float(np.mean(y_test)), 4)

    importances = sorted(
        zip(FEATURE_COLUMNS, clf.feature_importances_),
        key=lambda kv: kv[1], reverse=True,
    )

    wins = ml_m["f1"] > rules_m["f1"]
    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "config": {
            "forward_days": FORWARD_DAYS, "drop_threshold": DROP_THRESHOLD,
            "decision_threshold": round(float(best_t), 3),
        },
        "dataset": {
            "total_labeled_observations": int(len(data)),
            "train_observations": int(len(train)),
            "test_observations": int(len(test)),
            "test_base_crash_rate": base_rate,
            "split_cutoff_date": str(cutoff.date()),
        },
        "rules_baseline_on_test": rules_m,
        "ml_model_on_test": ml_m,
        "ml_beats_rules": bool(wins),
        "top_features": [{"feature": f, "importance": round(float(i), 4)} for f, i in importances[:8]],
    }
    return {"report": report, "model": clf if wins else None}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="CSV export instead of a live DB connection")
    ap.add_argument("--save-always", action="store_true",
                    help="save the model even if it doesn't beat the rules (for inspection)")
    args = ap.parse_args()

    print("Loading snapshots...")
    df = load_snapshots(args.csv)
    print(f"  {len(df):,} rows across {df['stock_id'].nunique():,} stocks")

    print("Building trailing features + forward-drawdown labels (no look-ahead)...")
    data = build_features_and_labels(df)
    print(f"  {len(data):,} labeled observations; "
          f"crash base rate {data['label'].mean():.1%}")

    print("Training + evaluating against the rules baseline (time-split)...")
    result = train_and_evaluate(data)
    print("\n" + json.dumps(result["report"], indent=2))

    model = result["model"]
    if model is None and not args.save_always:
        print("\n=> The model did NOT beat the rules on the held-out future. "
              "Not saving. Staying on the rules engine is the honest call.")
        return

    os.makedirs("models", exist_ok=True)
    import joblib
    joblib.dump(model, "models/real_rf_scam_detector.joblib")
    with open("models/real_rf_metadata.json", "w") as f:
        json.dump(
            {"features": FEATURE_COLUMNS, **result["report"]}, f, indent=2
        )
    print("\n=> Saved models/real_rf_scam_detector.joblib (+ metadata). "
          "It beat the rules baseline on the held-out future.")


if __name__ == "__main__":
    main()
