"""
Model file integrity verification using SHA-256 hashes.

Verifies model files against known-good hashes stored in model_hashes.json
before loading, to detect tampering that could lead to arbitrary code execution
via pickle/joblib deserialization.
"""

import hashlib
import json
import os
import logging

logger = logging.getLogger(__name__)

HASH_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_hashes.json")


def _compute_sha256(file_path: str) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_expected_hashes() -> dict:
    """Load expected hashes from model_hashes.json."""
    try:
        with open(HASH_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning(f"Could not load model hashes file: {e}")
        return {}


def _is_production() -> bool:
    env = os.environ.get("ENVIRONMENT", os.environ.get("RAILWAY_ENVIRONMENT", "")).strip().lower()
    return env in ("production", "prod")


def verify_model_file(file_path: str) -> bool:
    """
    Verify a model file's SHA-256 hash against the expected value.

    Returns True if:
      - The hash matches the expected value, OR
      - No expected hash is configured (null in model_hashes.json) AND we are
        not running in production (fail-open for local/dev only).

    Returns False if:
      - The hash does not match the expected value, OR
      - No expected hash is configured AND ENVIRONMENT=production (fail-closed):
        loading an unverified pickled artifact in production is an RCE risk.
    """
    expected_hashes = _load_expected_hashes()

    # Resolve relative key from the python_ai directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    abs_path = os.path.abspath(file_path)
    try:
        relative_key = os.path.relpath(abs_path, base_dir)
    except ValueError:
        relative_key = abs_path

    expected = expected_hashes.get(relative_key)
    if expected is None:
        if _is_production():
            logger.error(
                f"No SHA-256 hash configured for {relative_key} and ENVIRONMENT=production. "
                f"Refusing to load an unverified model artifact (fail-closed)."
            )
            return False
        logger.info(f"No hash configured for {relative_key}, skipping verification (non-production)")
        return True

    if not os.path.exists(file_path):
        logger.error(f"Model file not found: {file_path}")
        return False

    actual = _compute_sha256(file_path)
    if actual != expected:
        logger.error(
            f"Model file integrity check FAILED for {relative_key}: "
            f"expected {expected}, got {actual}"
        )
        return False

    logger.info(f"Model file integrity verified: {relative_key}")
    return True
