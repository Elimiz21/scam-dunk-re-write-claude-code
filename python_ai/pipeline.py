"""
Integration Pipeline Module for Scam Detection System.

This module combines all components into a coherent pipeline:
1. Data loading and preprocessing
2. Feature engineering
3. Anomaly detection
4. Random Forest prediction (Stage 1)
5. LSTM prediction (Stage 2)
6. Result combination and calibration
7. Risk assessment and explainability

The pipeline provides a simple interface for end-to-end scam detection.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union
from dataclasses import dataclass, field
from datetime import datetime
import warnings
import os

warnings.filterwarnings('ignore')

# Import all modules
from config import (
    RISK_THRESHOLDS, ANOMALY_CONFIG, ENSEMBLE_CONFIG,
    SEC_FLAGGED_TICKERS, OTC_EXCHANGES, MARKET_THRESHOLDS
)
from data_ingestion import (
    create_asset_context, check_sec_flagged_list,
    load_stock_data, get_stock_fundamentals, preprocess_price_data
)
from feature_engineering import (
    engineer_all_features, create_feature_vector, extract_contextual_features
)
from anomaly_detection import detect_anomalies, get_anomaly_explanation, AnomalyResult
from ml_model import ScamDetectorRF
from lstm_model import ScamDetectorLSTM


@dataclass
class RiskAssessment:
    """Container for the complete risk assessment output."""
    ticker: str
    risk_level: str
    risk_score: float
    rf_probability: float
    lstm_probability: Optional[float]
    combined_probability: float
    anomaly_detected: bool
    anomaly_score: float
    anomaly_types: List[str]
    sec_flagged: bool
    key_indicators: List[str]
    explanation: str
    detailed_report: Dict
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class ScamDetectionPipeline:
    """Main pipeline for scam detection integrating all components."""

    def __init__(
        self,
        load_models: bool = True,
        rf_model_path: str = None,
        lstm_model_path: str = None
    ):
        """
        Initialize the scam detection pipeline.

        Args:
            load_models: Whether to load pre-trained models
            rf_model_path: Path to Random Forest model
            lstm_model_path: Path to LSTM model
        """
        self.rf_detector = ScamDetectorRF()
        self.lstm_detector = ScamDetectorLSTM()
        self.rf_available = False
        self.lstm_available = False

        if load_models:
            self.rf_available = self.rf_detector.load(rf_model_path)
            self.lstm_available = self.lstm_detector.load(lstm_model_path)

    def train_models(
        self,
        train_rf: bool = True,
        train_lstm: bool = True,
        lstm_epochs: int = 50,
        save_models: bool = True
    ):
        """
        Train the ML models with synthetic data.

        Args:
            train_rf: Whether to train Random Forest model
            train_lstm: Whether to train LSTM model
            lstm_epochs: Number of epochs for LSTM training
            save_models: Whether to save trained models
        """
        if train_rf:
            print("Training Random Forest model...")
            self.rf_detector.train()
            self.rf_available = True
            if save_models:
                self.rf_detector.save()

        if train_lstm:
            print("\nTraining LSTM model...")
            self.lstm_detector.train(epochs=lstm_epochs, verbose=1)
            self.lstm_available = True
            if save_models:
                self.lstm_detector.save()

    def calibrate_probability(self, probability: float) -> str:
        """
        Map probability to risk level using calibration thresholds.

        Args:
            probability: Raw probability (0-1)

        Returns:
            Risk level string (LOW, MEDIUM, HIGH)
        """
        if probability < RISK_THRESHOLDS['LOW']:
            return 'LOW'
        elif probability < RISK_THRESHOLDS['MEDIUM']:
            return 'MEDIUM'
        else:
            return 'HIGH'

    def combine_predictions(
        self,
        rf_prob: float,
        lstm_prob: Optional[float],
        anomaly_result: AnomalyResult,
        sec_flagged: bool,
        is_otc: bool = False,
        is_micro_cap: bool = False
    ) -> float:
        """
        Combine predictions from multiple models.

        Decision logic:
        1. If SEC flagged, immediately boost probability to HIGH risk
        2. If anomaly detected, apply anomaly boost
        3. Combine RF and LSTM using weighted average or max strategy
        4. Apply floor based on severe anomalies
        5. Apply additional boost for OTC + pattern combinations

        Args:
            rf_prob: Random Forest probability
            lstm_prob: LSTM probability (can be None if not available)
            anomaly_result: Result from anomaly detection
            sec_flagged: Whether ticker is on SEC flagged list
            is_otc: Whether traded on OTC exchange
            is_micro_cap: Whether micro-cap (< $50M market cap)

        Returns:
            Combined probability score
        """
        # Start with RF probability
        combined = rf_prob

        # If LSTM is available, combine predictions
        if lstm_prob is not None:
            if ENSEMBLE_CONFIG['use_max_strategy']:
                # Use maximum of both models
                combined = max(rf_prob, lstm_prob)
            else:
                # Weighted average
                rf_weight = ENSEMBLE_CONFIG['rf_weight']
                lstm_weight = ENSEMBLE_CONFIG['lstm_weight']
                combined = (rf_prob * rf_weight + lstm_prob * lstm_weight)

        # Apply anomaly boost if detected
        if anomaly_result.is_anomaly:
            anomaly_boost = anomaly_result.anomaly_score * 0.3
            combined = min(combined + anomaly_boost, 1.0)

        # SEC flag is a CRITICAL indicator - heavily boost probability
        if sec_flagged:
            # Minimum 0.85 probability if SEC flagged
            combined = max(combined, 0.85)

        # Early warning: OTC with any notable movement (new threshold-based logic)
        # Research shows OTC + movement is highly suspicious even at lower thresholds
        price_change_7d = anomaly_result.details.get('surge_analysis', {}).get('price_change_7d', 0) / 100
        volume_surge = anomaly_result.details.get('surge_analysis', {}).get('volume_surge_factor', 1)

        if is_otc and (abs(price_change_7d) > 0.15 or volume_surge > 2.5):
            combined = max(combined, 0.45)  # Ensures at least upper-MEDIUM

        # Structural risk: OTC + micro-cap even without patterns
        if is_otc and is_micro_cap:
            combined = max(combined, 0.50)  # High-risk structure

        # Severe patterns detection
        severe_anomalies = ['pump_and_dump_pattern', 'pump_pattern_detected',
                          'extreme_volume_explosion', 'extreme_weekly_price_move',
                          'coordinated_volume_price_activity', 'extreme_volatility']
        has_severe_pattern = any(a in anomaly_result.anomaly_types for a in severe_anomalies)

        # Apply floor for severe patterns (raised from 0.6 to 0.65 to guarantee HIGH with 0.55 threshold)
        if has_severe_pattern:
            combined = max(combined, 0.65)

        # CRITICAL: OTC + severe pattern + micro-cap = HIGH risk
        # This is the classic pump-and-dump setup
        if has_severe_pattern and is_otc:
            combined = max(combined, 0.75)
        if has_severe_pattern and is_otc and is_micro_cap:
            combined = max(combined, 0.80)

        # Micro-cap with severe patterns is suspicious regardless of exchange
        if has_severe_pattern and is_micro_cap:
            combined = max(combined, 0.70)

        # Additional boost for multiple risk factors
        risk_factor_count = sum([is_otc, is_micro_cap, has_severe_pattern,
                                 anomaly_result.is_anomaly, sec_flagged])
        if risk_factor_count >= 3:
            combined = max(combined, 0.70)
        if risk_factor_count >= 4:
            combined = max(combined, 0.80)

        return min(combined, 1.0)

    def generate_explanation(
        self,
        context: Dict,
        features: np.ndarray,
        feature_names: List[str],
        anomaly_result: AnomalyResult,
        combined_prob: float
    ) -> Tuple[str, List[str]]:
        """
        Generate human-readable explanation of the risk assessment.

        Args:
            context: Asset context dictionary
            features: Feature vector
            feature_names: Names of features
            anomaly_result: Anomaly detection result
            combined_prob: Combined probability score

        Returns:
            Tuple of (explanation_string, key_indicators_list)
        """
        key_indicators = []
        explanations = []

        # Create feature dictionary for easy access
        feature_dict = dict(zip(feature_names, features))

        # Check SEC flag (CRITICAL)
        if context['sec_flagged']['is_flagged']:
            key_indicators.append("SEC regulatory alert")
            explanations.append("CRITICAL: Asset appears on SEC trading suspension/alert list")

        # Check for OTC exchange
        if context['fundamentals'].get('is_otc', False):
            key_indicators.append("OTC/Pink Sheets exchange")
            explanations.append("Listed on over-the-counter market (higher risk)")

        # Check market cap
        market_cap = context['fundamentals'].get('market_cap', 0)
        if market_cap < MARKET_THRESHOLDS['micro_cap']:
            key_indicators.append(f"Micro-cap (${market_cap/1e6:.1f}M)")
            explanations.append(f"Very small market cap: ${market_cap/1e6:.1f}M")
        elif market_cap < MARKET_THRESHOLDS['small_cap']:
            key_indicators.append(f"Small-cap (${market_cap/1e6:.1f}M)")

        # Check price changes
        price_7d = feature_dict.get('price_change_7d', 0) * 100
        if abs(price_7d) > 50:
            direction = "+" if price_7d > 0 else ""
            key_indicators.append(f"7-day price: {direction}{price_7d:.0f}%")
            explanations.append(f"Large price movement: {direction}{price_7d:.0f}% in 7 days")

        # Check volume surge
        vol_surge = feature_dict.get('volume_surge_factor', 1)
        if vol_surge > 5:
            key_indicators.append(f"Volume surge: {vol_surge:.0f}x normal")
            explanations.append(f"Trading volume {vol_surge:.0f}x above normal average")

        # Check anomaly types
        if 'pump_and_dump_pattern' in anomaly_result.anomaly_types:
            key_indicators.append("Pump-and-dump pattern")
            explanations.append("Classic pump-and-dump trading pattern detected")
        if 'pump_pattern_detected' in anomaly_result.anomaly_types:
            key_indicators.append("Pump pattern active")
            explanations.append("Active pump pattern: rising price + exploding volume")
        if 'extreme_volume_explosion' in anomaly_result.anomaly_types:
            key_indicators.append("Extreme volume spike")

        # Check RSI (overbought)
        rsi = feature_dict.get('rsi_14', 50)
        if rsi > 80:
            key_indicators.append(f"Overbought (RSI: {rsi:.0f})")
            explanations.append(f"Technically overbought: RSI at {rsi:.0f}")

        # Check news flag
        if not context.get('news_flag', False) and combined_prob > 0.5:
            key_indicators.append("No news catalyst")
            explanations.append("Large price move without identified news catalyst")

        # Build final explanation
        risk_level = self.calibrate_probability(combined_prob)

        if not explanations:
            if combined_prob < 0.3:
                explanation = "No significant red flags detected. Market behavior appears normal."
            else:
                explanation = "Some elevated risk indicators present. Exercise normal caution."
        else:
            header = f"Risk Level: {risk_level} ({combined_prob*100:.0f}% probability)\n\n"
            header += "Key Risk Factors:\n"
            body = "\n".join(f"  - {exp}" for exp in explanations[:5])
            explanation = header + body

        return explanation, key_indicators

    def analyze(
        self,
        ticker: str,
        asset_type: str = 'stock',
        price_data: pd.DataFrame = None,
        fundamentals: Dict = None,
        news_flag: bool = False,
        use_synthetic: bool = True,
        is_scam_scenario: bool = False,
        sec_flagged_override: bool = None
    ) -> RiskAssessment:
        """
        Main analysis function - runs the complete pipeline.

        Args:
            ticker: Asset ticker symbol
            asset_type: 'stock' or 'crypto'
            price_data: Optional pre-loaded price data
            fundamentals: Optional pre-loaded fundamentals
            news_flag: Whether significant news exists
            use_synthetic: Use synthetic data for testing
            is_scam_scenario: Generate scam-like test data
            sec_flagged_override: If provided, overrides internal SEC list check
                with result from upstream regulatory database

        Returns:
            RiskAssessment with complete analysis
        """
        print(f"\n{'='*60}")
        print(f"Analyzing: {ticker}")
        print(f"{'='*60}")

        # Step 1: Load and prepare data
        print("\n[Step 1] Loading data and context...")
        if price_data is None or fundamentals is None:
            context = create_asset_context(
                ticker,
                asset_type=asset_type,
                use_synthetic=use_synthetic,
                is_scam_scenario=is_scam_scenario,
                news_flag=news_flag
            )
            price_data = context['price_data']
            fundamentals = context['fundamentals']
        else:
            # Build context from provided data
            sec_check = check_sec_flagged_list(ticker)
            context = {
                'ticker': ticker,
                'asset_type': asset_type,
                'price_data': price_data,
                'fundamentals': fundamentals,
                'sec_flagged': sec_check,
                'news_flag': news_flag
            }
            price_data = preprocess_price_data(price_data)

        # Use upstream regulatory database result when provided, otherwise
        # fall back to the internal (simulated) SEC list check
        if sec_flagged_override is not None:
            sec_flagged = sec_flagged_override
            context['sec_flagged']['is_flagged'] = sec_flagged
            if sec_flagged:
                context['sec_flagged']['source'] = 'Upstream regulatory database'
                context['sec_flagged']['reason'] = context['sec_flagged'].get('reason') or 'Flagged by regulatory database'
        else:
            sec_flagged = context['sec_flagged']['is_flagged']
        print(f"   Data loaded: {len(price_data)} days")
        print(f"   SEC Flagged: {sec_flagged}")
        print(f"   Exchange: {fundamentals.get('exchange', 'N/A')}")

        # Step 2: Feature engineering
        print("\n[Step 2] Computing features...")
        price_data_fe = engineer_all_features(price_data)
        features, feature_names = create_feature_vector(
            price_data_fe,
            fundamentals,
            context['sec_flagged'],
            news_flag=news_flag
        )
        print(f"   Features computed: {len(features)}")

        # Step 3: Anomaly detection
        print("\n[Step 3] Running anomaly detection...")
        anomaly_result = detect_anomalies(price_data_fe, news_flag=news_flag)
        print(f"   Anomaly detected: {anomaly_result.is_anomaly}")
        print(f"   Anomaly score: {anomaly_result.anomaly_score:.3f}")
        if anomaly_result.anomaly_types:
            print(f"   Types: {', '.join(anomaly_result.anomaly_types[:3])}")

        # Step 4: Random Forest prediction
        print("\n[Step 4] Running Random Forest prediction...")
        if self.rf_available:
            rf_prob, rf_pred = self.rf_detector.predict_scam_probability(features)
            print(f"   RF Probability: {rf_prob:.3f}")
        else:
            print("   RF model not available - training now...")
            self.train_models(train_rf=True, train_lstm=False, save_models=True)
            rf_prob, rf_pred = self.rf_detector.predict_scam_probability(features)
            print(f"   RF Probability: {rf_prob:.3f}")

        # Step 5: LSTM prediction (if available)
        print("\n[Step 5] Running LSTM prediction...")
        lstm_prob = None
        if self.lstm_available:
            try:
                sequence = self.lstm_detector.prepare_sequence_from_df(price_data_fe)
                lstm_prob, lstm_pred = self.lstm_detector.predict_lstm_probability(sequence[0])
                print(f"   LSTM Probability: {lstm_prob:.3f}")
            except Exception as e:
                print(f"   LSTM prediction failed: {e}")
                lstm_prob = None
        else:
            print("   LSTM model not available (will use RF only)")

        # Step 6: Combine predictions
        print("\n[Step 6] Combining predictions...")
        is_otc = fundamentals.get('is_otc', False)
        market_cap = fundamentals.get('market_cap', float('inf'))
        is_micro_cap = market_cap < MARKET_THRESHOLDS['micro_cap']

        combined_prob = self.combine_predictions(
            rf_prob, lstm_prob, anomaly_result, sec_flagged,
            is_otc=is_otc, is_micro_cap=is_micro_cap
        )
        risk_level = self.calibrate_probability(combined_prob)
        print(f"   Combined probability: {combined_prob:.3f}")
        print(f"   Risk level: {risk_level}")

        # Step 7: Generate explanation
        print("\n[Step 7] Generating explanation...")
        explanation, key_indicators = self.generate_explanation(
            context, features, feature_names, anomaly_result, combined_prob
        )

        # Build detailed report
        detailed_report = {
            'data_summary': {
                'ticker': ticker,
                'asset_type': asset_type,
                'data_points': len(price_data),
                'latest_price': float(price_data['Close'].iloc[-1]),
                'current_price': fundamentals.get('current_price') or float(price_data['Close'].iloc[-1]),
                'market_cap': fundamentals.get('market_cap'),
                'exchange': fundamentals.get('exchange'),
                'company_name': fundamentals.get('long_name') or fundamentals.get('short_name'),
                'short_name': fundamentals.get('short_name'),
                'avg_daily_volume': fundamentals.get('avg_daily_volume'),
                'is_micro_cap': fundamentals.get('is_micro_cap', False),
                'is_small_cap': fundamentals.get('is_small_cap', False),
            },
            'model_outputs': {
                'rf_probability': float(rf_prob),
                'lstm_probability': float(lstm_prob) if lstm_prob is not None else None,
                'combined_probability': float(combined_prob),
                'anomaly_score': float(anomaly_result.anomaly_score),
            },
            'anomaly_details': {
                'is_anomaly': anomaly_result.is_anomaly,
                'types': anomaly_result.anomaly_types,
                'component_scores': anomaly_result.details.get('component_scores', {}),
            },
            'feature_highlights': {
                name: float(val)
                for name, val in zip(feature_names, features)
                if abs(val) > 1.5 or name in ['sec_flagged', 'is_otc', 'pump_pattern']
            },
            'contextual_flags': {
                'sec_flagged': sec_flagged,
                'is_otc': fundamentals.get('is_otc', False),
                'has_news': news_flag,
            }
        }

        # Create final assessment
        assessment = RiskAssessment(
            ticker=ticker,
            risk_level=risk_level,
            risk_score=combined_prob,
            rf_probability=rf_prob,
            lstm_probability=lstm_prob,
            combined_probability=combined_prob,
            anomaly_detected=anomaly_result.is_anomaly,
            anomaly_score=anomaly_result.anomaly_score,
            anomaly_types=anomaly_result.anomaly_types,
            sec_flagged=sec_flagged,
            key_indicators=key_indicators,
            explanation=explanation,
            detailed_report=detailed_report
        )

        return assessment


def format_risk_output(assessment: RiskAssessment) -> str:
    """
    Format the risk assessment as a human-readable output.

    Args:
        assessment: RiskAssessment object

    Returns:
        Formatted string output
    """
    # Header with risk level color coding (terminal)
    risk_colors = {
        'LOW': '\033[92m',      # Green
        'MEDIUM': '\033[93m',   # Yellow
        'HIGH': '\033[91m',     # Red
    }
    reset_color = '\033[0m'

    color = risk_colors.get(assessment.risk_level, '')

    output = []
    output.append("\n" + "=" * 60)
    output.append(f"SCAM RISK ASSESSMENT: {assessment.ticker}")
    output.append("=" * 60)

    # Risk level banner
    output.append(f"\n{color}{'*' * 50}")
    output.append(f"  RISK LEVEL: {assessment.risk_level}")
    output.append(f"  PROBABILITY: {assessment.combined_probability * 100:.0f}%")
    output.append(f"{'*' * 50}{reset_color}")

    # Key indicators
    if assessment.key_indicators:
        output.append("\nKEY INDICATORS:")
        for indicator in assessment.key_indicators[:5]:
            output.append(f"  > {indicator}")

    # SEC Warning
    if assessment.sec_flagged:
        output.append(f"\n{risk_colors['HIGH']}!!! SEC REGULATORY ALERT !!!{reset_color}")
        output.append("This asset appears on the SEC trading suspension/alert list.")

    # Model breakdown
    output.append("\nMODEL ANALYSIS:")
    output.append(f"  Random Forest: {assessment.rf_probability * 100:.1f}% scam probability")
    if assessment.lstm_probability is not None:
        output.append(f"  LSTM Sequence: {assessment.lstm_probability * 100:.1f}% scam probability")
    else:
        output.append("  LSTM Sequence: Not available")
    output.append(f"  Anomaly Score: {assessment.anomaly_score:.2f}")

    # Explanation
    output.append("\nDETAILED EXPLANATION:")
    output.append(assessment.explanation)

    output.append("\n" + "=" * 60)
    output.append(f"Analysis completed: {assessment.timestamp}")
    output.append("=" * 60 + "\n")

    return "\n".join(output)


if __name__ == '__main__':
    print("=" * 60)
    print("Testing Scam Detection Pipeline")
    print("=" * 60)

    # Initialize pipeline
    print("\nInitializing pipeline...")
    pipeline = ScamDetectionPipeline(load_models=True)

    # Check if models need training
    if not pipeline.rf_available or not pipeline.lstm_available:
        print("\nTraining models (first run)...")
        pipeline.train_models(
            train_rf=not pipeline.rf_available,
            train_lstm=not pipeline.lstm_available,
            lstm_epochs=10,  # Reduced for testing
            save_models=True
        )

    # Test 1: Analyze a normal stock scenario
    print("\n" + "=" * 60)
    print("TEST 1: Normal Stock Scenario")
    print("=" * 60)
    assessment1 = pipeline.analyze(
        ticker='AAPL',
        use_synthetic=True,
        is_scam_scenario=False,
        news_flag=True
    )
    print(format_risk_output(assessment1))

    # Test 2: Analyze a scam-like scenario
    print("\n" + "=" * 60)
    print("TEST 2: Scam-Like Scenario (Pump & Dump)")
    print("=" * 60)
    assessment2 = pipeline.analyze(
        ticker='PUMP',  # Note: This is in SEC flagged list
        use_synthetic=True,
        is_scam_scenario=True,
        news_flag=False
    )
    print(format_risk_output(assessment2))

    # Test 3: SEC flagged ticker
    print("\n" + "=" * 60)
    print("TEST 3: SEC Flagged Ticker")
    print("=" * 60)
    assessment3 = pipeline.analyze(
        ticker='SCAM',  # In SEC flagged list
        use_synthetic=True,
        is_scam_scenario=True,
        news_flag=False
    )
    print(format_risk_output(assessment3))

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"\n1. {assessment1.ticker}:")
    print(f"   Risk: {assessment1.risk_level} ({assessment1.combined_probability*100:.0f}%)")

    print(f"\n2. {assessment2.ticker}:")
    print(f"   Risk: {assessment2.risk_level} ({assessment2.combined_probability*100:.0f}%)")

    print(f"\n3. {assessment3.ticker}:")
    print(f"   Risk: {assessment3.risk_level} ({assessment3.combined_probability*100:.0f}%)")

    print("\n" + "=" * 60)
    print("Pipeline Tests Complete!")
    print("=" * 60)
