# Training a real scam detector on your own outcomes

## Why the old training was theater

`ml_model.py` trains on **synthetic** data: it fabricates 500 "scam" and 500
"normal" feature vectors from hand-picked ranges, then trains a Random Forest on
them. It scores ~100% accuracy — because the labels are a deterministic function
of the features, so the model just re-learns the hand-coded rules. It cannot beat
the rules engine because it *is* the rules engine, laundered through sklearn.
Enabling it in production adds a heavy TensorFlow dependency and inference cost
for no real gain.

## What this does instead

`train_real_model.py` learns from what actually happened to your stocks:

| Piece | How it's built |
|---|---|
| **Features** | Price-action from each stock's real daily close series (`StockDailySnapshot.lastPrice`), all **trailing** — returns, z-score, realized vol, run-up, drawdown, RSI, price level, market cap. No look-ahead. |
| **Label** | Did the stock actually **crash ≥ 40% within the next ~22 trading days**? A real pump-and-dump signature, derived from the *future* snapshots. |
| **Baseline** | Your existing rules (`riskLevel == 'HIGH'`) on the **same held-out test set** — the number to beat. |
| **Split** | **Time-based** (train on the past, test on the future) so the metrics reflect real forward performance, not leakage. |
| **Ship gate** | The model is saved **only if it beats the rules' F1** on the test set. If it loses, that's an honest result: stay on the rules. |

Feasibility was checked against your DB first: **6,478 stocks have real moving
price series** (only 535 are frozen), averaging 73 distinct prices each, and
**~44% experienced a ≥40% crash** — a healthy positive-class rate.

## Run it (≈5 minutes)

```bash
cd python_ai
pip install psycopg2-binary pandas scikit-learn numpy   # if needed

# 1. (optional) See how good your rules already are — paste into Supabase SQL Editor:
#    sql/validate_rules_baseline.sql

# 2. Train + validate. Use the DIRECT :5432 host for a fast bulk read.
export DATABASE_URL='postgresql://postgres:<db-password>@db.gwzcluijtbuglznwdqqk.supabase.co:5432/postgres'
python train_real_model.py
```

If the box can't reach Postgres directly, export the six columns
(`stockId, scanDate, lastPrice, totalScore, riskLevel, marketCap`) from
`StockDailySnapshot` to a CSV and run `python train_real_model.py --csv snaps.csv`.

## Reading the output

It prints a JSON report: the test-set **crash base rate**, the **rules baseline**
precision/recall/F1, the **model** precision/recall/F1, whether
`ml_beats_rules`, and the top features. If it wins it writes
`models/real_rf_scam_detector.joblib` + `models/real_rf_metadata.json`.

- **Model wins** → you have a real detector worth wiring in. Next step: serve it
  from `pipeline.py` behind a new feature flag, feeding it the same trailing
  features (these use only close prices, so they're cheap to compute live).
- **Model loses / ties** → your rules are already capturing the signal; don't add
  ML complexity. A real, valuable finding.

## Have a minute-bar archive? Use the bigger pipeline

If you have historical **1-minute bars** (e.g. all US stocks on a local drive),
`train_from_minute_data.py` is the stronger path — minute data unlocks intraday
pump signatures (max 5-minute return, volume concentration, VWAP deviation)
that daily data can't see, and it runs a **walk-forward loop** (train on an
expanding past window → validate on the next quarter → step forward) instead of
a single split. Run it **on the machine the drive is attached to**:

```bash
pip install pandas numpy scikit-learn pyarrow joblib
python train_from_minute_data.py inspect   --root /path/to/drive     # verify layout
python train_from_minute_data.py aggregate --root /path/to/drive --limit 50   # smoke test
python train_from_minute_data.py aggregate --root /path/to/drive --years 4    # full (resumable)
python train_from_minute_data.py train     --data minute_daily_agg.parquet
```

The aggregate stage reduces billions of minute rows to one row per symbol-day
(a few hundred MB) and is resumable; the train stage takes minutes and prints a
per-fold table plus `models/real_minute_report.json`. Same ship gate: the model
is saved only if it beats the rules-proxy baseline across folds.

## Tuning knobs (top of the script)

`FORWARD_DAYS` (horizon), `DROP_THRESHOLD` (what counts as a crash),
`TEST_FRACTION_BY_TIME` (split point), and `FEATURE_COLUMNS`. Two natural
follow-ups: (1) add an ensemble variant that also takes `totalScore` as a feature
to see if ML **plus** rules beats rules alone; (2) once volume/OHLC are populated
in snapshots (see review finding D6), extend the feature set toward the full
serving contract.

> Note: models trained here encode your data — they are git-ignored by default
> (`models/real_*`). Commit deliberately if you want them versioned.
