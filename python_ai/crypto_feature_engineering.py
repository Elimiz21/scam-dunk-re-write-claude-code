"""
Crypto-Specific Feature Engineering Module.

This module computes features specifically calibrated for cryptocurrency analysis:
- Higher volatility thresholds than stocks (crypto is naturally more volatile)
- Crypto-specific signals (honeypot, LP lock, holder concentration)
- Smart contract security features
- On-chain metrics integration
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union

from config import (
    CRYPTO_ANOMALY_CONFIG,
    CRYPTO_MARKET_THRESHOLDS,
    CRYPTO_RISK_SIGNALS,
    ESTABLISHED_CRYPTOS,
    FEATURE_CONFIG,
)


def compute_crypto_rolling_statistics(
    df: pd.DataFrame,
    short_window: int = None,
    long_window: int = None
) -> pd.DataFrame:
    """
    Compute rolling window statistics calibrated for crypto volatility.

    Uses CRYPTO_ANOMALY_CONFIG thresholds which are higher than stock thresholds.
    """
    df = df.copy()

    short_window = short_window or CRYPTO_ANOMALY_CONFIG['short_window']
    long_window = long_window or CRYPTO_ANOMALY_CONFIG['long_window']

    # Rolling statistics for returns
    df['Return_Mean_Short'] = df['Return'].rolling(window=short_window).mean()
    df['Return_Std_Short'] = df['Return'].rolling(window=short_window).std()
    df['Return_Mean_Long'] = df['Return'].rolling(window=long_window).mean()
    df['Return_Std_Long'] = df['Return'].rolling(window=long_window).std()

    # Z-scores for returns (using crypto-calibrated thresholds)
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

    # Price Z-score
    df['Price_ZScore_Long'] = (
        (df['Close'] - df['Close_Mean_Long']) / df['Close_Std_Long'].replace(0, np.nan)
    ).fillna(0)

    return df


def compute_crypto_volatility(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute crypto-specific volatility metrics.

    Crypto has higher baseline volatility, so we use different thresholds.
    """
    df = df.copy()
    period = FEATURE_CONFIG['atr_period']

    # True Range
    high_low = df['High'] - df['Low']
    high_close_prev = abs(df['High'] - df['Close'].shift(1))
    low_close_prev = abs(df['Low'] - df['Close'].shift(1))
    df['True_Range'] = pd.concat([high_low, high_close_prev, low_close_prev], axis=1).max(axis=1)

    # Average True Range
    df['ATR'] = df['True_Range'].rolling(window=period).mean()
    df['ATR_Percent'] = (df['ATR'] / df['Close']) * 100

    # Crypto-specific: Daily volatility (annualized would be * sqrt(365))
    df['Daily_Volatility'] = df['Return'].rolling(window=period).std()
    df['Volatility_7d'] = df['Return'].rolling(window=7).std()
    df['Volatility_30d'] = df['Return'].rolling(window=30).std()

    # Volatility ratio (short-term vs long-term)
    df['Volatility_Ratio'] = (
        df['Volatility_7d'] / df['Volatility_30d'].replace(0, np.nan)
    ).fillna(1)

    # Flag extreme volatility (crypto threshold is higher: 50% daily moves)
    df['Is_Extreme_Volatility'] = (df['ATR_Percent'] > 15).astype(int)  # 15% ATR is extreme even for crypto

    return df


def compute_crypto_surge_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute price and volume surge metrics with CRYPTO-CALIBRATED thresholds.

    Key differences from stocks:
    - 25% daily threshold (vs 15% for stocks)
    - 80% weekly threshold (vs 50% for stocks)
    - 8x volume surge threshold (vs 5x for stocks)
    """
    df = df.copy()

    # Ensure rolling stats are computed
    if 'Volume_Mean_Long' not in df.columns:
        df = compute_crypto_rolling_statistics(df)

    # Volume surge factor
    df['Volume_Surge_Factor'] = (
        df['Volume_Mean_Short'] / df['Volume_Mean_Long'].replace(0, np.nan)
    ).fillna(1)

    # Price changes
    df['Price_Change_1d'] = df['Close'].pct_change()
    df['Price_Change_7d'] = df['Close'].pct_change(periods=7)
    df['Price_Change_30d'] = df['Close'].pct_change(periods=30)

    # Absolute surges
    df['Price_Surge_1d'] = df['Price_Change_1d'].abs()
    df['Price_Surge_7d'] = df['Price_Change_7d'].abs()
    df['Price_Surge_30d'] = df['Price_Change_30d'].abs()

    # CRYPTO-SPECIFIC thresholds (higher than stocks)
    df['Is_Pumping_1d'] = (
        df['Price_Change_1d'] > CRYPTO_ANOMALY_CONFIG['price_surge_1d_threshold']
    ).astype(int)

    df['Is_Pumping_7d'] = (
        df['Price_Change_7d'] > CRYPTO_ANOMALY_CONFIG['price_surge_7d_threshold']
    ).astype(int)

    df['Is_Dumping_1d'] = (
        df['Price_Change_1d'] < -CRYPTO_ANOMALY_CONFIG['price_surge_1d_threshold']
    ).astype(int)

    df['Is_Dumping_7d'] = (
        df['Price_Change_7d'] < -CRYPTO_ANOMALY_CONFIG['price_surge_7d_threshold']
    ).astype(int)

    # Extreme price moves (crypto threshold: 200% weekly)
    df['Is_Extreme_Move'] = (
        df['Price_Surge_7d'] > CRYPTO_ANOMALY_CONFIG['price_surge_extreme']
    ).astype(int)

    # Volume explosion (crypto threshold: 8x and 20x)
    df['Volume_Explosion_Moderate'] = (
        df['Volume_Surge_Factor'] >= CRYPTO_ANOMALY_CONFIG['volume_surge_moderate']
    ).astype(int)

    df['Volume_Explosion_Extreme'] = (
        df['Volume_Surge_Factor'] >= CRYPTO_ANOMALY_CONFIG['volume_surge_extreme']
    ).astype(int)

    # Pump-and-dump pattern detection
    df['Pump_Pattern'] = (
        (df['Is_Pumping_7d'] == 1) & (df['Volume_Explosion_Moderate'] == 1)
    ).astype(int)

    # Spike-then-drop pattern (pump followed by dump)
    df['Prior_Week_Pump'] = df['Is_Pumping_7d'].shift(7)
    df['Spike_Then_Drop'] = (
        (df['Prior_Week_Pump'] == 1) & (df['Is_Dumping_7d'] == 1)
    ).astype(int)

    return df


def compute_crypto_momentum(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute momentum indicators for crypto.
    """
    df = df.copy()

    # Rate of Change
    df['ROC_7'] = ((df['Close'] - df['Close'].shift(7)) / df['Close'].shift(7)) * 100
    df['ROC_14'] = ((df['Close'] - df['Close'].shift(14)) / df['Close'].shift(14)) * 100
    df['ROC_30'] = ((df['Close'] - df['Close'].shift(30)) / df['Close'].shift(30)) * 100

    # RSI
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)

    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    df['RSI_14'] = 100 - (100 / (1 + rs))
    df['RSI_14'] = df['RSI_14'].fillna(50)

    # RSI extreme zones (crypto specific)
    df['RSI_Overbought'] = (df['RSI_14'] > 80).astype(int)  # 80 for crypto (vs 70 stocks)
    df['RSI_Oversold'] = (df['RSI_14'] < 20).astype(int)    # 20 for crypto (vs 30 stocks)

    # Money Flow
    typical_price = (df['High'] + df['Low'] + df['Close']) / 3
    money_flow = typical_price * df['Volume']
    df['Money_Flow_Direction'] = np.where(typical_price > typical_price.shift(1), 1, -1)
    df['Money_Flow'] = money_flow * df['Money_Flow_Direction']
    df['Money_Flow_14'] = df['Money_Flow'].rolling(window=14).sum()

    return df


def extract_crypto_contextual_features(
    fundamentals: Dict,
    security_data: Optional[Dict] = None,
    news_flag: bool = False
) -> Dict[str, Union[float, int, bool]]:
    """
    Extract crypto-specific contextual features.

    Includes:
    - Market cap categorization (different thresholds than stocks)
    - Holder concentration metrics
    - Smart contract security flags
    - Liquidity metrics
    """
    features = {}
    symbol = fundamentals.get('symbol', '').upper()

    # Is established crypto (lower baseline risk)
    features['is_established'] = int(symbol in ESTABLISHED_CRYPTOS)

    # Market cap features (CRYPTO thresholds)
    market_cap = fundamentals.get('market_cap', 0)
    features['market_cap'] = market_cap
    features['log_market_cap'] = np.log1p(market_cap)

    features['is_micro_cap'] = int(market_cap < CRYPTO_MARKET_THRESHOLDS['micro_cap'])
    features['is_small_cap'] = int(market_cap < CRYPTO_MARKET_THRESHOLDS['small_cap'])
    features['is_large_cap'] = int(market_cap >= CRYPTO_MARKET_THRESHOLDS['large_cap'])

    # Liquidity features (CRYPTO thresholds)
    volume_24h = fundamentals.get('volume_24h', 0)
    features['volume_24h'] = volume_24h
    features['is_micro_liquidity'] = int(volume_24h < CRYPTO_MARKET_THRESHOLDS['micro_liquidity'])
    features['is_low_liquidity'] = int(volume_24h < CRYPTO_MARKET_THRESHOLDS['low_liquidity'])
    features['is_healthy_liquidity'] = int(volume_24h >= CRYPTO_MARKET_THRESHOLDS['healthy_liquidity'])

    # Liquidity ratio (volume / market cap)
    if market_cap > 0:
        features['liquidity_ratio'] = volume_24h / market_cap
        features['low_liquidity_ratio'] = int(features['liquidity_ratio'] < 0.01)  # < 1%
    else:
        features['liquidity_ratio'] = 0
        features['low_liquidity_ratio'] = 1

    # Supply metrics
    circulating = fundamentals.get('circulating_supply', 0)
    total = fundamentals.get('total_supply', 0)
    if total > 0 and circulating > 0:
        features['supply_ratio'] = circulating / total
        features['high_inflation_risk'] = int(features['supply_ratio'] < 0.3)  # < 30% circulating
    else:
        features['supply_ratio'] = 1
        features['high_inflation_risk'] = 0

    # Holder distribution
    holder_count = fundamentals.get('holder_count', 0)
    features['holder_count'] = holder_count
    features['low_holder_count'] = int(holder_count > 0 and holder_count < 100)

    top_10_concentration = fundamentals.get('top_10_concentration', 0)
    features['top_10_concentration'] = top_10_concentration
    features['high_concentration'] = int(top_10_concentration > 0.5)  # Top 10 hold > 50%
    features['extreme_concentration'] = int(top_10_concentration > 0.8)  # Top 10 hold > 80%

    # Smart contract security features (from GoPlus or similar)
    if security_data:
        features['is_honeypot'] = int(security_data.get('is_honeypot', False))
        features['can_mint'] = int(security_data.get('is_mintable', False))
        features['hidden_owner'] = int(security_data.get('hidden_owner', False))
        features['can_blacklist'] = int(security_data.get('can_blacklist', False))
        features['trading_cooldown'] = int(security_data.get('trading_cooldown', False))
        features['transfer_pausable'] = int(security_data.get('transfer_pausable', False))

        # Tax analysis
        buy_tax = security_data.get('buy_tax', 0)
        sell_tax = security_data.get('sell_tax', 0)
        features['buy_tax'] = buy_tax
        features['sell_tax'] = sell_tax
        features['high_buy_tax'] = int(buy_tax > 0.1)   # > 10%
        features['high_sell_tax'] = int(sell_tax > 0.1)  # > 10%
        features['extreme_tax'] = int(buy_tax > 0.2 or sell_tax > 0.2)  # > 20%

        # Liquidity lock
        features['lp_locked'] = int(security_data.get('lp_locked', False))
        features['lp_lock_duration'] = security_data.get('lp_lock_duration_days', 0)
        features['short_lp_lock'] = int(0 < features['lp_lock_duration'] < 180)  # < 6 months

        # Owner analysis
        features['owner_can_change_balance'] = int(security_data.get('owner_change_balance', False))
        features['anti_whale'] = int(security_data.get('anti_whale', False))

        # Security score (if available)
        features['security_score'] = security_data.get('security_score', 50)
    else:
        # Default values when no security data
        features['is_honeypot'] = 0
        features['can_mint'] = 0
        features['hidden_owner'] = 0
        features['can_blacklist'] = 0
        features['trading_cooldown'] = 0
        features['transfer_pausable'] = 0
        features['buy_tax'] = 0
        features['sell_tax'] = 0
        features['high_buy_tax'] = 0
        features['high_sell_tax'] = 0
        features['extreme_tax'] = 0
        features['lp_locked'] = 0
        features['lp_lock_duration'] = 0
        features['short_lp_lock'] = 0
        features['owner_can_change_balance'] = 0
        features['anti_whale'] = 0
        features['security_score'] = 50

    # News flag
    features['has_news'] = int(news_flag)

    return features


def create_crypto_feature_vector(
    price_df: pd.DataFrame,
    fundamentals: Dict,
    security_data: Optional[Dict] = None,
    news_flag: bool = False
) -> Tuple[np.ndarray, List[str]]:
    """
    Create complete feature vector for crypto ML model input.

    Returns features calibrated for crypto volatility and
    including crypto-specific signals.
    """
    # Get latest row
    latest = price_df.iloc[-1]

    # Extract contextual features
    ctx = extract_crypto_contextual_features(fundamentals, security_data, news_flag)

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
    features['volatility_ratio'] = latest.get('Volatility_Ratio', 1)
    features['is_extreme_volatility'] = latest.get('Is_Extreme_Volatility', 0)

    # Surge metrics (crypto-calibrated)
    features['price_change_1d'] = latest.get('Price_Change_1d', 0)
    features['price_change_7d'] = latest.get('Price_Change_7d', 0)
    features['price_change_30d'] = latest.get('Price_Change_30d', 0)
    features['is_pumping_1d'] = latest.get('Is_Pumping_1d', 0)
    features['is_pumping_7d'] = latest.get('Is_Pumping_7d', 0)
    features['is_dumping_1d'] = latest.get('Is_Dumping_1d', 0)
    features['is_dumping_7d'] = latest.get('Is_Dumping_7d', 0)
    features['is_extreme_move'] = latest.get('Is_Extreme_Move', 0)
    features['volume_explosion_moderate'] = latest.get('Volume_Explosion_Moderate', 0)
    features['volume_explosion_extreme'] = latest.get('Volume_Explosion_Extreme', 0)
    features['pump_pattern'] = latest.get('Pump_Pattern', 0)
    features['spike_then_drop'] = latest.get('Spike_Then_Drop', 0)

    # Momentum
    features['roc_7'] = latest.get('ROC_7', 0)
    features['roc_14'] = latest.get('ROC_14', 0)
    features['roc_30'] = latest.get('ROC_30', 0)
    features['rsi_14'] = latest.get('RSI_14', 50)
    features['rsi_overbought'] = latest.get('RSI_Overbought', 0)
    features['rsi_oversold'] = latest.get('RSI_Oversold', 0)

    # Contextual features (from crypto-specific extraction)
    features['is_established'] = ctx.get('is_established', 0)
    features['log_market_cap'] = ctx.get('log_market_cap', 0)
    features['is_micro_cap'] = ctx.get('is_micro_cap', 0)
    features['is_small_cap'] = ctx.get('is_small_cap', 0)
    features['is_large_cap'] = ctx.get('is_large_cap', 0)
    features['is_micro_liquidity'] = ctx.get('is_micro_liquidity', 0)
    features['is_low_liquidity'] = ctx.get('is_low_liquidity', 0)
    features['liquidity_ratio'] = ctx.get('liquidity_ratio', 0)
    features['low_liquidity_ratio'] = ctx.get('low_liquidity_ratio', 0)

    # Supply and distribution
    features['supply_ratio'] = ctx.get('supply_ratio', 1)
    features['high_inflation_risk'] = ctx.get('high_inflation_risk', 0)
    features['holder_count'] = ctx.get('holder_count', 0)
    features['low_holder_count'] = ctx.get('low_holder_count', 0)
    features['top_10_concentration'] = ctx.get('top_10_concentration', 0)
    features['high_concentration'] = ctx.get('high_concentration', 0)
    features['extreme_concentration'] = ctx.get('extreme_concentration', 0)

    # Contract security (CRITICAL for crypto)
    features['is_honeypot'] = ctx.get('is_honeypot', 0)
    features['can_mint'] = ctx.get('can_mint', 0)
    features['hidden_owner'] = ctx.get('hidden_owner', 0)
    features['can_blacklist'] = ctx.get('can_blacklist', 0)
    features['owner_can_change_balance'] = ctx.get('owner_can_change_balance', 0)
    features['high_buy_tax'] = ctx.get('high_buy_tax', 0)
    features['high_sell_tax'] = ctx.get('high_sell_tax', 0)
    features['extreme_tax'] = ctx.get('extreme_tax', 0)
    features['lp_locked'] = ctx.get('lp_locked', 0)
    features['short_lp_lock'] = ctx.get('short_lp_lock', 0)
    features['security_score'] = ctx.get('security_score', 50)

    # News
    features['has_news'] = ctx.get('has_news', 0)

    # Convert to array
    feature_names = list(features.keys())
    feature_array = np.array([features[name] for name in feature_names])

    return feature_array, feature_names


def engineer_all_crypto_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply all crypto-specific feature engineering.

    Uses crypto-calibrated thresholds throughout.
    """
    df = compute_crypto_rolling_statistics(df)
    df = compute_crypto_volatility(df)
    df = compute_crypto_surge_metrics(df)
    df = compute_crypto_momentum(df)

    # Fill NaN
    df = df.fillna(0)

    return df


def compute_crypto_risk_score(
    features: Dict[str, float],
    feature_names: List[str] = None
) -> Tuple[float, List[Dict]]:
    """
    Compute risk score using crypto-specific signal weights.

    Returns:
        Tuple of (risk_probability, list of triggered signals)
    """
    signals = []
    total_weight = 0
    max_weight = 100  # For normalization

    # CRITICAL SIGNALS (automatic high risk)
    if features.get('is_honeypot', 0):
        signals.append({
            'code': 'HONEYPOT',
            'category': 'CONTRACT',
            'description': 'Token is a honeypot - cannot sell',
            'weight': CRYPTO_RISK_SIGNALS['HONEYPOT']
        })
        total_weight += CRYPTO_RISK_SIGNALS['HONEYPOT']

    if features.get('owner_can_change_balance', 0):
        signals.append({
            'code': 'OWNER_CAN_CHANGE_BALANCE',
            'category': 'CONTRACT',
            'description': 'Owner can modify wallet balances',
            'weight': CRYPTO_RISK_SIGNALS['OWNER_CAN_CHANGE_BALANCE']
        })
        total_weight += CRYPTO_RISK_SIGNALS['OWNER_CAN_CHANGE_BALANCE']

    # CONTRACT SECURITY SIGNALS
    if features.get('hidden_owner', 0):
        signals.append({
            'code': 'HIDDEN_OWNER',
            'category': 'CONTRACT',
            'description': 'Contract owner is hidden via proxy',
            'weight': CRYPTO_RISK_SIGNALS['HIDDEN_OWNER']
        })
        total_weight += CRYPTO_RISK_SIGNALS['HIDDEN_OWNER']

    if features.get('can_mint', 0):
        signals.append({
            'code': 'CAN_MINT',
            'category': 'CONTRACT',
            'description': 'Unlimited token minting possible',
            'weight': CRYPTO_RISK_SIGNALS['CAN_MINT']
        })
        total_weight += CRYPTO_RISK_SIGNALS['CAN_MINT']

    if features.get('high_sell_tax', 0):
        signals.append({
            'code': 'HIGH_SELL_TAX',
            'category': 'CONTRACT',
            'description': 'Sell tax exceeds 10%',
            'weight': CRYPTO_RISK_SIGNALS['HIGH_SELL_TAX']
        })
        total_weight += CRYPTO_RISK_SIGNALS['HIGH_SELL_TAX']

    if features.get('high_buy_tax', 0):
        signals.append({
            'code': 'HIGH_BUY_TAX',
            'category': 'CONTRACT',
            'description': 'Buy tax exceeds 10%',
            'weight': CRYPTO_RISK_SIGNALS['HIGH_BUY_TAX']
        })
        total_weight += CRYPTO_RISK_SIGNALS['HIGH_BUY_TAX']

    # LIQUIDITY SIGNALS
    if not features.get('lp_locked', 0) and not features.get('is_established', 0):
        signals.append({
            'code': 'LP_NOT_LOCKED',
            'category': 'LIQUIDITY',
            'description': 'Liquidity pool is not locked',
            'weight': CRYPTO_RISK_SIGNALS['LP_NOT_LOCKED']
        })
        total_weight += CRYPTO_RISK_SIGNALS['LP_NOT_LOCKED']

    if features.get('short_lp_lock', 0):
        signals.append({
            'code': 'LP_LOW_LOCK_DURATION',
            'category': 'LIQUIDITY',
            'description': 'LP lock duration is less than 6 months',
            'weight': CRYPTO_RISK_SIGNALS['LP_LOW_LOCK_DURATION']
        })
        total_weight += CRYPTO_RISK_SIGNALS['LP_LOW_LOCK_DURATION']

    if features.get('low_liquidity_ratio', 0):
        signals.append({
            'code': 'LOW_LIQUIDITY_RATIO',
            'category': 'LIQUIDITY',
            'description': 'Trading liquidity is below 1% of market cap',
            'weight': CRYPTO_RISK_SIGNALS['LOW_LIQUIDITY_RATIO']
        })
        total_weight += CRYPTO_RISK_SIGNALS['LOW_LIQUIDITY_RATIO']

    # DISTRIBUTION SIGNALS
    if features.get('high_concentration', 0):
        signals.append({
            'code': 'HIGH_HOLDER_CONCENTRATION',
            'category': 'DISTRIBUTION',
            'description': 'Top 10 holders control over 50% of supply',
            'weight': CRYPTO_RISK_SIGNALS['HIGH_HOLDER_CONCENTRATION']
        })
        total_weight += CRYPTO_RISK_SIGNALS['HIGH_HOLDER_CONCENTRATION']

    if features.get('low_holder_count', 0):
        signals.append({
            'code': 'LOW_HOLDER_COUNT',
            'category': 'DISTRIBUTION',
            'description': 'Fewer than 100 token holders',
            'weight': CRYPTO_RISK_SIGNALS['LOW_HOLDER_COUNT']
        })
        total_weight += CRYPTO_RISK_SIGNALS['LOW_HOLDER_COUNT']

    # MARKET PATTERN SIGNALS
    if features.get('pump_pattern', 0):
        signals.append({
            'code': 'PUMP_PATTERN',
            'category': 'PATTERN',
            'description': 'Price pump with volume explosion detected',
            'weight': CRYPTO_RISK_SIGNALS['PUMP_PATTERN']
        })
        total_weight += CRYPTO_RISK_SIGNALS['PUMP_PATTERN']

    if features.get('spike_then_drop', 0):
        signals.append({
            'code': 'SPIKE_THEN_DROP',
            'category': 'PATTERN',
            'description': 'Price spiked then dropped significantly',
            'weight': CRYPTO_RISK_SIGNALS['PUMP_PATTERN']
        })
        total_weight += CRYPTO_RISK_SIGNALS['PUMP_PATTERN']

    if features.get('is_extreme_volatility', 0):
        signals.append({
            'code': 'EXTREME_VOLATILITY',
            'category': 'PATTERN',
            'description': 'Extremely high price volatility detected',
            'weight': CRYPTO_RISK_SIGNALS['EXTREME_VOLATILITY']
        })
        total_weight += CRYPTO_RISK_SIGNALS['EXTREME_VOLATILITY']

    if features.get('volume_explosion_extreme', 0):
        signals.append({
            'code': 'VOLUME_MANIPULATION',
            'category': 'PATTERN',
            'description': 'Extreme volume surge (20x normal) detected',
            'weight': CRYPTO_RISK_SIGNALS['VOLUME_MANIPULATION']
        })
        total_weight += CRYPTO_RISK_SIGNALS['VOLUME_MANIPULATION']

    # STRUCTURAL SIGNALS
    if features.get('is_micro_cap', 0) and not features.get('is_established', 0):
        signals.append({
            'code': 'NEW_TOKEN',
            'category': 'STRUCTURAL',
            'description': 'Micro-cap token with limited track record',
            'weight': CRYPTO_RISK_SIGNALS['NEW_TOKEN']
        })
        total_weight += CRYPTO_RISK_SIGNALS['NEW_TOKEN']

    # Calculate probability (capped at 1.0)
    risk_probability = min(total_weight / max_weight, 1.0)

    # Reduce risk for established cryptos
    if features.get('is_established', 0) and not features.get('is_honeypot', 0):
        risk_probability *= 0.5  # 50% reduction for established cryptos

    return risk_probability, signals


if __name__ == '__main__':
    print("=" * 60)
    print("Testing Crypto Feature Engineering Module")
    print("=" * 60)

    # Test with synthetic data
    from data_ingestion import generate_synthetic_crypto_data, preprocess_price_data

    print("\n1. Generating crypto test data...")
    df = generate_synthetic_crypto_data('TEST', minutes=43200, include_pump=True)

    # Convert to daily for easier testing
    df['Date'] = df['Timestamp'].dt.date
    daily = df.groupby('Date').agg({
        'Open': 'first',
        'High': 'max',
        'Low': 'min',
        'Close': 'last',
        'Volume': 'sum'
    }).reset_index()
    daily.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
    daily = preprocess_price_data(daily)

    print(f"   Generated {len(daily)} days of data")

    print("\n2. Engineering all crypto features...")
    df_features = engineer_all_crypto_features(daily)
    print(f"   Total columns: {len(df_features.columns)}")

    print("\n3. Testing crypto-specific thresholds...")
    latest = df_features.iloc[-1]
    print(f"   Price Change 7d: {latest.get('Price_Change_7d', 0)*100:.1f}%")
    print(f"   Is Pumping (crypto threshold 80%): {bool(latest.get('Is_Pumping_7d', 0))}")
    print(f"   Volume Surge: {latest.get('Volume_Surge_Factor', 0):.1f}x")

    print("\n4. Testing contextual features...")
    test_fundamentals = {
        'symbol': 'TEST',
        'market_cap': 5_000_000,
        'volume_24h': 100_000,
        'circulating_supply': 1_000_000,
        'total_supply': 10_000_000,
        'holder_count': 50,
        'top_10_concentration': 0.7
    }
    test_security = {
        'is_honeypot': False,
        'is_mintable': True,
        'hidden_owner': False,
        'buy_tax': 0.05,
        'sell_tax': 0.15,
        'lp_locked': False
    }

    ctx = extract_crypto_contextual_features(test_fundamentals, test_security)
    print(f"   Is Micro Cap: {bool(ctx['is_micro_cap'])}")
    print(f"   High Concentration: {bool(ctx['high_concentration'])}")
    print(f"   High Sell Tax: {bool(ctx['high_sell_tax'])}")
    print(f"   LP Locked: {bool(ctx['lp_locked'])}")

    print("\n5. Testing risk score computation...")
    features, names = create_crypto_feature_vector(df_features, test_fundamentals, test_security)
    feature_dict = dict(zip(names, features))
    risk_prob, signals = compute_crypto_risk_score(feature_dict)
    print(f"   Risk Probability: {risk_prob:.2f}")
    print(f"   Triggered Signals: {len(signals)}")
    for sig in signals[:3]:
        print(f"     - {sig['code']}: {sig['description']}")

    print("\n" + "=" * 60)
    print("Crypto Feature Engineering Tests Complete!")
    print("=" * 60)
