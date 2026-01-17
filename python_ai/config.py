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

# =============================================================================
# CRYPTO-SPECIFIC CONFIGURATION
# =============================================================================
# Crypto markets have HIGHER volatility than stocks, so thresholds must be different

CRYPTO_RISK_THRESHOLDS = {
    'LOW': 0.25,       # Probability < 0.25 = Low Risk (stricter for crypto)
    'MEDIUM': 0.60,    # 0.25 <= Probability < 0.60 = Medium Risk
    'HIGH': 1.0,       # Probability >= 0.60 = High Risk
}

CRYPTO_ANOMALY_CONFIG = {
    # Z-score thresholds (higher for crypto due to natural volatility)
    'z_score_threshold': 4.0,           # Crypto is more volatile
    'volume_z_threshold': 3.5,          # Volume spikes are more common

    # Rolling window sizes (shorter for crypto 24/7 markets)
    'short_window': 7,                  # 7-day window
    'long_window': 30,                  # 30-day window

    # Price surge thresholds (HIGHER than stocks - crypto is volatile)
    'price_surge_1d_threshold': 0.25,   # 25% daily = suspicious (vs 15% stocks)
    'price_surge_7d_threshold': 0.80,   # 80% weekly = suspicious (vs 50% stocks)
    'price_surge_extreme': 2.00,        # 200% weekly = extreme (vs 100% stocks)

    # Volume surge thresholds
    'volume_surge_moderate': 8.0,       # 8x normal volume (vs 5x stocks)
    'volume_surge_extreme': 20.0,       # 20x normal volume (vs 10x stocks)
}

# Crypto market cap thresholds (different scale than stocks)
CRYPTO_MARKET_THRESHOLDS = {
    'micro_cap': 10_000_000,            # < $10M = micro cap (very high risk)
    'small_cap': 100_000_000,           # < $100M = small cap (high risk)
    'mid_cap': 1_000_000_000,           # < $1B = mid cap
    'large_cap': 10_000_000_000,        # >= $10B = large cap (lower risk)

    'micro_liquidity': 50_000,          # < $50K 24h volume = micro liquidity
    'low_liquidity': 500_000,           # < $500K = low liquidity
    'healthy_liquidity': 5_000_000,     # >= $5M = healthy liquidity
}

# Crypto-specific risk signals and their weights
CRYPTO_RISK_SIGNALS = {
    # CRITICAL (Automatic HIGH risk)
    'HONEYPOT': 100,                    # Cannot sell token
    'OWNER_CAN_CHANGE_BALANCE': 100,    # Owner can modify balances

    # CONTRACT SECURITY (High weight)
    'HIDDEN_OWNER': 25,                 # Owner hidden via proxy
    'CAN_MINT': 20,                     # Unlimited minting possible
    'TRADING_DISABLED': 20,             # Trading can be paused
    'BLACKLIST_FUNCTION': 15,           # Can blacklist wallets
    'HIGH_BUY_TAX': 15,                 # > 10% buy tax
    'HIGH_SELL_TAX': 20,                # > 10% sell tax
    'MODIFIABLE_TAX': 12,               # Tax can be changed

    # LIQUIDITY RISKS (Medium-High weight)
    'LP_NOT_LOCKED': 18,                # Liquidity not locked
    'LP_LOW_LOCK_DURATION': 10,         # Lock < 6 months
    'LOW_LIQUIDITY_RATIO': 15,          # Liquidity < 5% market cap
    'SINGLE_LP_PROVIDER': 12,           # One entity controls LP

    # DISTRIBUTION RISKS (Medium weight)
    'HIGH_HOLDER_CONCENTRATION': 15,    # Top 10 hold > 50%
    'WHALE_DOMINANCE': 12,              # Single holder > 20%
    'LOW_HOLDER_COUNT': 10,             # < 100 holders
    'TEAM_TOKENS_UNLOCKED': 10,         # Team tokens not vested

    # MARKET PATTERN RISKS (Medium weight)
    'EXTREME_VOLATILITY': 12,           # > 50% daily moves
    'PUMP_PATTERN': 15,                 # Spike then drop pattern
    'VOLUME_MANIPULATION': 12,          # Wash trading signals
    'PRICE_CORRELATION_LOW': 8,         # Moves opposite to market

    # BEHAVIORAL RISKS (Lower weight, from NLP)
    'URGENCY_LANGUAGE': 8,              # "Buy now", "Last chance"
    'GUARANTEED_RETURNS': 10,           # "Guaranteed 100x"
    'INSIDER_CLAIMS': 8,                # "Alpha leak", "Insider info"

    # STRUCTURAL RISKS (Informational)
    'NEW_TOKEN': 8,                     # Created < 30 days ago
    'NO_AUDIT': 6,                      # No security audit
    'ANONYMOUS_TEAM': 5,                # Unknown developers
}

# Established cryptocurrencies (lower baseline risk)
ESTABLISHED_CRYPTOS = {
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX',
    'DOT', 'LINK', 'MATIC', 'LTC', 'SHIB', 'UNI', 'ATOM',
    'XLM', 'BCH', 'NEAR', 'APT', 'FIL', 'AAVE', 'MKR'
}

# Blockchain chain IDs for GoPlus API
SUPPORTED_CHAINS = {
    'ethereum': {'chainId': '1', 'name': 'Ethereum'},
    'bsc': {'chainId': '56', 'name': 'BNB Chain'},
    'polygon': {'chainId': '137', 'name': 'Polygon'},
    'arbitrum': {'chainId': '42161', 'name': 'Arbitrum'},
    'optimism': {'chainId': '10', 'name': 'Optimism'},
    'avalanche': {'chainId': '43114', 'name': 'Avalanche'},
    'base': {'chainId': '8453', 'name': 'Base'},
    'solana': {'chainId': 'solana', 'name': 'Solana'},
}
