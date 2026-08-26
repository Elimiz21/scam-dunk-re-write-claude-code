"""
Regression tests for the audit fixes:

PY-C1  RF feature contract: training and serving feature vectors must be
       identical in name, order, and count (and match config.RF_FEATURE_NAMES).
PY-C4  OTC exchange detection must fire for the real Yahoo/yfinance codes
       (PNK / OQX / OQB / GREY / "Other OTC").
PY-H3  A purely-structural signal stack must cap at MEDIUM (not HIGH).
PY-H8  Thin price history must return INSUFFICIENT / data_available=False.
PY-C2  ML models are disabled by default (rule-based scoring only).
"""

import sys
import numpy as np
import pandas as pd

sys.path.insert(0, '.')

from config import RF_FEATURE_NAMES, is_otc_exchange
import feature_engineering as fe
from data_ingestion import (
    generate_synthetic_stock_data,
    preprocess_price_data,
    get_stock_fundamentals,
    check_sec_flagged_list,
)
from ml_model import ScamDetectorRF
from pipeline import ScamDetectionPipeline, ml_models_enabled


# ---------------------------------------------------------------------------
# PY-C1: feature contract
# ---------------------------------------------------------------------------

def _serving_vector():
    df = generate_synthetic_stock_data('TEST', days=60)
    df = preprocess_price_data(df)
    df = fe.engineer_all_features(df)
    fund = get_stock_fundamentals('TEST', use_synthetic=True)
    sec = check_sec_flagged_list('TEST')
    return fe.create_feature_vector(df, fund, sec)


def test_serving_vector_matches_contract():
    vec, names = _serving_vector()
    assert names == list(RF_FEATURE_NAMES)
    assert len(vec) == len(RF_FEATURE_NAMES)


def test_training_vector_matches_contract():
    det = ScamDetectorRF()
    X, y, names = det.generate_synthetic_training_data(n_scam_samples=5, n_normal_samples=5)
    assert names == list(RF_FEATURE_NAMES)
    assert X.shape[1] == len(RF_FEATURE_NAMES)


def test_training_and_serving_vectors_are_aligned():
    _, serve_names = _serving_vector()
    det = ScamDetectorRF()
    _, _, train_names = det.generate_synthetic_training_data(n_scam_samples=2, n_normal_samples=2)
    assert train_names == serve_names


def test_trained_rf_predicts_on_serving_vector_without_mismatch():
    """The historical bug raised ValueError (49 vs 35) and forced prob=0.0."""
    det = ScamDetectorRF()
    det.train()
    vec, _ = _serving_vector()
    prob, pred = det.predict_scam_probability(vec)
    assert 0.0 <= prob <= 1.0
    # feature_names persisted on the model must match the contract
    assert list(det.feature_names) == list(RF_FEATURE_NAMES)


# ---------------------------------------------------------------------------
# PY-C4: OTC exchange detection (real Yahoo strings)
# ---------------------------------------------------------------------------

def test_otc_detection_real_yahoo_codes():
    for code in ['PNK', 'OQX', 'OQB', 'GREY', 'GRAY']:
        assert is_otc_exchange(code) is True, f"{code} should be OTC"


def test_otc_detection_descriptive_names():
    assert is_otc_exchange('Other OTC') is True
    assert is_otc_exchange('OTC Markets') is True
    assert is_otc_exchange('Pink Sheets') is True


def test_non_otc_exchanges_not_flagged():
    for code in ['NMS', 'NYQ', 'NASDAQ', 'NYSE', 'NGM', '', None]:
        assert is_otc_exchange(code) is False, f"{code} should NOT be OTC"


def test_otc_detection_across_multiple_fields():
    # exchange code clean but fullExchangeName/quoteType indicate OTC
    assert is_otc_exchange('UNKNOWN', 'Other OTC', 'EQUITY') is True


def test_pipeline_fires_otc_signal_for_pnk_exchange():
    """A stock reporting the Yahoo 'PNK' code must produce an OTC_EXCHANGE signal."""
    p = ScamDetectionPipeline(load_models=False)
    n = 60
    df = pd.DataFrame({
        'Date': pd.date_range('2024-01-01', periods=n),
        'Open': [2.0] * n, 'High': [2.05] * n, 'Low': [1.95] * n,
        'Close': [2.0] * n, 'Volume': [60_000] * n,
    })
    fundamentals = {'market_cap': 20_000_000, 'exchange': 'PNK', 'is_otc': True, 'avg_daily_volume': 60_000}
    a = p.analyze(ticker='PNKY', price_data=df.copy(), fundamentals=fundamentals, use_synthetic=False)
    codes = [s.code for s in a.signals]
    assert 'OTC_EXCHANGE' in codes


# ---------------------------------------------------------------------------
# PY-H3 / PY-H8 / PY-C2 behaviour
# ---------------------------------------------------------------------------

def test_ml_disabled_by_default():
    assert ml_models_enabled() is False


def test_structural_only_stack_caps_at_medium():
    """price<$5 + small cap + low liquidity with a flat chart must be MEDIUM."""
    p = ScamDetectionPipeline(load_models=False)
    n = 60
    flat = pd.DataFrame({
        'Date': pd.date_range('2024-01-01', periods=n),
        'Open': [2.0] * n, 'High': [2.01] * n, 'Low': [1.99] * n,
        'Close': [2.0] * n, 'Volume': [50_000] * n,
    })
    fundamentals = {'market_cap': 20_000_000, 'exchange': 'NASDAQ', 'is_otc': False, 'avg_daily_volume': 50_000}
    a = p.analyze(ticker='FLAT', price_data=flat.copy(), fundamentals=fundamentals, use_synthetic=False)
    assert a.risk_level == 'MEDIUM'
    assert all(s.category == 'STRUCTURAL' for s in a.signals)


def test_insufficient_history_returns_insufficient():
    p = ScamDetectionPipeline(load_models=False)
    df = pd.DataFrame({
        'Date': pd.date_range('2024-01-01', periods=5),
        'Open': [1.0] * 5, 'High': [1.1] * 5, 'Low': [0.9] * 5,
        'Close': [1.0] * 5, 'Volume': [1000] * 5,
    })
    a = p.analyze(
        ticker='THIN', price_data=df.copy(),
        fundamentals={'market_cap': 20e6, 'exchange': 'PNK', 'is_otc': True, 'avg_daily_volume': 50000},
        use_synthetic=False,
    )
    assert a.risk_level == 'INSUFFICIENT'
    assert a.data_available is False


def test_insufficient_history_with_sec_flag_stays_high():
    """A SEC hit still stands even when market data is thin."""
    p = ScamDetectionPipeline(load_models=False)
    df = pd.DataFrame({
        'Date': pd.date_range('2024-01-01', periods=4),
        'Open': [1.0] * 4, 'High': [1.1] * 4, 'Low': [0.9] * 4,
        'Close': [1.0] * 4, 'Volume': [1000] * 4,
    })
    a = p.analyze(
        ticker='THIN', price_data=df.copy(),
        fundamentals={'market_cap': 20e6, 'exchange': 'PNK', 'is_otc': True, 'avg_daily_volume': 50000},
        use_synthetic=False, sec_flagged_override=True,
    )
    assert a.risk_level == 'HIGH'
    assert a.sec_flagged is True
    assert a.data_available is False
