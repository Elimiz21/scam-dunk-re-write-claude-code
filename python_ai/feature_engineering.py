"""
Feature Engineering Module for Scam Detection System.

This module computes technical and contextual features:
- Rolling window statistics (mean, std, Z-scores)
- Volatility indicators (ATR, Keltner Channels)
- Surge metrics (volume surge, price surge)
- Contextual features (market cap, float, OTC flag)
- Regulatory flag feature (SEC flagged list)
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union

from config import (
    ANOMALY_CONFIG,
    FEATURE_CONFIG,
    MARKET_THRESHOLDS,
    OTC_EXCHANGES
)


def compute_rolling_statistics(
    df: pd.DataFrame,
    short_window: int = None,
    long_window: int = None
) -> pd.DataFrame:
    """
    Compute rolling window statistics for price and volume.

    Args:
        df: DataFrame with OHLCV data (must have Return and Volume columns)
        short_window: Short-term window (default from config)
        long_window: Long-term window (default from config)

    Returns:
        DataFrame with additional rolling statistics columns
    """
    df = df.copy()

    short_window = short_window or ANOMALY_CONFIG['short_window']
    long_window = long_window or ANOMALY_CONFIG['long_window']

    # Rolling statistics for returns
    df['Return_Mean_Short'] = df['Return'].rolling(window=short_window).mean()
    df['Return_Std_Short'] = df['Return'].rolling(window=short_window).std()
    df['Return_Mean_Long'] = df['Return'].rolling(window=long_window).mean()
    df['Return_Std_Long'] = df['Return'].rolling(window=long_window).std()

    # Z-scores for returns
    df['Return_ZScore_Short'] = (
        (df['Return'] - df['Return_Mean_Short']) / df['Return_Std_Short'].replace(0, np.nan)
    ).fillna(0)

    df['Return_ZScore_Long'] = (
        (df['Return'] - df['Return_Mean_Long']) / df['Return_Std_Long'].replace(0, np.nan)
    ).fillna(0)

    # Rolling statistics for volume
    df['Volume_Mean_Short'] = df['Volume'].rolling(window=short_window).mean()
    df['Volume_Std_Short'] = df['Volume'].rolling(window=short_window).std()
    df['Volume_Mean_Long'] = df['Volume'].rolling(window=long_window).mean()
    df['Volume_Std_Long'] = df['Volume'].rolling(window=long_window).std()

    # Z-scores for volume
    df['Volume_ZScore_Short'] = (
        (df['Volume'] - df['Volume_Mean_Short']) / df['Volume_Std_Short'].replace(0, np.nan)
    ).fillna(0)

    df['Volume_ZScore_Long'] = (
        (df['Volume'] - df['Volume_Mean_Long']) / df['Volume_Std_Long'].replace(0, np.nan)
    ).fillna(0)

    # Rolling price statistics
    df['Close_Mean_Short'] = df['Close'].rolling(window=short_window).mean()
    df['Close_Std_Short'] = df['Close'].rolling(window=short_window).std()
    df['Close_Mean_Long'] = df['Close'].rolling(window=long_window).mean()
    df['Close_Std_Long'] = df['Close'].rolling(window=long_window).std()

    # Price Z-score (deviation from rolling mean)
    df['Price_ZScore_Long'] = (
        (df['Close'] - df['Close_Mean_Long']) / df['Close_Std_Long'].replace(0, np.nan)
    ).fillna(0)

    return df


def compute_atr(
    df: pd.DataFrame,
    period: int = None
) -> pd.DataFrame:
    """
    Compute Average True Range (ATR) - measure of volatility.

    Args:
        df: DataFrame with High, Low, Close columns
        period: ATR period (default from config)

    Returns:
        DataFrame with ATR column
    """
    df = df.copy()
    period = period or FEATURE_CONFIG['atr_period']

    # True Range components
    high_low = df['High'] - df['Low']
    high_close_prev = abs(df['High'] - df['Close'].shift(1))
    low_close_prev = abs(df['Low'] - df['Close'].shift(1))

    # True Range is max of the three
    df['True_Range'] = pd.concat([high_low, high_close_prev, low_close_prev], axis=1).max(axis=1)

    # Average True Range (smoothed)
    df['ATR'] = df['True_Range'].rolling(window=period).mean()

    # ATR as percentage of price (normalized volatility)
    df['ATR_Percent'] = (df['ATR'] / df['Close']) * 100

    return df


def compute_keltner_channels(
    df: pd.DataFrame,
    period: int = None,
    multiplier: float = None
) -> pd.DataFrame:
    """
    Compute Keltner Channels - volatility-based envelope.

    Args:
        df: DataFrame with OHLC and ATR data
        period: EMA period (default from config)
        multiplier: ATR multiplier for bands (default from config)

    Returns:
        DataFrame with Keltner Channel columns
    """
    df = df.copy()
    period = period or FEATURE_CONFIG['keltner_period']
    multiplier = multiplier or FEATURE_CONFIG['keltner_multiplier']

    # Ensure ATR is computed
    if 'ATR' not in df.columns:
        df = compute_atr(df)

    # Middle line: EMA of close
    df['Keltner_Middle'] = df['Close'].ewm(span=period, adjust=False).mean()

    # Upper and Lower bands
    df['Keltner_Upper'] = df['Keltner_Middle'] + (multiplier * df['ATR'])
    df['Keltner_Lower'] = df['Keltner_Middle'] - (multiplier * df['ATR'])

    # Position within channel (0-1 scale, can exceed bounds)
    channel_width = df['Keltner_Upper'] - df['Keltner_Lower']
    df['Keltner_Position'] = (
        (df['Close'] - df['Keltner_Lower']) / channel_width.replace(0, np.nan)
    ).fillna(0.5)

    # Breakout flags
    df['Keltner_Breakout_Upper'] = (df['Close'] > df['Keltner_Upper']).astype(int)
    df['Keltner_Breakout_Lower'] = (df['Close'] < df['Keltner_Lower']).astype(int)

    return df


def compute_surge_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute price and volume surge metrics.

    Args:
        df: DataFrame with OHLCV and rolling statistics

    Returns:
        DataFrame with surge metric columns
    """
    df = df.copy()

    short_window = ANOMALY_CONFIG['short_window']
    long_window = ANOMALY_CONFIG['long_window']

    # Ensure rolling stats are computed
    if 'Volume_Mean_Long' not in df.columns:
        df = compute_rolling_statistics(df)

    # Volume surge factor: recent 7-day vs prior 30-day average
    df['Volume_Surge_Factor'] = (
        df['Volume_Mean_Short'] / df['Volume_Mean_Long'].replace(0, np.nan)
    ).fillna(1)

    # Price surge percentages
    df['Price_Change_1d'] = df['Close'].pct_change()
    df['Price_Change_7d'] = df['Close'].pct_change(periods=short_window)
    df['Price_Change_30d'] = df['Close'].pct_change(periods=long_window)

    # Absolute price surges (magnitude)
    df['Price_Surge_1d'] = df['Price_Change_1d'].abs()
    df['Price_Surge_7d'] = df['Price_Change_7d'].abs()
    df['Price_Surge_30d'] = df['Price_Change_30d'].abs()

    # Directional surges (positive = pump, negative = dump)
    df['Is_Pumping_7d'] = (df['Price_Change_7d'] > ANOMALY_CONFIG['price_surge_7d_threshold']).astype(int)
    df['Is_Dumping_7d'] = (df['Price_Change_7d'] < -ANOMALY_CONFIG['price_surge_7d_threshold']).astype(int)

    # Volume explosion detection
    df['Volume_Explosion_Moderate'] = (
        df['Volume_Surge_Factor'] >= ANOMALY_CONFIG['volume_surge_moderate']
    ).astype(int)

    df['Volume_Explosion_Extreme'] = (
        df['Volume_Surge_Factor'] >= ANOMALY_CONFIG['volume_surge_extreme']
    ).astype(int)

    # Combined pump pattern: price up + volume explosion
    df['Pump_Pattern'] = (
        (df['Is_Pumping_7d'] == 1) & (df['Volume_Explosion_Moderate'] == 1)
    ).astype(int)

    return df


def compute_momentum_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute momentum-based indicators.

    Args:
        df: DataFrame with OHLCV data

    Returns:
        DataFrame with momentum indicator columns
    """
    df = df.copy()

    # Rate of Change (ROC)
    df['ROC_7'] = ((df['Close'] - df['Close'].shift(7)) / df['Close'].shift(7)) * 100
    df['ROC_14'] = ((df['Close'] - df['Close'].shift(14)) / df['Close'].shift(14)) * 100

    # Relative Strength Index (RSI) - simplified
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)

    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    df['RSI_14'] = 100 - (100 / (1 + rs))
    df['RSI_14'] = df['RSI_14'].fillna(50)

    # Money Flow (volume * direction)
    typical_price = (df['High'] + df['Low'] + df['Close']) / 3
    money_flow = typical_price * df['Volume']
    df['Money_Flow_Direction'] = np.where(typical_price > typical_price.shift(1), 1, -1)
    df['Money_Flow'] = money_flow * df['Money_Flow_Direction']
    df['Money_Flow_14'] = df['Money_Flow'].rolling(window=14).sum()

    return df


def extract_contextual_features(
    fundamentals: Dict,
    sec_flagged: Dict,
    news_flag: bool = False,
    sentiment_score: Optional[float] = None
) -> Dict[str, Union[float, int, bool]]:
    """
    Extract contextual features from fundamentals and external data.

    Args:
        fundamentals: Dictionary with market cap, float, exchange, etc.
        sec_flagged: Dictionary with SEC flag status
        news_flag: Whether significant news exists (placeholder)
        sentiment_score: Sentiment analysis score (placeholder, -1 to 1)

    Returns:
        Dictionary of contextual features
    """
    features = {}

    # Market cap features
    market_cap = fundamentals.get('market_cap', 0)
    features['market_cap'] = market_cap
    features['is_micro_cap'] = int(market_cap < MARKET_THRESHOLDS['micro_cap'])
    features['is_small_cap'] = int(market_cap < MARKET_THRESHOLDS['small_cap'])
    features['log_market_cap'] = np.log1p(market_cap)

    # Float and liquidity
    float_shares = fundamentals.get('float_shares', 0)
    avg_volume = fundamentals.get('avg_daily_volume', 0)
    features['float_shares'] = float_shares
    features['avg_daily_volume'] = avg_volume
    features['is_micro_liquidity'] = int(avg_volume < MARKET_THRESHOLDS['micro_liquidity'])
    features['is_low_liquidity'] = int(avg_volume < MARKET_THRESHOLDS['low_liquidity'])

    # Float turnover (if volume data available)
    if float_shares > 0:
        features['float_turnover'] = avg_volume / float_shares
    else:
        features['float_turnover'] = 0

    # Exchange type
    exchange = fundamentals.get('exchange', 'UNKNOWN')
    features['exchange'] = exchange
    features['is_otc'] = int(exchange.upper() in OTC_EXCHANGES or fundamentals.get('is_otc', False))

    # SEC regulatory flag - CRITICAL FEATURE
    features['sec_flagged'] = int(sec_flagged.get('is_flagged', False))

    # News and sentiment (placeholders)
    features['has_news'] = int(news_flag)
    features['sentiment_score'] = sentiment_score if sentiment_score is not None else 0.0

    # Crypto-specific features (if available)
    if 'holder_count' in fundamentals:
        features['holder_count'] = fundamentals.get('holder_count', 0)
        features['top_10_concentration'] = fundamentals.get('top_10_concentration', 0)
        features['is_concentrated'] = int(fundamentals.get('top_10_concentration', 0) > 0.5)

    return features


def create_feature_vector(
    price_df: pd.DataFrame,
    fundamentals: Dict,
    sec_flagged: Dict,
    news_flag: bool = False,
    sentiment_score: Optional[float] = None
) -> Tuple[np.ndarray, List[str]]:
    """
    Create a complete feature vector for ML model input.

    Args:
        price_df: Preprocessed price DataFrame with all indicators
        fundamentals: Fundamental data dictionary
        sec_flagged: SEC flag status dictionary
        news_flag: News availability flag
        sentiment_score: Sentiment score

    Returns:
        Tuple of (feature_array, feature_names)
    """
    # Get latest row of price data
    latest = price_df.iloc[-1]

    # Extract contextual features
    ctx_features = extract_contextual_features(
        fundamentals, sec_flagged, news_flag, sentiment_score
    )

    # Build feature dictionary
    features = {}

    # Price-based features
    features['return_zscore_short'] = latest.get('Return_ZScore_Short', 0)
    features['return_zscore_long'] = latest.get('Return_ZScore_Long', 0)
    features['price_zscore_long'] = latest.get('Price_ZScore_Long', 0)

    # Volume features
    features['volume_zscore_short'] = latest.get('Volume_ZScore_Short', 0)
    features['volume_zscore_long'] = latest.get('Volume_ZScore_Long', 0)
    features['volume_surge_factor'] = latest.get('Volume_Surge_Factor', 1)

    # Volatility features
    features['atr_percent'] = latest.get('ATR_Percent', 0)
    features['keltner_position'] = latest.get('Keltner_Position', 0.5)
    features['keltner_breakout_upper'] = latest.get('Keltner_Breakout_Upper', 0)
    features['keltner_breakout_lower'] = latest.get('Keltner_Breakout_Lower', 0)

    # Surge metrics
    features['price_change_1d'] = latest.get('Price_Change_1d', 0)
    features['price_change_7d'] = latest.get('Price_Change_7d', 0)
    features['price_change_30d'] = latest.get('Price_Change_30d', 0)
    features['is_pumping_7d'] = latest.get('Is_Pumping_7d', 0)
    features['is_dumping_7d'] = latest.get('Is_Dumping_7d', 0)
    features['volume_explosion_moderate'] = latest.get('Volume_Explosion_Moderate', 0)
    features['volume_explosion_extreme'] = latest.get('Volume_Explosion_Extreme', 0)
    features['pump_pattern'] = latest.get('Pump_Pattern', 0)

    # Momentum features
    features['roc_7'] = latest.get('ROC_7', 0)
    features['roc_14'] = latest.get('ROC_14', 0)
    features['rsi_14'] = latest.get('RSI_14', 50)

    # Contextual features
    features['log_market_cap'] = ctx_features.get('log_market_cap', 0)
    features['is_micro_cap'] = ctx_features.get('is_micro_cap', 0)
    features['is_small_cap'] = ctx_features.get('is_small_cap', 0)
    features['is_micro_liquidity'] = ctx_features.get('is_micro_liquidity', 0)
    features['is_low_liquidity'] = ctx_features.get('is_low_liquidity', 0)
    features['is_otc'] = ctx_features.get('is_otc', 0)
    features['float_turnover'] = ctx_features.get('float_turnover', 0)

    # CRITICAL: SEC regulatory flag
    features['sec_flagged'] = ctx_features.get('sec_flagged', 0)

    # News and sentiment (placeholders)
    features['has_news'] = ctx_features.get('has_news', 0)
    features['sentiment_score'] = ctx_features.get('sentiment_score', 0)

    # Convert to array
    feature_names = list(features.keys())
    feature_array = np.array([features[name] for name in feature_names])

    return feature_array, feature_names


def engineer_all_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply all feature engineering transformations to price data.

    Args:
        df: Preprocessed OHLCV DataFrame

    Returns:
        DataFrame with all engineered features
    """
    df = compute_rolling_statistics(df)
    df = compute_atr(df)
    df = compute_keltner_channels(df)
    df = compute_surge_metrics(df)
    df = compute_momentum_indicators(df)

    # Fill any remaining NaN values
    df = df.fillna(0)

    return df


if __name__ == '__main__':
    import sys
    sys.path.insert(0, '/home/user/scam-dunk-re-write-claude-code/python_ai')
    from data_ingestion import generate_synthetic_stock_data, preprocess_price_data

    print("=" * 60)
    print("Testing Feature Engineering Module")
    print("=" * 60)

    # Generate test data
    print("\n1. Generating test data...")
    df = generate_synthetic_stock_data('TEST', days=60, include_pump=True)
    df = preprocess_price_data(df)
    print(f"   Generated {len(df)} rows of preprocessed data")

    # Test rolling statistics
    print("\n2. Computing rolling statistics...")
    df = compute_rolling_statistics(df)
    print(f"   Return Z-Score (latest): {df['Return_ZScore_Long'].iloc[-1]:.2f}")
    print(f"   Volume Z-Score (latest): {df['Volume_ZScore_Long'].iloc[-1]:.2f}")

    # Test ATR
    print("\n3. Computing ATR...")
    df = compute_atr(df)
    print(f"   ATR (latest): {df['ATR'].iloc[-1]:.4f}")
    print(f"   ATR % (latest): {df['ATR_Percent'].iloc[-1]:.2f}%")

    # Test Keltner Channels
    print("\n4. Computing Keltner Channels...")
    df = compute_keltner_channels(df)
    print(f"   Keltner Middle: {df['Keltner_Middle'].iloc[-1]:.2f}")
    print(f"   Keltner Upper: {df['Keltner_Upper'].iloc[-1]:.2f}")
    print(f"   Keltner Lower: {df['Keltner_Lower'].iloc[-1]:.2f}")
    print(f"   Keltner Position: {df['Keltner_Position'].iloc[-1]:.2f}")

    # Test surge metrics
    print("\n5. Computing surge metrics...")
    df = compute_surge_metrics(df)
    print(f"   Volume Surge Factor: {df['Volume_Surge_Factor'].iloc[-1]:.2f}x")
    print(f"   7-day Price Change: {df['Price_Change_7d'].iloc[-1]*100:.1f}%")
    print(f"   Pump Pattern Detected: {bool(df['Pump_Pattern'].iloc[-1])}")

    # Test momentum indicators
    print("\n6. Computing momentum indicators...")
    df = compute_momentum_indicators(df)
    print(f"   RSI-14: {df['RSI_14'].iloc[-1]:.1f}")
    print(f"   ROC-7: {df['ROC_7'].iloc[-1]:.2f}%")

    # Test contextual features
    print("\n7. Testing contextual features...")
    test_fundamentals = {
        'market_cap': 25_000_000,
        'float_shares': 5_000_000,
        'avg_daily_volume': 50_000,
        'exchange': 'OTC'
    }
    test_sec = {'is_flagged': True}

    ctx = extract_contextual_features(test_fundamentals, test_sec, news_flag=False)
    print(f"   Is Micro Cap: {bool(ctx['is_micro_cap'])}")
    print(f"   Is OTC: {bool(ctx['is_otc'])}")
    print(f"   SEC Flagged: {bool(ctx['sec_flagged'])}")

    # Test full feature vector
    print("\n8. Creating full feature vector...")
    features, names = create_feature_vector(df, test_fundamentals, test_sec)
    print(f"   Total features: {len(features)}")
    print(f"   Feature names: {names[:5]}... (showing first 5)")
    print(f"   Feature values: {features[:5]}... (showing first 5)")

    # Test all-in-one engineering
    print("\n9. Testing engineer_all_features()...")
    df_raw = generate_synthetic_stock_data('FULL', days=60)
    df_raw = preprocess_price_data(df_raw)
    df_full = engineer_all_features(df_raw)
    print(f"   Total columns after engineering: {len(df_full.columns)}")

    print("\n" + "=" * 60)
    print("Feature Engineering Module Tests Complete!")
    print("=" * 60)
