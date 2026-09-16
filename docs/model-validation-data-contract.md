# Offline model evaluation data contract

Status: engineering contract for research evaluation only. It does not approve,
deploy, load, or enable Random Forest, LSTM, or any other model. ScamDunk remains
rules-only until a separate explicit approval records the accepted empirical
criteria and release decision.

## Command

Run from the repository root:

```bash
python -m python_ai.offline_model_evaluation \
  --input /absolute/path/to/sealed-evaluation.json \
  --output /absolute/path/to/evaluation-report.json
```

The command performs no network access and does not train or load a model. Exit
code `0` means a real-world dataset passed the data contract and produced
metrics with status `EVALUATED_NOT_APPROVED`. Exit code `2` means status
`NOT_VALIDATED`. Neither exit code enables a model.

## Input envelope

The input is one JSON object. JSON canonicalization for every SHA-256 binding is
UTF-8 with keys sorted, no insignificant whitespace, and non-ASCII characters
preserved. In Python this is:

```python
json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
```

All SHA-256 values are lowercase, 64-character hexadecimal strings. All
timestamps are ISO 8601 and include a UTC offset; `Z` is accepted.

| Field | Type | Contract |
|---|---|---|
| `schema_version` | string | Exactly `scamdunk-model-evaluation/v1`. |
| `evaluation_run_id` | string | Non-empty immutable run identifier. |
| `data_classification` | string enum | `REAL_WORLD` or `FIXTURE`. Arrays, objects, and other malformed shapes are rejected. Fixtures can exercise the evaluator but cannot validate efficacy. |
| `holdout_cutoff` | timestamp | Training observations precede it. Holdout observations occur at or after it. |
| `manifest` | object | Release artifact and dataset bindings below. |
| `evaluation_config` | object | Fixed decision thresholds selected before evaluation. |
| `approval_criteria` | object | Empirical acceptance thresholds selected before evaluation. They are evaluated but never auto-approve a model. |
| `rows` | array | Immutable training-reference and holdout prediction/label rows. |
| `exclusions` | array | Sealed members of the intended holdout cohort that could not be evaluated. |

### Release manifest

| Field | Type | Contract |
|---|---|---|
| `model_version` | string | Non-empty version of the candidate that produced every score. |
| `model_artifact_sha256` | SHA-256 | Exact serialized candidate artifact. Every row repeats this binding. |
| `feature_contract_sha256` | SHA-256 | Exact feature names, order, transformations, and as-of rules. Every row repeats this binding. |
| `training_dataset_sha256` | SHA-256 | Exact immutable training dataset. Every row repeats this binding. |
| `evaluation_dataset_sha256` | SHA-256 | Hash of `{"rows": rows, "exclusions": exclusions}` including each row hash. |
| `training_provenance` | provenance | Source of the bound training dataset. Real-world evaluation requires `observed` provenance. |

The evaluator checks every repeated row binding against the manifest. It cannot
independently prove that an unprovided model, feature-contract file, or training
dataset has the declared bytes; those artifacts must be retained and verified
by the release reviewer before approval. The declared training and evaluation
dataset hashes must differ.

### Prediction and label row

Each row has the following fields. A row is sealed with `row_sha256`, calculated
over the row object with only `row_sha256` omitted.

| Field | Type | Contract |
|---|---|---|
| `row_id` | string | Unique immutable identifier. |
| `ticker` | string | Non-empty security identifier as used by the source. Symbol-history normalization belongs in the bound feature/data contract. |
| `partition` | enum | `TRAIN` or `HOLDOUT`. |
| `observation_timestamp` | timestamp | Time at which the prediction is considered made. Duplicate ticker/timestamp observations are rejected across both partitions. |
| `feature_cutoff_timestamp` | timestamp | Latest information admitted to features; must be at or before `observation_timestamp`. |
| `label_available_timestamp` | timestamp | First time the final label was knowable from its source. |
| `label` | integer | Exactly `0` or `1`. Booleans are rejected. |
| `model_score` | number | Finite probability in `[0, 1]`. |
| `rules_score` | number | Finite rules-only baseline probability in `[0, 1]` for the same observation. |
| `uncertainty` | number | Observed candidate uncertainty in `[0, 1]`, using the method declared by the bound model contract. It is summarized, not inferred. |
| `observed_latency_ms` | number | Finite non-negative end-to-end scoring latency for this observation. Missing values are rejected rather than estimated. |
| `observed_cost_usd` | number | Finite non-negative observed marginal scoring cost in USD. Missing values are rejected rather than estimated. |
| `model_version` | string | Must equal the manifest value. |
| `model_artifact_sha256` | SHA-256 | Must equal the manifest value. |
| `feature_contract_sha256` | SHA-256 | Must equal the manifest value. |
| `training_dataset_sha256` | SHA-256 | Must equal the manifest value. |
| `prediction_provenance` | provenance | Source of the inputs and stored prediction. |
| `label_provenance` | provenance | Independent source of the outcome label. |
| `row_sha256` | SHA-256 | Canonical hash of the row without this field. |

Temporal rules are fail-closed:

- `TRAIN`: `observation_timestamp < holdout_cutoff` and
  `label_available_timestamp <= holdout_cutoff`. This prevents training on a
  label unavailable when the temporal split began.
- `HOLDOUT`: `observation_timestamp >= holdout_cutoff` and
  `label_available_timestamp > observation_timestamp`. A later label may score
  the prediction only after the prediction exists; it can never enter features.
- Every partition: `feature_cutoff_timestamp <= observation_timestamp`.

The training rows are references used to enforce timing, provenance, duplicate,
and manifest bindings. Metrics are calculated only from holdout rows.

### Provenance object

The same shape is required for training, prediction, label, and exclusion
provenance.

| Field | Type | Contract |
|---|---|---|
| `source_type` | string enum | `observed`, `synthetic`, or `fixture`. Arrays, objects, and other malformed shapes are rejected. `REAL_WORLD` accepts only `observed`; `FIXTURE` rejects `observed`. |
| `source_id` | string | Non-empty stable source/dataset identifier. |
| `source_uri` | URI | Absolute immutable or version-addressed source location, such as `db://`, `s3://`, or `file://`. |
| `retrieved_at` | timestamp | When the record was retrieved, with UTC offset. |
| `record_sha256` | SHA-256 | Hash of the exact source record or immutable source extract. |

Naming synthetic or fixture data `observed` is a provenance falsehood outside
the reach of schema validation. Approval therefore requires independent review
of source records, hashes, label definition, identity mapping, corporate
actions, and collection timing.

### Exclusion row and coverage

An exclusion contains `exclusion_id`, `ticker`, `observation_timestamp`, a
non-empty `reason_code`, `source_provenance`, and `row_sha256`. Its hash follows
the same rule as a prediction row. Exclusions are part of the evaluation dataset
hash so they cannot be silently removed to improve coverage.

Each exclusion must be at or after `holdout_cutoff`. Its canonical observation
identity is the trimmed, uppercased ticker plus the timestamp normalized to UTC.
That identity must be unique among exclusions and must not overlap any training
or holdout row. A row cannot therefore appear in both the coverage numerator and
the exclusion denominator.

Coverage is:

```text
evaluated holdout rows / (evaluated holdout rows + exclusions)
```

The report includes `exclusions_by_reason`. Invalid prediction rows are contract
failures, not exclusions, and produce no metrics. When the data contract is
invalid, `holdout_candidate_count` and `coverage` are `null` because there is no
accepted cohort denominator.

Hashes prove that the supplied cohort did not change after sealing. They do not
prove that the intended real-world cohort is complete. Independent approval must
reconcile the declared cohort against its authoritative source population.

### Evaluation thresholds and approval criteria

`evaluation_config` requires `model_decision_threshold` and
`rules_decision_threshold`, each in `[0, 1]`.

`approval_criteria` requires all of these finite numeric fields:

| Field | Pass condition |
|---|---|
| `min_coverage` | coverage is at least the target |
| `min_precision` | model precision is at least the target |
| `min_recall` | model recall is at least the target |
| `min_pr_auc` | model PR-AUC is at least the target |
| `max_brier_score` | model Brier score is at most the target |
| `max_false_positive_rate` | model false-positive rate is at most the target |
| `min_precision_delta_vs_rules` | model minus rules precision is at least the target |
| `min_recall_delta_vs_rules` | model minus rules recall is at least the target |
| `max_mean_latency_ms` | mean observed latency is at most the target |
| `max_total_cost_usd` | total observed holdout cost is at most the target |

Coverage, metric, and calibration targets must be in `[0, 1]`; model-minus-rules
deltas must be in `[-1, 1]`; latency and cost limits must be non-negative.
Criteria must be selected and justified before results are inspected. Meeting
every criterion still yields `EVALUATED_NOT_APPROVED` and the unmet gate
`EXPLICIT_MODEL_APPROVAL_REQUIRED`.

## Output and metric definitions

The output schema is `scamdunk-model-evaluation-report/v1`.

- `NOT_VALIDATED`: input is absent, malformed, synthetic/fixture, missing a
  required class or partition, fails provenance/hash/temporal checks, or
  otherwise cannot support empirical validation. Contract failures return
  `metrics: null`. A valid fixture may contain metrics solely to test arithmetic,
  while `efficacy_claim_allowed` remains false.
- `EVALUATED_NOT_APPROVED`: valid real-world training references and temporal
  holdout produced metrics. This is still not an approval or enablement state.

`models_enabled`, `auto_enable_allowed`, and `efficacy_claim_allowed` are always
`false`. There is deliberately no `APPROVED` status and no code path that reads
this report into the runtime pipeline. `evaluation_artifact_sha256` is the
canonical SHA-256 of the complete report with that one field omitted. A later
approval record must bind this exact evaluation artifact rather than an
unidentified metrics file.

Malformed but valid JSON field shapes produce a newly sealed `NOT_VALIDATED`
report and command exit code `2`; they do not preserve a previous output file.

For the candidate and rules baseline, the report gives positive/negative counts,
TP/FP/FN/TN, precision, recall, false-positive rate, Brier score, and PR-AUC.
PR-AUC uses stepwise average precision: at each distinct score, the precision is
weighted by the increase in recall. Ties are processed as one score threshold.
Brier score is the mean squared difference between probability and binary label.
Non-empty ten-point calibration bins report their bounds, sample count, mean
score, and observed positive rate. The report also gives candidate-minus-rules
deltas.

Observed metadata reports sample count, mean and nearest-rank p95 latency, total
and mean cost, and mean and nearest-rank p95 uncertainty. The evaluator does not
estimate missing cost or latency.

## Current data blocker

The repository RF implementation and README identify synthetic training. No
immutable, real, labeled temporal holdout registry with independent label
provenance was supplied with this engineering task. Running unit fixtures proves
only evaluator behavior. It cannot produce an efficacy result for the existing
RF or LSTM artifacts, and both must remain disabled.
