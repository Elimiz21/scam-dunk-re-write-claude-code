# Scoring Calibration Procedure

This is the procedure to re-derive the HIGH/MEDIUM score cutoffs and signal
weights after the audit-remediation unified the scoring engine. Until this is
run on labeled data, the cutoffs remain at their prior values (HIGH ≥ 5,
MEDIUM ≥ 2) but applied to **de-duplicated** signal scores (correlated
price/volume signals no longer stack), which already removes most of the
over-flagging.

## Why this is needed

Before remediation, the evaluation pipeline scored with `standalone-scorer.ts`
while production scored with `src/lib/scoring.ts` — two different engines. Every
precision/recall number measured historically described the *eval* engine, not
the one users saw. Both now import the single pure module
(`src/lib/scoring/engine.ts`), so calibration finally measures production
behavior.

## Inputs

1. **Labeled outcomes.** For a set of historical tickers/dates, a ground-truth
   label of whether the name was a genuine pump-and-dump / scam within the
   following N days. Sources you already collect:
   - `evaluation/scheme-database/scheme-database.json` (confirmed schemes)
   - SEC trading suspensions / enforcement (true positives)
   - A control set of normal large/mid-caps over the same window (true negatives)
2. **Feature snapshots** for each labeled example: run the unified engine over
   the market data as it stood on the snapshot date.

## Steps

1. Build a labeled dataset `{ marketData, context, label }[]` from the sources
   above (aim for ≥ 500 examples, balanced-ish, spanning OTC + major + crypto).
2. For each example, call `computeRiskScoreSync` (the pure engine) and record
   `totalScore`, the per-signal contributions, and `dataCompleteness`.
3. Sweep the HIGH and MEDIUM cutoffs and report, at each pair, precision /
   recall / F1 for the HIGH class and for HIGH∪MEDIUM. Pick the cutoffs that hit
   your target recall (catching scams matters more than a few false MEDIUMs)
   without flooding MEDIUM — the audit's complaint was over-flagging, so weight
   precision on the HIGH class.
4. Report calibration quality, not just thresholds: a reliability diagram and
   Brier score over `risk_probability`. A step-function probability (the old
   floor lattice) is a red flag — prefer monotonic, well-spread scores.
5. Only after the rule engine is calibrated, evaluate whether the ML layer
   (`ML_MODELS_ENABLED`) *adds* lift over the rules on held-out data. Keep it
   off until it demonstrably beats the rule baseline.

## Where to put the harness

Add a script under `evaluation/` that imports the **shared** engine
(`import { computeRiskScoreSync } from "../../src/lib/scoring/engine"`) so the
calibration and production can never drift again. Do not fork the scorer.

## Acceptance

- Documented cutoffs with the dataset and date range they were derived on.
- HIGH-class precision and recall on a held-out split.
- A note in `docs/SCORING_METHODOLOGY.md` recording the chosen cutoffs and when
  they were last calibrated.
