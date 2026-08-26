"""
Configuration settings for the Scam Detection System.
All thresholds and parameters are easily adjustable here.
"""

# =============================================================================
# RISK CALIBRATION THRESHOLDS
# =============================================================================
# These thresholds map probability scores to categorical risk levels

RISK_THRESHOLDS = {
    'LOW': 0.25,       # Probability < 0.25 = Low Risk (was 0.3)
    'MEDIUM': 0.55,    # 0.25 <= Probability < 0.55 = Medium Risk (was 0.7)
    'HIGH': 1.0,       # Probability >= 0.55 = High Risk (lowered from 0.7)
}
# Research justification: Lowering HIGH threshold from 0.70 to 0.55
# reduces the overly wide MEDIUM range and catches more suspicious stocks

# =============================================================================
# ANOMALY DETECTION PARAMETERS
# =============================================================================

ANOMALY_CONFIG = {
    # Z-score thresholds for anomaly detection - lowered for more sensitivity
    'z_score_threshold': 2.5,           # was 3.0 - catches more anomalies
    'volume_z_threshold': 2.5,          # Volume Z-score threshold

    # Rolling window sizes
    'short_window': 7,                  # Short-term rolling window (days)
    'long_window': 30,                  # Long-term rolling window (days)

    # Price surge thresholds - Updated based on research (arXiv 2025, IEEE 2019)
    # Research uses 70-90% for HIGH detection, but we need EARLY warning
    'price_surge_1d_threshold': 0.10,   # was 15% - 10% daily is notable
    'price_surge_7d_threshold': 0.25,   # was 50% - 25% weekly (5σ for blue-chips)
    'price_surge_extreme': 0.50,        # was 100% - 50% is now extreme

    # Volume surge thresholds - Updated per research (300-400% = optimal detection)
    'volume_surge_moderate': 3.0,       # was 5x - 3x provides early warning
    'volume_surge_extreme': 5.0,        # was 10x - 5x is now extreme

    # Pump-and-dump pattern thresholds - lowered to catch smaller schemes
    'pump_dump_rise': 0.20,             # was 0.30 - 20% rise before peak
    'pump_dump_fall': -0.15,            # was -0.20 - 15% fall after peak
}

# --- OTC-tiered threshold system ---
OTC_THRESHOLDS = {
    "price_surge_7d_threshold": 0.10,
    "price_surge_3d_threshold": 0.08,
    "volume_surge_moderate": 2.0,
    "volume_surge_3d": 2.0,
    "volume_surge_extreme": 4.0,
    "pump_dump_rise": 0.12,
    "z_score_threshold": 1.8,
    "volume_z_threshold": 1.5,
    "price_surge_1d_threshold": 0.08,
    "price_surge_extreme": 0.35,
}

MAJOR_EXCHANGE_THRESHOLDS = {
    "price_surge_7d_threshold": 0.25,
    "price_surge_3d_threshold": 0.15,
    "volume_surge_moderate": 3.0,
    "volume_surge_3d": 3.0,
    "volume_surge_extreme": 5.0,
    "pump_dump_rise": 0.20,
    "z_score_threshold": 2.5,
    "volume_z_threshold": 2.0,
    "price_surge_1d_threshold": 0.10,
    "price_surge_extreme": 0.50,
}

WATCHLIST_THRESHOLDS = {
    "price_surge_7d_threshold": 0.05,
    "price_surge_3d_threshold": 0.04,
    "volume_surge_moderate": 1.5,
    "volume_surge_3d": 1.5,
    "volume_surge_extreme": 3.0,
    "pump_dump_rise": 0.08,
    "z_score_threshold": 1.5,
    "volume_z_threshold": 1.2,
    "price_surge_1d_threshold": 0.05,
    "price_surge_extreme": 0.25,
}


def get_thresholds(is_otc: bool, on_watchlist: bool = False) -> dict:
    """Select threshold tier based on stock context."""
    if on_watchlist:
        return {**ANOMALY_CONFIG, **WATCHLIST_THRESHOLDS}
    if is_otc:
        return {**ANOMALY_CONFIG, **OTC_THRESHOLDS}
    return {**ANOMALY_CONFIG, **MAJOR_EXCHANGE_THRESHOLDS}


# =============================================================================
# FEATURE ENGINEERING PARAMETERS
# =============================================================================

FEATURE_CONFIG = {
    # ATR period
    'atr_period': 14,

    # Keltner Channel settings
    'keltner_period': 20,
    'keltner_multiplier': 2.0,

    # Moving average periods
    'ma_short': 7,
    'ma_long': 30,
}

# =============================================================================
# RANDOM FOREST FEATURE CONTRACT
# =============================================================================
# SINGLE SOURCE OF TRUTH for the Random Forest feature vector.
#
# Both training (ml_model.ScamDetectorRF.generate_synthetic_training_data) and
# serving (feature_engineering.create_feature_vector) MUST emit features with
# exactly these names, in exactly this order, with exactly this count. A startup
# assertion (pipeline.ScamDetectionPipeline) verifies that the live serving
# vector matches the trained model's feature_names so the historical 49-vs-35
# mismatch (which forced rf_prob to 0.0 and triggered per-request retraining)
# can never silently recur.
#
# NOTE: names are case-sensitive and order-sensitive. Do not reorder or rename
# without retraining the model and regenerating model artifacts/hashes.
RF_FEATURE_NAMES = [
    # --- latest-row technical / contextual features ---
    'return_zscore_short', 'return_zscore_long', 'price_zscore_long',
    'volume_zscore_short', 'volume_zscore_long', 'volume_surge_factor',
    'atr_percent', 'keltner_position', 'keltner_breakout_upper', 'keltner_breakout_lower',
    'price_change_1d', 'price_change_7d', 'price_change_30d',
    'is_pumping_7d', 'is_dumping_7d', 'volume_explosion_moderate', 'volume_explosion_extreme',
    'pump_pattern',
    # 3-day early-detection features (lowercase to match the engineered columns)
    'price_change_3d', 'volume_surge_3d', 'price_acceleration', 'volume_acceleration',
    'roc_7', 'roc_14', 'rsi_14',
    'log_market_cap', 'is_micro_cap', 'is_small_cap',
    'is_micro_liquidity', 'is_low_liquidity', 'is_otc', 'float_turnover',
    'sec_flagged', 'has_news', 'sentiment_score',
    # --- window-aggregate features (multi-day context) ---
    'max_return_zscore_7d', 'max_volume_zscore_7d', 'pump_days_7d',
    'vol_explosion_days_7d', 'keltner_breakout_days_7d',
    'max_return_zscore_14d', 'max_volume_zscore_14d',
    'high_volume_persistence_14d', 'reversal_14d',
    'max_return_zscore_30d', 'max_volume_zscore_30d', 'max_rsi_30d',
    'overbought_days_30d', 'pump_pattern_days_30d',
]


# =============================================================================
# MODEL CONFIGURATION
# =============================================================================

RF_MODEL_CONFIG = {
    'n_estimators': 100,
    'max_depth': 10,
    'min_samples_split': 5,
    'min_samples_leaf': 2,
    'random_state': 42,
}

LSTM_MODEL_CONFIG = {
    'sequence_length': 30,              # Number of time steps
    'lstm_units_1': 64,                 # First LSTM layer units
    'lstm_units_2': 32,                 # Second LSTM layer units
    'dense_units': 16,                  # Dense layer units
    'dropout_rate': 0.2,
    'epochs': 50,
    'batch_size': 32,
    'validation_split': 0.2,
}

# =============================================================================
# MODEL ENSEMBLE WEIGHTS
# =============================================================================

ENSEMBLE_CONFIG = {
    'rf_weight': 0.5,                   # Random Forest weight
    'lstm_weight': 0.5,                 # LSTM weight
    'use_max_strategy': False,          # If True, use max instead of weighted avg
}

# =============================================================================
# SEC FLAGGED STOCKS (SIMULATED DAILY UPDATE)
# =============================================================================
# In production, this would be fetched from SEC API daily
# For demonstration, this is a static list simulating flagged tickers

SEC_FLAGGED_TICKERS = {
    'SCAM',      # Example flagged ticker
    'PUMP',      # Example flagged ticker
    'DUMP',      # Example flagged ticker
    'FRAU',      # Example flagged ticker
    'SUSP',      # Example suspended ticker
    'HALT',      # Example halted ticker
    'XYZQ',      # Example flagged OTC
    'ABCD',      # Example flagged penny stock
}

# Last updated timestamp (simulated)
SEC_LIST_LAST_UPDATE = '2024-12-10'

# =============================================================================
# DATA PATHS
# =============================================================================

MODEL_PATHS = {
    'rf_model': 'models/random_forest_scam_detector.joblib',
    'lstm_model': 'models/lstm_scam_detector.keras',
    'scaler': 'models/feature_scaler.joblib',
}

# =============================================================================
# MARKET CAP AND LIQUIDITY THRESHOLDS
# =============================================================================

MARKET_THRESHOLDS = {
    'micro_cap': 50_000_000,            # < $50M = micro cap (high risk)
    'small_cap': 300_000_000,           # < $300M = small cap
    'mid_cap': 2_000_000_000,           # < $2B = mid cap

    'micro_liquidity': 150_000,         # < $150K daily volume = micro liquidity
    'low_liquidity': 500_000,           # < $500K = low liquidity
}

# =============================================================================
# OTC EXCHANGES (Higher risk indicators)
# =============================================================================
# Includes the Yahoo Finance / yfinance exchange codes (PNK, OQX, OQB, GREY,
# YHD) that real OTC stocks report. The previous set only had the long-form
# names ('OTC', 'PINK', ...) which Yahoo never returns, so is_otc never fired
# for real OTC stocks and every OTC threshold tier / probability floor was dead.
OTC_EXCHANGES = {
    'OTC', 'OTCBB', 'OTCQX', 'OTCQB', 'PINK', 'GREY', 'GRAY', 'OTC MARKETS',
    # Yahoo / yfinance short exchange codes for OTC venues:
    'PNK',   # Pink Sheets / OTC Pink
    'OQX',   # OTCQX
    'OQB',   # OTCQB
    'YHD',   # Yahoo OTC / other OTC
    'OOTC',  # Other OTC
}

# Substrings that, if present in an exchange / fullExchangeName / quoteType
# string, indicate an OTC / pink-sheet venue. Matched case-insensitively.
OTC_EXCHANGE_SUBSTRINGS = (
    'OTC', 'PINK', 'GREY', 'GRAY', 'OTHER OTC', 'PNK',
)


def is_otc_exchange(*values: str) -> bool:
    """Return True if any of the given exchange-identifying strings is OTC.

    Accepts any combination of exchange code, fullExchangeName, market, or
    quoteType strings (e.g. from yfinance .info: 'PNK', 'Other OTC', 'PinkSheet').
    Matches exact membership in OTC_EXCHANGES OR any OTC substring, so it works
    for both the short Yahoo codes (PNK/OQX/OQB) and the descriptive names.
    """
    for value in values:
        if not value:
            continue
        upper = str(value).upper().strip()
        if upper in OTC_EXCHANGES:
            return True
        if any(sub in upper for sub in OTC_EXCHANGE_SUBSTRINGS):
            return True
    return False
