"""
Anomaly Detection Module for Scam Detection System.

This module implements statistical anomaly detection using:
- Rolling Z-scores for price and volume
- Keltner Channel breakouts
- Surge detection (volume and price)
- Combined anomaly scoring

The module is configurable via threshold parameters.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union
from dataclasses import dataclass

from config import ANOMALY_CONFIG


@dataclass
class AnomalyResult:
    """Container for anomaly detection results."""
    is_anomaly: bool
    anomaly_score: float
    anomaly_types: List[str]
    details: Dict[str, Union[float, bool, str]]


def detect_zscore_anomalies(
    df: pd.DataFrame,
    z_threshold: float = None,
    volume_z_threshold: float = None
) -> Dict[str, Union[bool, float, List[str]]]:
    """
    Detect anomalies based on Z-score analysis.

    Args:
        df: DataFrame with computed Z-scores
        z_threshold: Threshold for price/return Z-scores
        volume_z_threshold: Threshold for volume Z-scores

    Returns:
        Dictionary with Z-score anomaly analysis
    """
    z_threshold = z_threshold or ANOMALY_CONFIG['z_score_threshold']
    volume_z_threshold = volume_z_threshold or ANOMALY_CONFIG['volume_z_threshold']

    latest = df.iloc[-1]

    # Get Z-scores (use absolute values for magnitude)
    return_z_short = abs(latest.get('Return_ZScore_Short', 0))
    return_z_long = abs(latest.get('Return_ZScore_Long', 0))
    price_z_long = abs(latest.get('Price_ZScore_Long', 0))
    volume_z_short = latest.get('Volume_ZScore_Short', 0)  # Keep direction for volume
    volume_z_long = latest.get('Volume_ZScore_Long', 0)

    anomalies_found = []

    # Check return Z-scores
    if return_z_short > z_threshold:
        anomalies_found.append('extreme_return_short_term')
    if return_z_long > z_threshold:
        anomalies_found.append('extreme_return_long_term')

    # Check price deviation from mean
    if price_z_long > z_threshold:
        anomalies_found.append('price_deviation_from_mean')

    # Check volume spikes (usually positive = anomaly)
    if volume_z_short > volume_z_threshold:
        anomalies_found.append('volume_spike_short_term')
    if volume_z_long > volume_z_threshold:
        anomalies_found.append('volume_spike_long_term')

    # Calculate combined score (0-1 scale)
    max_z = max(return_z_short, return_z_long, price_z_long,
                max(0, volume_z_short), max(0, volume_z_long))

    # Normalize score: z=3 -> 0.5, z=6 -> ~0.9
    normalized_score = 1 - (1 / (1 + max_z / z_threshold))

    return {
        'is_anomaly': len(anomalies_found) > 0,
        'anomaly_score': normalized_score,
        'anomaly_types': anomalies_found,
        'return_z_short': return_z_short,
        'return_z_long': return_z_long,
        'price_z_long': price_z_long,
        'volume_z_short': volume_z_short,
        'volume_z_long': volume_z_long,
    }


def detect_volatility_anomalies(
    df: pd.DataFrame
) -> Dict[str, Union[bool, float, List[str]]]:
    """
    Detect anomalies based on volatility indicators (Keltner Channels, ATR).

    Args:
        df: DataFrame with volatility indicators

    Returns:
        Dictionary with volatility anomaly analysis
    """
    latest = df.iloc[-1]

    anomalies_found = []

    # Keltner Channel breakouts
    keltner_position = latest.get('Keltner_Position', 0.5)
    breakout_upper = latest.get('Keltner_Breakout_Upper', 0)
    breakout_lower = latest.get('Keltner_Breakout_Lower', 0)

    if breakout_upper:
        anomalies_found.append('keltner_upper_breakout')
    if breakout_lower:
        anomalies_found.append('keltner_lower_breakout')

    # Extreme Keltner position (outside 0-1 range indicates breakout)
    if keltner_position > 1.2:
        anomalies_found.append('extreme_keltner_high')
    elif keltner_position < -0.2:
        anomalies_found.append('extreme_keltner_low')

    # ATR anomaly (extremely high volatility)
    atr_percent = latest.get('ATR_Percent', 0)
    if atr_percent > 10:  # ATR > 10% of price is unusual
        anomalies_found.append('extreme_volatility')

    # Calculate score based on Keltner position deviation
    position_deviation = abs(keltner_position - 0.5) * 2  # 0-1+ scale
    volatility_factor = min(atr_percent / 10, 1)  # 0-1 scale

    score = min((position_deviation + volatility_factor) / 2, 1)

    return {
        'is_anomaly': len(anomalies_found) > 0,
        'anomaly_score': score,
        'anomaly_types': anomalies_found,
        'keltner_position': keltner_position,
        'breakout_upper': bool(breakout_upper),
        'breakout_lower': bool(breakout_lower),
        'atr_percent': atr_percent,
    }


def detect_surge_anomalies(
    df: pd.DataFrame,
    price_surge_threshold: float = None,
    volume_surge_threshold: float = None
) -> Dict[str, Union[bool, float, List[str]]]:
    """
    Detect price and volume surge anomalies.

    Args:
        df: DataFrame with surge metrics
        price_surge_threshold: Threshold for 7-day price surge
        volume_surge_threshold: Threshold for volume surge factor

    Returns:
        Dictionary with surge anomaly analysis
    """
    price_threshold = price_surge_threshold or ANOMALY_CONFIG['price_surge_7d_threshold']
    volume_threshold = volume_surge_threshold or ANOMALY_CONFIG['volume_surge_moderate']

    latest = df.iloc[-1]

    anomalies_found = []

    # Price surges
    price_change_1d = abs(latest.get('Price_Change_1d', 0))
    price_change_7d = latest.get('Price_Change_7d', 0)  # Keep direction
    price_change_30d = latest.get('Price_Change_30d', 0)

    if price_change_1d > ANOMALY_CONFIG['price_surge_1d_threshold']:
        anomalies_found.append('daily_price_surge')

    if abs(price_change_7d) > price_threshold:
        if price_change_7d > 0:
            anomalies_found.append('weekly_price_pump')
        else:
            anomalies_found.append('weekly_price_dump')

    if abs(price_change_7d) > ANOMALY_CONFIG['price_surge_extreme']:
        anomalies_found.append('extreme_weekly_price_move')

    # Volume surges
    volume_surge = latest.get('Volume_Surge_Factor', 1)
    if volume_surge >= ANOMALY_CONFIG['volume_surge_extreme']:
        anomalies_found.append('extreme_volume_explosion')
    elif volume_surge >= volume_threshold:
        anomalies_found.append('volume_explosion')

    # Pump pattern (price up + volume up)
    pump_pattern = latest.get('Pump_Pattern', 0)
    if pump_pattern:
        anomalies_found.append('pump_pattern_detected')

    # Calculate score
    price_score = min(abs(price_change_7d) / price_threshold, 2) / 2  # Cap at 1
    volume_score = min(volume_surge / volume_threshold, 2) / 2  # Cap at 1
    score = max(price_score, volume_score)

    return {
        'is_anomaly': len(anomalies_found) > 0,
        'anomaly_score': score,
        'anomaly_types': anomalies_found,
        'price_change_1d': price_change_1d * 100,  # Convert to %
        'price_change_7d': price_change_7d * 100,
        'price_change_30d': price_change_30d * 100,
        'volume_surge_factor': volume_surge,
        'pump_pattern': bool(pump_pattern),
    }


def detect_pattern_anomalies(
    df: pd.DataFrame,
    lookback: int = 14
) -> Dict[str, Union[bool, float, List[str]]]:
    """
    Detect suspicious patterns in recent data.

    Args:
        df: DataFrame with price/volume data
        lookback: Number of days to analyze for patterns

    Returns:
        Dictionary with pattern anomaly analysis
    """
    if len(df) < lookback:
        return {
            'is_anomaly': False,
            'anomaly_score': 0,
            'anomaly_types': [],
            'pattern_info': 'Insufficient data for pattern analysis'
        }

    recent = df.tail(lookback)
    anomalies_found = []

    # Pattern 1: Pump and Dump (rapid rise followed by drop)
    if 'Price_Change_7d' in recent.columns:
        # Check if there was a pump followed by a dump
        max_price_idx = recent['Close'].idxmax()
        max_price_position = recent.index.get_loc(max_price_idx)

        if max_price_position > lookback // 3 and max_price_position < lookback * 2 // 3:
            # Price peaked in the middle of the window
            pre_peak = recent.iloc[:max_price_position + 1]
            post_peak = recent.iloc[max_price_position:]

            if len(pre_peak) > 2 and len(post_peak) > 2:
                pre_peak_return = (pre_peak['Close'].iloc[-1] / pre_peak['Close'].iloc[0]) - 1
                post_peak_return = (post_peak['Close'].iloc[-1] / post_peak['Close'].iloc[0]) - 1

                if pre_peak_return > 0.3 and post_peak_return < -0.2:
                    anomalies_found.append('pump_and_dump_pattern')

    # Pattern 2: Coordinated volume/price (both spike together)
    if 'Volume_Surge_Factor' in recent.columns:
        high_vol_days = (recent['Volume_Surge_Factor'] > 3).sum()
        high_price_move_days = (recent['Price_Change_1d'].abs() > 0.05).sum()

        if high_vol_days >= 3 and high_price_move_days >= 3:
            anomalies_found.append('coordinated_volume_price_activity')

    # Pattern 3: Unusual consistency (too smooth/manipulated)
    returns = recent['Return'].dropna()
    if len(returns) > 5:
        # Check for unusually low variance (possible manipulation)
        positive_streak = (returns > 0).sum()
        if positive_streak > lookback * 0.8:
            anomalies_found.append('suspicious_positive_streak')

    # Calculate score
    score = min(len(anomalies_found) * 0.3, 1)

    return {
        'is_anomaly': len(anomalies_found) > 0,
        'anomaly_score': score,
        'anomaly_types': anomalies_found,
        'lookback_period': lookback,
    }


def detect_anomalies(
    df: pd.DataFrame,
    news_flag: bool = False,
    sensitivity: float = 1.0
) -> AnomalyResult:
    """
    Main anomaly detection function combining all detection methods.

    Args:
        df: DataFrame with all engineered features
        news_flag: Whether significant news exists (reduces false positives)
        sensitivity: Sensitivity multiplier (>1 = more sensitive)

    Returns:
        AnomalyResult with comprehensive anomaly analysis
    """
    # Run all anomaly detectors
    zscore_result = detect_zscore_anomalies(df)
    volatility_result = detect_volatility_anomalies(df)
    surge_result = detect_surge_anomalies(df)
    pattern_result = detect_pattern_anomalies(df)

    # Collect all anomaly types
    all_anomaly_types = (
        zscore_result['anomaly_types'] +
        volatility_result['anomaly_types'] +
        surge_result['anomaly_types'] +
        pattern_result['anomaly_types']
    )

    # Calculate combined score (weighted average)
    weights = {
        'zscore': 0.25,
        'volatility': 0.2,
        'surge': 0.35,  # Surge is most indicative of pump/dump
        'pattern': 0.2,
    }

    combined_score = (
        zscore_result['anomaly_score'] * weights['zscore'] +
        volatility_result['anomaly_score'] * weights['volatility'] +
        surge_result['anomaly_score'] * weights['surge'] +
        pattern_result['anomaly_score'] * weights['pattern']
    )

    # Apply sensitivity multiplier
    combined_score = min(combined_score * sensitivity, 1.0)

    # Reduce score if there's a news explanation
    if news_flag and combined_score > 0.3:
        combined_score *= 0.6  # Reduce by 40% if news exists
        all_anomaly_types = [t for t in all_anomaly_types
                           if t not in ['daily_price_surge', 'weekly_price_pump']]

    # Determine if this is an anomaly (threshold: 0.4)
    is_anomaly = combined_score > 0.4 or len(all_anomaly_types) >= 3

    # Compile details
    details = {
        'zscore_analysis': zscore_result,
        'volatility_analysis': volatility_result,
        'surge_analysis': surge_result,
        'pattern_analysis': pattern_result,
        'news_adjusted': news_flag,
        'sensitivity': sensitivity,
        'component_scores': {
            'zscore': zscore_result['anomaly_score'],
            'volatility': volatility_result['anomaly_score'],
            'surge': surge_result['anomaly_score'],
            'pattern': pattern_result['anomaly_score'],
        }
    }

    return AnomalyResult(
        is_anomaly=is_anomaly,
        anomaly_score=combined_score,
        anomaly_types=all_anomaly_types,
        details=details
    )


def get_anomaly_explanation(result: AnomalyResult) -> str:
    """
    Generate human-readable explanation of anomaly detection.

    Args:
        result: AnomalyResult from detect_anomalies

    Returns:
        Human-readable explanation string
    """
    if not result.is_anomaly:
        return "No significant anomalies detected. Market behavior appears within normal ranges."

    explanations = []

    # Map anomaly types to explanations
    anomaly_messages = {
        'extreme_return_short_term': 'Unusually large price movement in recent days',
        'extreme_return_long_term': 'Abnormal price trend over the past month',
        'price_deviation_from_mean': 'Price significantly deviates from historical average',
        'volume_spike_short_term': 'Abnormal trading volume spike in recent days',
        'volume_spike_long_term': 'Trading volume significantly above historical average',
        'keltner_upper_breakout': 'Price broke above volatility band (potential overbought)',
        'keltner_lower_breakout': 'Price broke below volatility band (potential oversold)',
        'extreme_volatility': 'Extremely high price volatility',
        'daily_price_surge': 'Large single-day price movement',
        'weekly_price_pump': 'Significant price increase over 7 days (potential pump)',
        'weekly_price_dump': 'Significant price decrease over 7 days (potential dump)',
        'extreme_weekly_price_move': 'Extreme price movement exceeding 100% in 7 days',
        'volume_explosion': 'Trading volume 5x+ above normal (suspicious)',
        'extreme_volume_explosion': 'Trading volume 10x+ above normal (highly suspicious)',
        'pump_pattern_detected': 'Combined price pump + volume explosion detected',
        'pump_and_dump_pattern': 'Classic pump-and-dump pattern detected',
        'coordinated_volume_price_activity': 'Coordinated volume/price movements suggest manipulation',
        'suspicious_positive_streak': 'Unusually consistent positive returns (possible manipulation)',
    }

    for anomaly_type in result.anomaly_types:
        if anomaly_type in anomaly_messages:
            explanations.append(f"  - {anomaly_messages[anomaly_type]}")
        else:
            explanations.append(f"  - {anomaly_type.replace('_', ' ').title()}")

    # Add quantitative details
    details = result.details
    surge = details.get('surge_analysis', {})
    if surge.get('price_change_7d', 0) != 0:
        explanations.append(f"\n  7-day price change: {surge['price_change_7d']:.1f}%")
    if surge.get('volume_surge_factor', 1) > 2:
        explanations.append(f"  Volume surge factor: {surge['volume_surge_factor']:.1f}x normal")

    header = f"ANOMALY DETECTED (Score: {result.anomaly_score:.2f})\n"
    body = "\n".join(explanations)

    return header + "Detected issues:\n" + body


if __name__ == '__main__':
    import sys
    sys.path.insert(0, '/home/user/scam-dunk-re-write-claude-code/python_ai')
    from data_ingestion import generate_synthetic_stock_data, preprocess_price_data
    from feature_engineering import engineer_all_features

    print("=" * 60)
    print("Testing Anomaly Detection Module")
    print("=" * 60)

    # Test 1: Normal market data
    print("\n1. Testing with NORMAL market data:")
    normal_data = generate_synthetic_stock_data('NORMAL', days=90, include_pump=False)
    normal_data = preprocess_price_data(normal_data)
    normal_data = engineer_all_features(normal_data)

    normal_result = detect_anomalies(normal_data)
    print(f"   Is Anomaly: {normal_result.is_anomaly}")
    print(f"   Anomaly Score: {normal_result.anomaly_score:.3f}")
    print(f"   Anomaly Types: {normal_result.anomaly_types}")

    # Test 2: Pump-and-dump pattern
    print("\n2. Testing with PUMP-AND-DUMP data:")
    pump_data = generate_synthetic_stock_data(
        'PUMP', days=90, include_pump=True,
        pump_start_day=75, pump_duration=10, pump_magnitude=2.0
    )
    pump_data = preprocess_price_data(pump_data)
    pump_data = engineer_all_features(pump_data)

    pump_result = detect_anomalies(pump_data)
    print(f"   Is Anomaly: {pump_result.is_anomaly}")
    print(f"   Anomaly Score: {pump_result.anomaly_score:.3f}")
    print(f"   Anomaly Types: {pump_result.anomaly_types}")

    # Test 3: Explanation generation
    print("\n3. Testing explanation generation:")
    explanation = get_anomaly_explanation(pump_result)
    print(explanation)

    # Test 4: With news flag (should reduce false positives)
    print("\n4. Testing with NEWS flag (should reduce score):")
    news_result = detect_anomalies(pump_data, news_flag=True)
    print(f"   Without news - Score: {pump_result.anomaly_score:.3f}")
    print(f"   With news - Score: {news_result.anomaly_score:.3f}")

    # Test 5: Sensitivity adjustment
    print("\n5. Testing sensitivity adjustment:")
    high_sensitivity = detect_anomalies(normal_data, sensitivity=2.0)
    low_sensitivity = detect_anomalies(pump_data, sensitivity=0.5)
    print(f"   Normal data with 2x sensitivity - Anomaly: {high_sensitivity.is_anomaly}")
    print(f"   Pump data with 0.5x sensitivity - Anomaly: {low_sensitivity.is_anomaly}")

    # Test 6: Component scores
    print("\n6. Component score breakdown (pump data):")
    scores = pump_result.details['component_scores']
    for component, score in scores.items():
        print(f"   {component}: {score:.3f}")

    print("\n" + "=" * 60)
    print("Anomaly Detection Module Tests Complete!")
    print("=" * 60)
