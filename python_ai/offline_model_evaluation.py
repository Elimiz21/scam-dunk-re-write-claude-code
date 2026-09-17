"""Bounded, offline empirical evaluation gate for disabled ML candidates.

This module only evaluates immutable prediction/label records.  It does not
train, load, deploy, approve, or enable a model and performs no network I/O.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urlparse


SCHEMA_VERSION = "scamdunk-model-evaluation/v1"
REPORT_SCHEMA_VERSION = "scamdunk-model-evaluation-report/v1"
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_SOURCE_TYPES = {"observed", "synthetic", "fixture"}
REQUIRED_PROVENANCE_FIELDS = {
    "source_type",
    "source_id",
    "source_uri",
    "retrieved_at",
    "record_sha256",
}
REQUIRED_APPROVAL_CRITERIA = {
    "min_coverage",
    "min_precision",
    "min_recall",
    "min_pr_auc",
    "max_brier_score",
    "max_false_positive_rate",
    "min_precision_delta_vs_rules",
    "min_recall_delta_vs_rules",
    "max_mean_latency_ms",
    "max_total_cost_usd",
}
UNIT_INTERVAL_APPROVAL_CRITERIA = {
    "min_coverage",
    "min_precision",
    "min_recall",
    "min_pr_auc",
    "max_brier_score",
    "max_false_positive_rate",
}
DELTA_APPROVAL_CRITERIA = {
    "min_precision_delta_vs_rules",
    "min_recall_delta_vs_rules",
}
NONNEGATIVE_APPROVAL_CRITERIA = {
    "max_mean_latency_ms",
    "max_total_cost_usd",
}


def _canonical_sha256(value: Any) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _without_row_hash(row: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key != "row_sha256"}


def _issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_binary_label(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value in (0, 1)


def _observation_key(ticker: str, observed: datetime) -> tuple[str, str]:
    return (
        ticker.strip().upper(),
        observed.astimezone(timezone.utc).isoformat(),
    )


def _parse_timestamp(
    value: Any,
    path: str,
    issues: list[dict[str, str]],
) -> datetime | None:
    if not isinstance(value, str) or not value:
        issues.append(_issue("INVALID_TIMESTAMP", path, "must be a non-empty ISO-8601 timestamp"))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        issues.append(_issue("INVALID_TIMESTAMP", path, "must be a valid ISO-8601 timestamp"))
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        issues.append(_issue("INVALID_TIMESTAMP", path, "must include a UTC offset"))
        return None
    return parsed


def _validate_hash(
    value: Any,
    path: str,
    issues: list[dict[str, str]],
    code: str = "INVALID_HASH",
) -> bool:
    if not isinstance(value, str) or HASH_PATTERN.fullmatch(value) is None:
        issues.append(_issue(code, path, "must be a lowercase 64-character SHA-256 hex digest"))
        return False
    return True


def _validate_provenance(
    provenance: Any,
    path: str,
    classification: str,
    issues: list[dict[str, str]],
) -> None:
    if not isinstance(provenance, Mapping):
        issues.append(_issue("MISSING_PROVENANCE", path, "must be a provenance object"))
        return

    missing = sorted(REQUIRED_PROVENANCE_FIELDS - set(provenance))
    if missing:
        issues.append(
            _issue(
                "MISSING_PROVENANCE",
                path,
                f"missing required fields: {', '.join(missing)}",
            )
        )
        return

    source_type = provenance.get("source_type")
    if not isinstance(source_type, str) or source_type not in ALLOWED_SOURCE_TYPES:
        issues.append(
            _issue(
                "INVALID_PROVENANCE",
                f"{path}.source_type",
                "must be observed, synthetic, or fixture",
            )
        )
    elif classification == "REAL_WORLD" and source_type != "observed":
        issues.append(
            _issue(
                "SYNTHETIC_AS_REAL",
                f"{path}.source_type",
                "real-world evaluation may contain only observed provenance",
            )
        )
    elif classification == "FIXTURE" and source_type == "observed":
        issues.append(
            _issue(
                "FIXTURE_AS_OBSERVED",
                f"{path}.source_type",
                "fixture evaluation must not describe its source as observed",
            )
        )

    source_id = provenance.get("source_id")
    if not isinstance(source_id, str) or not source_id.strip():
        issues.append(
            _issue("INVALID_PROVENANCE", f"{path}.source_id", "must be a non-empty source identifier")
        )

    source_uri = provenance.get("source_uri")
    try:
        parsed_uri = urlparse(source_uri) if isinstance(source_uri, str) else None
    except ValueError:
        parsed_uri = None
    if parsed_uri is None or not parsed_uri.scheme or not (parsed_uri.netloc or parsed_uri.path):
        issues.append(
            _issue("INVALID_PROVENANCE", f"{path}.source_uri", "must be an absolute source URI")
        )

    _parse_timestamp(provenance.get("retrieved_at"), f"{path}.retrieved_at", issues)
    _validate_hash(provenance.get("record_sha256"), f"{path}.record_sha256", issues)


def _validate_probability(
    value: Any,
    path: str,
    issues: list[dict[str, str]],
) -> None:
    if not _is_number(value) or not 0.0 <= float(value) <= 1.0:
        issues.append(_issue("INVALID_PROBABILITY", path, "must be a finite number from 0 through 1"))


def _validate_nonnegative_number(
    value: Any,
    path: str,
    issues: list[dict[str, str]],
    missing_code: str = "MISSING_OBSERVED_METADATA",
) -> None:
    if value is None:
        issues.append(_issue(missing_code, path, "is required observed metadata"))
    elif not _is_number(value) or float(value) < 0:
        issues.append(_issue("INVALID_OBSERVED_METADATA", path, "must be a finite non-negative number"))


def _validate_manifest(
    manifest: Any,
    issues: list[dict[str, str]],
    classification: str,
) -> Mapping[str, Any]:
    if not isinstance(manifest, Mapping):
        issues.append(_issue("MISSING_MANIFEST", "manifest", "must be a release manifest object"))
        return {}

    model_version = manifest.get("model_version")
    if not isinstance(model_version, str) or not model_version.strip():
        issues.append(_issue("INVALID_MANIFEST", "manifest.model_version", "must be non-empty"))
    for field in (
        "model_artifact_sha256",
        "feature_contract_sha256",
        "training_dataset_sha256",
        "evaluation_dataset_sha256",
    ):
        _validate_hash(manifest.get(field), f"manifest.{field}", issues)
    _validate_provenance(
        manifest.get("training_provenance"),
        "manifest.training_provenance",
        classification,
        issues,
    )
    return manifest


def _validate_exclusions(
    exclusions: Any,
    cutoff: datetime | None,
    evaluated_observations: Mapping[tuple[str, str], str],
    classification: str,
    issues: list[dict[str, str]],
) -> list[Mapping[str, Any]]:
    if not isinstance(exclusions, list):
        issues.append(_issue("INVALID_EXCLUSIONS", "exclusions", "must be an array"))
        return []
    valid: list[Mapping[str, Any]] = []
    seen_ids: set[str] = set()
    seen_observations: dict[tuple[str, str], str] = {}
    for index, exclusion in enumerate(exclusions):
        path = f"exclusions[{index}]"
        if not isinstance(exclusion, Mapping):
            issues.append(_issue("INVALID_EXCLUSION", path, "must be an object"))
            continue
        valid.append(exclusion)
        exclusion_id = exclusion.get("exclusion_id")
        if not isinstance(exclusion_id, str) or not exclusion_id.strip():
            issues.append(_issue("INVALID_EXCLUSION", f"{path}.exclusion_id", "must be non-empty"))
        elif exclusion_id in seen_ids:
            issues.append(_issue("DUPLICATE_EXCLUSION", f"{path}.exclusion_id", "must be unique"))
        else:
            seen_ids.add(exclusion_id)
        for field in ("ticker", "reason_code"):
            if not isinstance(exclusion.get(field), str) or not exclusion[field].strip():
                issues.append(_issue("INVALID_EXCLUSION", f"{path}.{field}", "must be non-empty"))
        observed = _parse_timestamp(
            exclusion.get("observation_timestamp"),
            f"{path}.observation_timestamp",
            issues,
        )
        ticker = exclusion.get("ticker")
        if isinstance(ticker, str) and ticker.strip() and observed is not None:
            natural_key = _observation_key(ticker, observed)
            if natural_key in evaluated_observations:
                issues.append(
                    _issue(
                        "EXCLUSION_EVALUATED_OVERLAP",
                        path,
                        f"overlaps evaluated {evaluated_observations[natural_key]}",
                    )
                )
            if natural_key in seen_observations:
                issues.append(
                    _issue(
                        "DUPLICATE_EXCLUSION_OBSERVATION",
                        path,
                        f"duplicates {seen_observations[natural_key]}",
                    )
                )
            else:
                seen_observations[natural_key] = path
        if cutoff is not None and observed is not None and observed < cutoff:
            issues.append(
                _issue(
                    "EXCLUSION_BEFORE_HOLDOUT_CUTOFF",
                    f"{path}.observation_timestamp",
                    "exclusion observation must be on or after the holdout cutoff",
                )
            )
        _validate_provenance(
            exclusion.get("source_provenance"),
            f"{path}.source_provenance",
            classification,
            issues,
        )
        declared_hash = exclusion.get("row_sha256")
        if _validate_hash(declared_hash, f"{path}.row_sha256", issues):
            actual_hash = _canonical_sha256(_without_row_hash(exclusion))
            if declared_hash != actual_hash:
                issues.append(
                    _issue("ROW_HASH_MISMATCH", f"{path}.row_sha256", "does not match exclusion content")
                )
    return valid


def _validate_rows(
    rows: Any,
    cutoff: datetime | None,
    manifest: Mapping[str, Any],
    classification: str,
    issues: list[dict[str, str]],
) -> tuple[
    list[Mapping[str, Any]],
    list[Mapping[str, Any]],
    dict[tuple[str, str], str],
]:
    if not isinstance(rows, list):
        issues.append(_issue("INVALID_ROWS", "rows", "must be an array"))
        return [], [], {}

    training_rows: list[Mapping[str, Any]] = []
    holdout_rows: list[Mapping[str, Any]] = []
    seen_ids: set[str] = set()
    seen_observations: dict[tuple[str, str], str] = {}

    for index, row in enumerate(rows):
        path = f"rows[{index}]"
        if not isinstance(row, Mapping):
            issues.append(_issue("INVALID_ROW", path, "must be an object"))
            continue

        row_id = row.get("row_id")
        if not isinstance(row_id, str) or not row_id.strip():
            issues.append(_issue("INVALID_ROW", f"{path}.row_id", "must be non-empty"))
        elif row_id in seen_ids:
            issues.append(_issue("DUPLICATE_ROW_ID", f"{path}.row_id", "must be unique"))
        else:
            seen_ids.add(row_id)

        ticker = row.get("ticker")
        if not isinstance(ticker, str) or not ticker.strip():
            issues.append(_issue("INVALID_ROW", f"{path}.ticker", "must be non-empty"))

        observed_raw = row.get("observation_timestamp")
        observed = _parse_timestamp(observed_raw, f"{path}.observation_timestamp", issues)
        feature_cutoff = _parse_timestamp(
            row.get("feature_cutoff_timestamp"), f"{path}.feature_cutoff_timestamp", issues
        )
        label_available = _parse_timestamp(
            row.get("label_available_timestamp"), f"{path}.label_available_timestamp", issues
        )

        if isinstance(ticker, str) and ticker.strip() and observed is not None:
            natural_key = _observation_key(ticker, observed)
            if natural_key in seen_observations:
                issues.append(
                    _issue(
                        "DUPLICATE_OBSERVATION",
                        path,
                        f"duplicates {seen_observations[natural_key]} for ticker and observation timestamp",
                    )
                )
            else:
                seen_observations[natural_key] = path

        partition = row.get("partition")
        if partition == "TRAIN":
            training_rows.append(row)
        elif partition == "HOLDOUT":
            holdout_rows.append(row)
        else:
            issues.append(_issue("INVALID_PARTITION", f"{path}.partition", "must be TRAIN or HOLDOUT"))

        if not _is_binary_label(row.get("label")):
            issues.append(_issue("INVALID_LABEL", f"{path}.label", "must be integer 0 or 1"))
        for field in ("model_score", "rules_score", "uncertainty"):
            _validate_probability(row.get(field), f"{path}.{field}", issues)
        _validate_nonnegative_number(row.get("observed_latency_ms"), f"{path}.observed_latency_ms", issues)
        _validate_nonnegative_number(row.get("observed_cost_usd"), f"{path}.observed_cost_usd", issues)

        for field in (
            "model_version",
            "model_artifact_sha256",
            "feature_contract_sha256",
            "training_dataset_sha256",
        ):
            expected = manifest.get(field)
            actual = row.get(field)
            if actual != expected:
                issues.append(
                    _issue(
                        "MANIFEST_BINDING_MISMATCH",
                        f"{path}.{field}",
                        f"must equal manifest.{field}",
                    )
                )

        _validate_provenance(
            row.get("prediction_provenance"),
            f"{path}.prediction_provenance",
            classification,
            issues,
        )
        _validate_provenance(
            row.get("label_provenance"),
            f"{path}.label_provenance",
            classification,
            issues,
        )

        declared_hash = row.get("row_sha256")
        if _validate_hash(declared_hash, f"{path}.row_sha256", issues):
            actual_hash = _canonical_sha256(_without_row_hash(row))
            if declared_hash != actual_hash:
                issues.append(
                    _issue("ROW_HASH_MISMATCH", f"{path}.row_sha256", "does not match row content")
                )

        if observed is not None and feature_cutoff is not None and feature_cutoff > observed:
            issues.append(
                _issue(
                    "FUTURE_FEATURE_LEAKAGE",
                    f"{path}.feature_cutoff_timestamp",
                    "features must be available no later than the prediction observation",
                )
            )

        if cutoff is None or observed is None or label_available is None:
            continue
        if partition == "TRAIN":
            if observed >= cutoff:
                issues.append(
                    _issue(
                        "TEMPORAL_PARTITION_VIOLATION",
                        f"{path}.observation_timestamp",
                        "training observation must precede the holdout cutoff",
                    )
                )
            if label_available > cutoff:
                issues.append(
                    _issue(
                        "TRAIN_LABEL_AFTER_CUTOFF",
                        f"{path}.label_available_timestamp",
                        "training labels must be available by the holdout cutoff",
                    )
                )
        elif partition == "HOLDOUT":
            if observed < cutoff:
                issues.append(
                    _issue(
                        "TEMPORAL_PARTITION_VIOLATION",
                        f"{path}.observation_timestamp",
                        "holdout observation must be on or after the holdout cutoff",
                    )
                )
            if label_available <= observed:
                issues.append(
                    _issue(
                        "HOLDOUT_LABEL_LEAKAGE",
                        f"{path}.label_available_timestamp",
                        "holdout outcome label must become available after prediction",
                    )
                )

    return training_rows, holdout_rows, seen_observations


def _average_precision(labels: Sequence[int], scores: Sequence[float]) -> float:
    positives = sum(labels)
    if positives == 0:
        raise ValueError("average precision requires at least one positive")
    ranked = sorted(zip(scores, labels), key=lambda item: item[0], reverse=True)
    average_precision = 0.0
    previous_recall = 0.0
    true_positives = 0
    false_positives = 0
    index = 0
    while index < len(ranked):
        score = ranked[index][0]
        while index < len(ranked) and ranked[index][0] == score:
            if ranked[index][1] == 1:
                true_positives += 1
            else:
                false_positives += 1
            index += 1
        recall = true_positives / positives
        precision = true_positives / (true_positives + false_positives)
        average_precision += (recall - previous_recall) * precision
        previous_recall = recall
    return average_precision


def _binary_metrics(
    labels: Sequence[int],
    scores: Sequence[float],
    threshold: float,
) -> dict[str, Any]:
    predictions = [1 if score >= threshold else 0 for score in scores]
    true_positives = sum(prediction == 1 and label == 1 for prediction, label in zip(predictions, labels))
    false_positives = sum(prediction == 1 and label == 0 for prediction, label in zip(predictions, labels))
    false_negatives = sum(prediction == 0 and label == 1 for prediction, label in zip(predictions, labels))
    true_negatives = sum(prediction == 0 and label == 0 for prediction, label in zip(predictions, labels))
    predicted_positives = true_positives + false_positives
    actual_positives = true_positives + false_negatives
    actual_negatives = true_negatives + false_positives
    return {
        "threshold": threshold,
        "positive_count": actual_positives,
        "negative_count": actual_negatives,
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "true_negatives": true_negatives,
        "precision": true_positives / predicted_positives if predicted_positives else None,
        "recall": true_positives / actual_positives if actual_positives else None,
        "pr_auc": _average_precision(labels, scores),
        "pr_auc_method": "average_precision_step",
        "brier_score": sum((score - label) ** 2 for score, label in zip(scores, labels)) / len(labels),
        "calibration_bins": _calibration_bins(labels, scores),
        "false_positive_rate": false_positives / actual_negatives if actual_negatives else None,
    }


def _calibration_bins(
    labels: Sequence[int],
    scores: Sequence[float],
    bin_count: int = 10,
) -> list[dict[str, Any]]:
    buckets: dict[int, list[tuple[float, int]]] = {}
    for score, label in zip(scores, labels):
        index = min(int(score * bin_count), bin_count - 1)
        buckets.setdefault(index, []).append((score, label))
    return [
        {
            "lower_bound": round(index / bin_count, 12),
            "upper_bound": round((index + 1) / bin_count, 12),
            "sample_count": len(bucket),
            "mean_score": sum(score for score, _ in bucket) / len(bucket),
            "positive_rate": sum(label for _, label in bucket) / len(bucket),
        }
        for index, bucket in sorted(buckets.items())
    ]


def _nearest_rank_percentile(values: Iterable[float], percentile: float) -> float:
    ordered = sorted(float(value) for value in values)
    index = max(0, math.ceil(percentile * len(ordered)) - 1)
    return ordered[index]


def _observed_metadata(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    latencies = [float(row["observed_latency_ms"]) for row in rows]
    costs = [float(row["observed_cost_usd"]) for row in rows]
    uncertainties = [float(row["uncertainty"]) for row in rows]
    return {
        "sample_count": len(rows),
        "mean_latency_ms": sum(latencies) / len(latencies),
        "p95_latency_ms": _nearest_rank_percentile(latencies, 0.95),
        "total_cost_usd": round(sum(costs), 12),
        "mean_cost_usd": sum(costs) / len(costs),
        "mean_uncertainty": sum(uncertainties) / len(uncertainties),
        "p95_uncertainty": _nearest_rank_percentile(uncertainties, 0.95),
    }


def _comparison(model: Mapping[str, Any], rules: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "precision_delta": _difference(model["precision"], rules["precision"]),
        "recall_delta": _difference(model["recall"], rules["recall"]),
        "pr_auc_delta": _difference(model["pr_auc"], rules["pr_auc"]),
        "brier_score_delta": _difference(model["brier_score"], rules["brier_score"]),
        "false_positive_rate_delta": _difference(
            model["false_positive_rate"], rules["false_positive_rate"]
        ),
    }


def _difference(left: Any, right: Any) -> float | None:
    if left is None or right is None:
        return None
    return float(left) - float(right)


def _approval_result(
    criteria: Any,
    coverage: float | None,
    metrics: Mapping[str, Any] | None,
) -> tuple[dict[str, Any], list[str]]:
    if not isinstance(criteria, Mapping):
        return (
            {
                "criteria_results": {},
                "all_criteria_met": False,
                "explicit_approval_recorded": False,
                "release_decision": "PENDING_EXPLICIT_APPROVAL",
            },
            ["MISSING_APPROVAL_CRITERIA", "EXPLICIT_MODEL_APPROVAL_REQUIRED"],
        )

    missing = sorted(REQUIRED_APPROVAL_CRITERIA - set(criteria))
    invalid = [
        key
        for key in REQUIRED_APPROVAL_CRITERIA & set(criteria)
        if not _valid_approval_criterion(key, criteria[key])
    ]
    criteria_results: dict[str, Any] = {}
    if metrics is not None and not missing and not invalid:
        model = metrics["model"]
        delta = metrics["model_vs_rules"]
        observed = metrics["observed_metadata"]
        observed_values = {
            "min_coverage": coverage,
            "min_precision": model["precision"],
            "min_recall": model["recall"],
            "min_pr_auc": model["pr_auc"],
            "max_brier_score": model["brier_score"],
            "max_false_positive_rate": model["false_positive_rate"],
            "min_precision_delta_vs_rules": delta["precision_delta"],
            "min_recall_delta_vs_rules": delta["recall_delta"],
            "max_mean_latency_ms": observed["mean_latency_ms"],
            "max_total_cost_usd": observed["total_cost_usd"],
        }
        for key in sorted(REQUIRED_APPROVAL_CRITERIA):
            observed_value = observed_values[key]
            target = float(criteria[key])
            passed = False
            if observed_value is not None:
                passed = (
                    float(observed_value) <= target
                    if key.startswith("max_")
                    else float(observed_value) >= target
                )
            criteria_results[key] = {
                "target": target,
                "observed": observed_value,
                "passed": passed,
            }

    all_met = bool(criteria_results) and all(
        result["passed"] for result in criteria_results.values()
    )
    gates: list[str] = []
    if missing:
        gates.append("MISSING_APPROVAL_CRITERIA")
    if invalid:
        gates.append("INVALID_APPROVAL_CRITERIA")
    if criteria_results and not all_met:
        gates.append("EMPIRICAL_CRITERIA_NOT_MET")
    gates.append("EXPLICIT_MODEL_APPROVAL_REQUIRED")
    return (
        {
            "criteria_results": criteria_results,
            "missing_criteria": missing,
            "invalid_criteria": sorted(invalid),
            "all_criteria_met": all_met,
            "explicit_approval_recorded": False,
            "release_decision": "PENDING_EXPLICIT_APPROVAL",
        },
        gates,
    )


def _valid_approval_criterion(key: str, value: Any) -> bool:
    if not _is_number(value):
        return False
    numeric = float(value)
    if key in UNIT_INTERVAL_APPROVAL_CRITERIA:
        return 0.0 <= numeric <= 1.0
    if key in DELTA_APPROVAL_CRITERIA:
        return -1.0 <= numeric <= 1.0
    if key in NONNEGATIVE_APPROVAL_CRITERIA:
        return numeric >= 0.0
    return False


def evaluate(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Validate a sealed temporal dataset and calculate offline metrics.

    A successful empirical calculation still returns EVALUATED_NOT_APPROVED.
    The evaluator has no approved/enabled state and cannot change runtime state.
    """
    issues: list[dict[str, str]] = []
    if not isinstance(payload, Mapping):
        payload = {}
        issues.append(_issue("INVALID_PAYLOAD", "$", "input must be a JSON object"))

    if payload.get("schema_version") != SCHEMA_VERSION:
        issues.append(_issue("INVALID_SCHEMA_VERSION", "schema_version", f"must equal {SCHEMA_VERSION}"))

    run_id = payload.get("evaluation_run_id")
    if not isinstance(run_id, str) or not run_id.strip():
        issues.append(_issue("INVALID_RUN_ID", "evaluation_run_id", "must be non-empty"))

    classification = payload.get("data_classification")
    if not isinstance(classification, str) or classification not in {"REAL_WORLD", "FIXTURE"}:
        issues.append(
            _issue(
                "INVALID_DATA_CLASSIFICATION",
                "data_classification",
                "must be REAL_WORLD or FIXTURE",
            )
        )
        classification = "UNKNOWN"

    cutoff = _parse_timestamp(payload.get("holdout_cutoff"), "holdout_cutoff", issues)
    manifest = _validate_manifest(payload.get("manifest"), issues, classification)
    training_rows, holdout_rows, evaluated_observations = _validate_rows(
        payload.get("rows"), cutoff, manifest, classification, issues
    )
    exclusions = _validate_exclusions(
        payload.get("exclusions", []),
        cutoff,
        evaluated_observations,
        classification,
        issues,
    )

    rows_for_hash = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    exclusions_for_hash = payload.get("exclusions", [])
    if not isinstance(exclusions_for_hash, list):
        exclusions_for_hash = []
    actual_dataset_hash = _canonical_sha256(
        {"rows": rows_for_hash, "exclusions": exclusions_for_hash}
    )
    declared_dataset_hash = manifest.get("evaluation_dataset_sha256")
    if (
        isinstance(declared_dataset_hash, str)
        and declared_dataset_hash == manifest.get("training_dataset_sha256")
    ):
        issues.append(
            _issue(
                "TRAINING_EVALUATION_HASH_COLLISION",
                "manifest.evaluation_dataset_sha256",
                "evaluation dataset must be distinct from the training dataset",
            )
        )
    if isinstance(declared_dataset_hash, str) and declared_dataset_hash != actual_dataset_hash:
        issues.append(
            _issue(
                "EVALUATION_DATASET_HASH_MISMATCH",
                "manifest.evaluation_dataset_sha256",
                "does not match the sealed rows and exclusions",
            )
        )

    if not training_rows:
        issues.append(_issue("MISSING_TRAINING_ROWS", "rows", "at least one TRAIN row is required"))
    if not holdout_rows:
        issues.append(_issue("MISSING_HOLDOUT_ROWS", "rows", "at least one HOLDOUT row is required"))
    else:
        valid_holdout_labels = [
            row.get("label")
            for row in holdout_rows
            if _is_binary_label(row.get("label"))
        ]
    if (
        holdout_rows
        and len(valid_holdout_labels) == len(holdout_rows)
        and set(valid_holdout_labels) != {0, 1}
    ):
        issues.append(
            _issue(
                "HOLDOUT_CLASS_MISSING",
                "rows",
                "holdout must contain at least one positive and one negative label",
            )
        )

    config = payload.get("evaluation_config")
    if not isinstance(config, Mapping):
        issues.append(_issue("MISSING_EVALUATION_CONFIG", "evaluation_config", "must be an object"))
        config = {}
    for field in ("model_decision_threshold", "rules_decision_threshold"):
        _validate_probability(config.get(field), f"evaluation_config.{field}", issues)

    candidate_count = len(holdout_rows) + len(exclusions)
    coverage = (
        len(holdout_rows) / candidate_count
        if not issues and candidate_count
        else None
    )
    metrics: dict[str, Any] | None = None
    if not issues:
        labels = [int(row["label"]) for row in holdout_rows]
        model = _binary_metrics(
            labels,
            [float(row["model_score"]) for row in holdout_rows],
            float(config["model_decision_threshold"]),
        )
        rules = _binary_metrics(
            labels,
            [float(row["rules_score"]) for row in holdout_rows],
            float(config["rules_decision_threshold"]),
        )
        metrics = {
            "model": model,
            "rules_baseline": rules,
            "model_vs_rules": _comparison(model, rules),
            "observed_metadata": _observed_metadata(holdout_rows),
        }

    approval, approval_gates = _approval_result(
        payload.get("approval_criteria"), coverage, metrics
    )
    unmet_gates = list(approval_gates)
    if issues:
        unmet_gates.insert(0, "DATA_CONTRACT_INVALID")
    if classification != "REAL_WORLD":
        unmet_gates.insert(0, "NON_REAL_EVALUATION_DATA")
    unmet_gates = list(dict.fromkeys(unmet_gates))

    status = (
        "EVALUATED_NOT_APPROVED"
        if classification == "REAL_WORLD" and metrics is not None
        else "NOT_VALIDATED"
    )
    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "evaluation_run_id": run_id,
        "status": status,
        "models_enabled": False,
        "auto_enable_allowed": False,
        "efficacy_claim_allowed": False,
        "manifest_binding": {
            "model_version": manifest.get("model_version"),
            "model_artifact_sha256": manifest.get("model_artifact_sha256"),
            "feature_contract_sha256": manifest.get("feature_contract_sha256"),
            "training_dataset_sha256": manifest.get("training_dataset_sha256"),
            "evaluation_dataset_sha256": manifest.get("evaluation_dataset_sha256"),
            "computed_evaluation_dataset_sha256": actual_dataset_hash,
        },
        "data_quality": {
            "classification": classification,
            "training_count": len(training_rows),
            "holdout_candidate_count": candidate_count if not issues else None,
            "evaluated_count": len(holdout_rows) if metrics is not None else 0,
            "excluded_count": len(exclusions),
            "coverage": coverage,
            "exclusions_by_reason": _count_exclusions(exclusions),
            "issues": issues,
        },
        "metrics": metrics,
        "approval": approval,
        "unmet_gates": unmet_gates,
    }
    return _seal_report(report)


def _count_exclusions(exclusions: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for exclusion in exclusions:
        reason = exclusion.get("reason_code")
        if isinstance(reason, str):
            counts[reason] = counts.get(reason, 0) + 1
    return dict(sorted(counts.items()))


def _invalid_input_report(message: str) -> dict[str, Any]:
    return _seal_report({
        "schema_version": REPORT_SCHEMA_VERSION,
        "evaluation_run_id": None,
        "status": "NOT_VALIDATED",
        "models_enabled": False,
        "auto_enable_allowed": False,
        "efficacy_claim_allowed": False,
        "manifest_binding": {},
        "data_quality": {
            "classification": "UNKNOWN",
            "training_count": 0,
            "holdout_candidate_count": 0,
            "evaluated_count": 0,
            "excluded_count": 0,
            "coverage": 0.0,
            "exclusions_by_reason": {},
            "issues": [_issue("INVALID_INPUT_JSON", "$", message)],
        },
        "metrics": None,
        "approval": {
            "criteria_results": {},
            "all_criteria_met": False,
            "explicit_approval_recorded": False,
            "release_decision": "PENDING_EXPLICIT_APPROVAL",
        },
        "unmet_gates": [
            "DATA_CONTRACT_INVALID",
            "EXPLICIT_MODEL_APPROVAL_REQUIRED",
        ],
    })


def _seal_report(report: dict[str, Any]) -> dict[str, Any]:
    report["evaluation_artifact_sha256"] = _canonical_sha256(report)
    return report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate a sealed model holdout without training or enabling models."
    )
    parser.add_argument("--input", required=True, help="sealed evaluation JSON")
    parser.add_argument("--output", required=True, help="path for the evaluation report JSON")
    args = parser.parse_args(argv)

    try:
        payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        report = evaluate(payload)
    except (OSError, json.JSONDecodeError, TypeError, ValueError, OverflowError) as exc:
        report = _invalid_input_report(str(exc))

    Path(args.output).write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0 if report["status"] == "EVALUATED_NOT_APPROVED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
