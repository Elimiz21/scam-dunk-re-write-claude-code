"""
Configuration settings for the Scam Detection System.
All thresholds and parameters are easily adjustable here.
"""

# =============================================================================
# RISK CALIBRATION THRESHOLDS
# =============================================================================
# These thresholds map probability scores to categorical risk levels

RISK_THRESHOLDS = {
    'LOW': 0.3,        # Probability < 0.3 = Low Risk
    'MEDIUM': 0.7,     # 0.3 <= Probability < 0.7 = Medium Risk
    'HIGH': 1.0,       # Probability >= 0.7 = High Risk
}

# =============================================================================
# ANOMALY DETECTION PARAMETERS
# =============================================================================

ANOMALY_CONFIG = {
    # Z-score thresholds for anomaly detection
    'z_score_threshold': 3.0,           # Standard deviations from mean
    'volume_z_threshold': 2.5,          # Volume Z-score threshold

    # Rolling window sizes
    'short_window': 7,                  # Short-term rolling window (days)
    'long_window': 30,                  # Long-term rolling window (days)

    # Price surge thresholds
    'price_surge_1d_threshold': 0.15,   # 15% daily price change
    'price_surge_7d_threshold': 0.50,   # 50% weekly price change
    'price_surge_extreme': 1.00,        # 100% weekly = extreme

    # Volume surge thresholds
    'volume_surge_moderate': 5.0,       # 5x normal volume
    'volume_surge_extreme': 10.0,       # 10x normal volume
}

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

OTC_EXCHANGES = {
    'OTC', 'OTCBB', 'OTCQX', 'OTCQB', 'PINK', 'GREY', 'OTC MARKETS'
}
