# Deploying the real-data crash model (scamdunk_rf_v1)

## What this is

A RandomForest trained on the **full US-stock universe of real 1-minute bars**
(7,614 symbols, 11.8M labeled observations, 2022–2026) predicting the
probability a stock **crashes ≥40% within ~22 trading days**. Walk-forward
validated: it beat the rules baseline in **12 of 12 quarters** (mean F1 0.408
vs 0.115 — full fold table in `models/production/scamdunk_rf_v1_meta.json`).

Serving lives in `real_model.py`; the artifact + meta live in
`models/production/` (SHA-256 registered in `model_hashes.json`, verified at
load; fails closed in production).

## How to enable (Railway → Python service env vars)

| Variable | Value | Meaning |
|---|---|---|
| `REAL_MODEL_ENABLED` | `true` | Adds `real_model: {probability, flagged, threshold, …}` to `/analyze` responses. **Additive only** — never changes the rules verdict, never fails a request (errors degrade to `real_model: null`). |
| `REAL_MODEL_THRESHOLD` | `0.90` (default) | Flag when probability ≥ threshold. The walk-forward folds selected 0.875–0.90. Raise for fewer, surer flags; lower to catch more. |

Nothing else changes: `ML_MODELS_ENABLED` (the old synthetic RF/LSTM) stays
`false` and should remain so. The TS layer already parses the new field
(`src/lib/ai-backend-schema.ts → real_model`).

## Operating-point guidance (from the validation folds)

At the trained thresholds the model averaged **~39% precision / ~44% recall**
against a ~3% base rate (a ~13× precision lift over random; the rules baseline
caught only ~7% of crashes). Higher thresholds trade recall for precision.
The exact curve for current markets should be re-measured on fresh data
(rerun the trainer — it prints per-fold numbers at the chosen threshold).

## What the model needs per request (already wired)

- **Daily OHLCV history** (≥70 rows) — fetched by the existing pipeline path.
  17/20 features derive from it, including the most important one
  (`intraday_range_5dmax`, from daily high/low).
- **Recent 1-minute bars** (last ~5 sessions, via yfinance) for the 4
  intraday features. When unavailable they are imputed with documented
  defaults and listed in `imputed_features` — expect slightly weaker scores
  for those symbols (the backtest numbers assume real minute data).

## Maintenance — treat this as a living model

- The fold table shows mild decay over time (F1 ~0.47 in 2023 → ~0.36 in
  late 2025): **retrain quarterly** with `scam_ai_trainer.py` on refreshed
  minute data, then: replace the two files in `models/production/`, update
  the SHA-256 in `model_hashes.json`, bump `MODEL_VERSION` in `real_model.py`,
  and redeploy. The trainer's ship-gate (only saves when it beats the rules)
  is the promotion criterion.
- `GET /models/status` reports `real_model: {enabled, loaded, error, …}` for
  ops visibility.
- Label caveat for product copy: the model predicts **crash-shaped behavior**,
  not proven fraud — flags include non-scam collapses (failed biotechs etc.).
  Phrase user-facing warnings accordingly ("high crash-risk pattern").

## Tests

`tests/test_real_model.py` exercises the committed artifact end-to-end
(feature parity, imputation fallback, threshold semantics, pump>quiet sanity).
Run: `python -m pytest tests/test_real_model.py -q`.
