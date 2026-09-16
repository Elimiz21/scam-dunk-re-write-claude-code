"""Contract tests for the bounded offline model evaluation gate."""

import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest

from offline_model_evaluation import evaluate, main


MODEL_HASH = "1" * 64
FEATURE_HASH = "2" * 64
TRAINING_HASH = "3" * 64


def _sha256(value):
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _provenance(kind="observed", suffix="prediction"):
    return {
        "source_type": kind,
        "source_id": f"source-{suffix}",
        "source_uri": f"db://immutable/{suffix}",
        "retrieved_at": "2026-07-15T12:00:00Z",
        "record_sha256": "4" * 64,
    }


def _row(
    row_id,
    ticker,
    partition,
    observed_at,
    label_available_at,
    label,
    model_score,
    rules_score,
    *,
    feature_cutoff=None,
    provenance_kind="observed",
    latency_ms=10.0,
    cost_usd=0.01,
    uncertainty=0.1,
):
    row = {
        "row_id": row_id,
        "ticker": ticker,
        "partition": partition,
        "observation_timestamp": observed_at,
        "feature_cutoff_timestamp": feature_cutoff or observed_at,
        "label_available_timestamp": label_available_at,
        "label": label,
        "model_score": model_score,
        "rules_score": rules_score,
        "uncertainty": uncertainty,
        "observed_latency_ms": latency_ms,
        "observed_cost_usd": cost_usd,
        "model_version": "rf-candidate-v1",
        "model_artifact_sha256": MODEL_HASH,
        "feature_contract_sha256": FEATURE_HASH,
        "training_dataset_sha256": TRAINING_HASH,
        "prediction_provenance": _provenance(provenance_kind, f"pred-{row_id}"),
        "label_provenance": _provenance(provenance_kind, f"label-{row_id}"),
    }
    row["row_sha256"] = _sha256(row)
    return row


def _exclusion():
    exclusion = {
        "exclusion_id": "excluded-1",
        "ticker": "MISS",
        "observation_timestamp": "2026-07-05T16:00:00Z",
        "reason_code": "NO_LABEL_WITHIN_WINDOW",
        "source_provenance": _provenance("fixture", "excluded-1"),
    }
    exclusion["row_sha256"] = _sha256(exclusion)
    return exclusion


def _payload(classification="FIXTURE"):
    rows = [
        _row(
            "train-1", "OLD1", "TRAIN", "2026-05-01T16:00:00Z",
            "2026-05-10T16:00:00Z", 1, 0.8, 0.7,
        ),
        _row(
            "train-2", "OLD2", "TRAIN", "2026-05-02T16:00:00Z",
            "2026-05-11T16:00:00Z", 0, 0.2, 0.3,
        ),
        _row(
            "holdout-1", "NEW1", "HOLDOUT", "2026-07-01T16:00:00Z",
            "2026-07-10T16:00:00Z", 1, 0.9, 0.6,
            latency_ms=10.0, cost_usd=0.01, uncertainty=0.1,
        ),
        _row(
            "holdout-2", "NEW2", "HOLDOUT", "2026-07-02T16:00:00Z",
            "2026-07-11T16:00:00Z", 0, 0.8, 0.4,
            latency_ms=20.0, cost_usd=0.02, uncertainty=0.2,
        ),
        _row(
            "holdout-3", "NEW3", "HOLDOUT", "2026-07-03T16:00:00Z",
            "2026-07-12T16:00:00Z", 1, 0.7, 0.4,
            latency_ms=30.0, cost_usd=0.03, uncertainty=0.3,
        ),
        _row(
            "holdout-4", "NEW4", "HOLDOUT", "2026-07-04T16:00:00Z",
            "2026-07-13T16:00:00Z", 0, 0.1, 0.3,
            latency_ms=40.0, cost_usd=0.04, uncertainty=0.4,
        ),
    ]
    if classification == "FIXTURE":
        for row in rows:
            row["prediction_provenance"]["source_type"] = "fixture"
            row["label_provenance"]["source_type"] = "fixture"
            row["row_sha256"] = _sha256({k: v for k, v in row.items() if k != "row_sha256"})
    exclusions = [_exclusion()] if classification == "FIXTURE" else []
    dataset_hash = _sha256({"rows": rows, "exclusions": exclusions})
    return {
        "schema_version": "scamdunk-model-evaluation/v1",
        "evaluation_run_id": "eval-2026-07-v1",
        "data_classification": classification,
        "holdout_cutoff": "2026-06-01T00:00:00Z",
        "manifest": {
            "model_version": "rf-candidate-v1",
            "model_artifact_sha256": MODEL_HASH,
            "feature_contract_sha256": FEATURE_HASH,
            "training_dataset_sha256": TRAINING_HASH,
            "evaluation_dataset_sha256": dataset_hash,
            "training_provenance": _provenance(
                "fixture" if classification == "FIXTURE" else "observed",
                "training-dataset",
            ),
        },
        "evaluation_config": {
            "model_decision_threshold": 0.5,
            "rules_decision_threshold": 0.5,
        },
        "approval_criteria": {
            "min_coverage": 0.75,
            "min_precision": 0.60,
            "min_recall": 0.90,
            "min_pr_auc": 0.80,
            "max_brier_score": 0.20,
            "max_false_positive_rate": 0.60,
            "min_precision_delta_vs_rules": -0.40,
            "min_recall_delta_vs_rules": 0.40,
            "max_mean_latency_ms": 30.0,
            "max_total_cost_usd": 0.20,
        },
        "rows": rows,
        "exclusions": exclusions,
    }


def _reseal(payload):
    for row in payload["rows"]:
        row["row_sha256"] = _sha256({k: v for k, v in row.items() if k != "row_sha256"})
    for row in payload["exclusions"]:
        row["row_sha256"] = _sha256({k: v for k, v in row.items() if k != "row_sha256"})
    payload["manifest"]["evaluation_dataset_sha256"] = _sha256(
        {"rows": payload["rows"], "exclusions": payload["exclusions"]}
    )


def _issue_codes(report):
    return {issue["code"] for issue in report["data_quality"]["issues"]}


def test_fixture_metrics_are_hand_derived_and_never_validate_efficacy():
    """Catches wrong confusion, AP, Brier, coverage, or observed-run aggregation."""
    report = evaluate(_payload())

    assert report["status"] == "NOT_VALIDATED"
    assert report["models_enabled"] is False
    assert report["auto_enable_allowed"] is False
    assert report["efficacy_claim_allowed"] is False
    assert report["data_quality"]["coverage"] == pytest.approx(0.8)
    assert report["data_quality"]["excluded_count"] == 1

    model = report["metrics"]["model"]
    assert model["positive_count"] == 2
    assert model["negative_count"] == 2
    assert model["true_positives"] == 2
    assert model["false_positives"] == 1
    assert model["false_negatives"] == 0
    assert model["true_negatives"] == 1
    assert model["precision"] == pytest.approx(2 / 3)
    assert model["recall"] == pytest.approx(1.0)
    assert model["pr_auc"] == pytest.approx(5 / 6)
    assert model["brier_score"] == pytest.approx(0.1875)
    assert model["false_positive_rate"] == pytest.approx(0.5)
    assert model["calibration_bins"] == [
        {
            "lower_bound": 0.1,
            "upper_bound": 0.2,
            "sample_count": 1,
            "mean_score": 0.1,
            "positive_rate": 0.0,
        },
        {
            "lower_bound": 0.7,
            "upper_bound": 0.8,
            "sample_count": 1,
            "mean_score": 0.7,
            "positive_rate": 1.0,
        },
        {
            "lower_bound": 0.8,
            "upper_bound": 0.9,
            "sample_count": 1,
            "mean_score": 0.8,
            "positive_rate": 0.0,
        },
        {
            "lower_bound": 0.9,
            "upper_bound": 1.0,
            "sample_count": 1,
            "mean_score": 0.9,
            "positive_rate": 1.0,
        },
    ]

    rules = report["metrics"]["rules_baseline"]
    comparison = report["metrics"]["model_vs_rules"]
    assert rules["precision"] == pytest.approx(1.0)
    assert rules["recall"] == pytest.approx(0.5)
    assert rules["brier_score"] == pytest.approx(0.1925)
    assert comparison["precision_delta"] == pytest.approx(-1 / 3)
    assert comparison["recall_delta"] == pytest.approx(0.5)

    observed = report["metrics"]["observed_metadata"]
    assert observed == {
        "sample_count": 4,
        "mean_latency_ms": 25.0,
        "p95_latency_ms": 40.0,
        "total_cost_usd": 0.1,
        "mean_cost_usd": 0.025,
        "mean_uncertainty": 0.25,
        "p95_uncertainty": 0.4,
    }
    assert "NON_REAL_EVALUATION_DATA" in report["unmet_gates"]


def test_valid_real_contract_stays_pending_explicit_approval():
    """Catches any metrics-driven path that enables or approves a model."""
    report = evaluate(_payload("REAL_WORLD"))

    assert report["status"] == "EVALUATED_NOT_APPROVED"
    assert report["data_quality"]["issues"] == []
    assert report["approval"]["all_criteria_met"] is True
    assert report["approval"]["explicit_approval_recorded"] is False
    assert report["approval"]["release_decision"] == "PENDING_EXPLICIT_APPROVAL"
    assert report["models_enabled"] is False
    assert report["auto_enable_allowed"] is False
    assert report["efficacy_claim_allowed"] is False
    artifact_hash = report["evaluation_artifact_sha256"]
    unhashed_report = {
        key: value
        for key, value in report.items()
        if key != "evaluation_artifact_sha256"
    }
    assert artifact_hash == _sha256(unhashed_report)
    assert "EXPLICIT_MODEL_APPROVAL_REQUIRED" in report["unmet_gates"]


def test_missing_real_holdout_returns_not_validated_without_metrics():
    """Catches accidental validation from training rows alone."""
    payload = _payload("REAL_WORLD")
    payload["rows"] = [row for row in payload["rows"] if row["partition"] == "TRAIN"]
    _reseal(payload)

    report = evaluate(payload)

    assert report["status"] == "NOT_VALIDATED"
    assert report["metrics"] is None
    assert "MISSING_HOLDOUT_ROWS" in _issue_codes(report)


def test_missing_and_invalid_provenance_are_rejected():
    """Catches treating an unknown source as observed evidence."""
    missing = _payload("REAL_WORLD")
    del missing["rows"][2]["label_provenance"]["source_uri"]
    _reseal(missing)
    missing_report = evaluate(missing)
    assert missing_report["metrics"] is None
    assert "MISSING_PROVENANCE" in _issue_codes(missing_report)

    invalid = _payload("REAL_WORLD")
    invalid["rows"][2]["prediction_provenance"]["source_uri"] = "not-a-uri"
    _reseal(invalid)
    invalid_report = evaluate(invalid)
    assert invalid_report["metrics"] is None
    assert "INVALID_PROVENANCE" in _issue_codes(invalid_report)


def test_synthetic_data_presented_as_real_is_rejected():
    """Catches relabeling synthetic predictions or labels as empirical evidence."""
    payload = _payload("REAL_WORLD")
    payload["rows"][2]["label_provenance"]["source_type"] = "synthetic"
    _reseal(payload)

    report = evaluate(payload)

    assert report["status"] == "NOT_VALIDATED"
    assert report["metrics"] is None
    assert "SYNTHETIC_AS_REAL" in _issue_codes(report)


def test_duplicate_observation_across_train_and_holdout_is_rejected():
    """Catches a duplicated security/time observation leaking across partitions."""
    payload = _payload("REAL_WORLD")
    payload["rows"][2]["ticker"] = payload["rows"][0]["ticker"]
    payload["rows"][2]["observation_timestamp"] = "2026-05-01T12:00:00-04:00"
    payload["rows"][2]["feature_cutoff_timestamp"] = "2026-05-01T12:00:00-04:00"
    _reseal(payload)

    report = evaluate(payload)

    assert report["metrics"] is None
    assert "DUPLICATE_OBSERVATION" in _issue_codes(report)


@pytest.mark.parametrize(
    ("mutate", "expected_code"),
    [
        (
            lambda payload: payload["rows"][0].update(
                {"label_available_timestamp": "2026-06-02T00:00:00Z"}
            ),
            "TRAIN_LABEL_AFTER_CUTOFF",
        ),
        (
            lambda payload: payload["rows"][2].update(
                {"feature_cutoff_timestamp": "2026-07-01T16:00:01Z"}
            ),
            "FUTURE_FEATURE_LEAKAGE",
        ),
        (
            lambda payload: payload["rows"][2].update(
                {"label_available_timestamp": "2026-07-01T16:00:00Z"}
            ),
            "HOLDOUT_LABEL_LEAKAGE",
        ),
        (
            lambda payload: payload["rows"][2].update(
                {"observation_timestamp": "2026-05-31T23:59:59Z",
                 "feature_cutoff_timestamp": "2026-05-31T23:59:59Z"}
            ),
            "TEMPORAL_PARTITION_VIOLATION",
        ),
    ],
)
def test_temporal_leakage_is_rejected(mutate, expected_code):
    """Catches labels or features crossing the declared as-of boundary."""
    payload = _payload("REAL_WORLD")
    mutate(payload)
    _reseal(payload)

    report = evaluate(payload)

    assert report["metrics"] is None
    assert expected_code in _issue_codes(report)


def test_manifest_binding_and_immutable_hashes_are_enforced():
    """Catches score rows being evaluated against a different release artifact."""
    mismatch = _payload("REAL_WORLD")
    mismatch["rows"][2]["model_artifact_sha256"] = "9" * 64
    _reseal(mismatch)
    mismatch_report = evaluate(mismatch)
    assert mismatch_report["metrics"] is None
    assert "MANIFEST_BINDING_MISMATCH" in _issue_codes(mismatch_report)

    row_tamper = _payload("REAL_WORLD")
    row_tamper["rows"][2]["model_score"] = 0.01
    row_tamper["manifest"]["evaluation_dataset_sha256"] = _sha256(
        {"rows": row_tamper["rows"], "exclusions": row_tamper["exclusions"]}
    )
    row_report = evaluate(row_tamper)
    assert row_report["metrics"] is None
    assert "ROW_HASH_MISMATCH" in _issue_codes(row_report)

    dataset_tamper = _payload("REAL_WORLD")
    dataset_tamper["manifest"]["evaluation_dataset_sha256"] = "8" * 64
    dataset_report = evaluate(dataset_tamper)
    assert dataset_report["metrics"] is None
    assert "EVALUATION_DATASET_HASH_MISMATCH" in _issue_codes(dataset_report)

    overlap = _payload("REAL_WORLD")
    overlap["manifest"]["training_dataset_sha256"] = overlap["manifest"][
        "evaluation_dataset_sha256"
    ]
    for row in overlap["rows"]:
        row["training_dataset_sha256"] = overlap["manifest"][
            "training_dataset_sha256"
        ]
        row["row_sha256"] = _sha256(
            {key: value for key, value in row.items() if key != "row_sha256"}
        )
    overlap_report = evaluate(overlap)
    assert overlap_report["metrics"] is None
    assert "TRAINING_EVALUATION_HASH_COLLISION" in _issue_codes(overlap_report)


def test_missing_observed_latency_or_cost_is_rejected():
    """Catches inferred runtime/cost figures replacing observed metadata."""
    payload = _payload("REAL_WORLD")
    del payload["rows"][2]["observed_cost_usd"]
    del payload["rows"][3]["observed_latency_ms"]
    _reseal(payload)

    report = evaluate(payload)

    assert report["metrics"] is None
    assert "MISSING_OBSERVED_METADATA" in _issue_codes(report)


def test_nonsensical_approval_criteria_are_reported_as_unmet():
    """Catches criteria that can pass only because their range is meaningless."""
    payload = _payload("REAL_WORLD")
    payload["approval_criteria"]["min_precision"] = -0.1

    report = evaluate(payload)

    assert report["status"] == "EVALUATED_NOT_APPROVED"
    assert report["approval"]["all_criteria_met"] is False
    assert report["approval"]["invalid_criteria"] == ["min_precision"]
    assert "INVALID_APPROVAL_CRITERIA" in report["unmet_gates"]


def test_cli_writes_machine_readable_report_and_never_enables(tmp_path: Path):
    """Catches a command path that diverges from the in-process gate."""
    input_path = tmp_path / "evaluation.json"
    output_path = tmp_path / "report.json"
    input_path.write_text(json.dumps(_payload()), encoding="utf-8")

    exit_code = main(["--input", str(input_path), "--output", str(output_path)])

    report = json.loads(output_path.read_text(encoding="utf-8"))
    assert exit_code == 2
    assert report["status"] == "NOT_VALIDATED"
    assert report["models_enabled"] is False
    assert report["auto_enable_allowed"] is False
