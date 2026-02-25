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
class SignalDetail:
    """Individual risk signal with code, category, description, and weight."""
    code: str
    category: str  # STRUCTURAL, PATTERN, ALERT, BEHAVIORAL
    description: str
    weight: int


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
    signals: List[SignalDetail] = field(default_factory=list)
    signal_total_score: int = 0
    news_verification: Optional[Dict] = None
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

    def compute_signals(
        self,
        features: np.ndarray,
        feature_names: List[str],
        fundamentals: Dict,
        sec_flagged: bool,
        anomaly_result: AnomalyResult,
        price_data: pd.DataFrame,
    ) -> List[SignalDetail]:
        """
        Compute risk signals directly from market features and fundamentals.

        This mirrors the TypeScript scoring logic but is enhanced with the
        Python backend's richer technical indicators (Z-scores, ATR, Keltner,
        RSI, etc.).  Each signal carries a weight; the sum of weights is the
        total risk score used for the final risk-level determination.

        Returns:
            List of SignalDetail objects.
        """
        signals: List[SignalDetail] = []
        feat = dict(zip(feature_names, features))

        # ----- STRUCTURAL signals -----
        current_price = fundamentals.get('current_price') or (
            float(price_data['Close'].iloc[-1]) if len(price_data) > 0 else 0
        )
        if 0 < current_price < 5:
            signals.append(SignalDetail(
                code='MICROCAP_PRICE', category='STRUCTURAL',
                description=f'Stock price ${current_price:.2f} is below $5 – penny stock territory',
                weight=2,
            ))

        market_cap = fundamentals.get('market_cap', 0)
        if 0 < market_cap < MARKET_THRESHOLDS['small_cap']:
            cap_str = f'${market_cap / 1e6:.1f}M'
            signals.append(SignalDetail(
                code='SMALL_MARKET_CAP', category='STRUCTURAL',
                description=f'Small market cap ({cap_str}) – more vulnerable to manipulation',
                weight=2,
            ))

        avg_volume = fundamentals.get('avg_daily_volume', 0)
        if 0 < avg_volume < MARKET_THRESHOLDS['micro_liquidity']:
            vol_k = f'${avg_volume / 1e3:.0f}K'
            signals.append(SignalDetail(
                code='MICRO_LIQUIDITY', category='STRUCTURAL',
                description=f'Very low daily volume ({vol_k}) – easier to manipulate',
                weight=2,
            ))

        is_otc = fundamentals.get('is_otc', False)
        exchange = fundamentals.get('exchange', '')
        if is_otc or exchange.upper() in OTC_EXCHANGES:
            signals.append(SignalDetail(
                code='OTC_EXCHANGE', category='STRUCTURAL',
                description=f'Traded on OTC market ({exchange}) – less regulatory oversight',
                weight=3,
            ))

        # ----- PATTERN signals -----
        price_change_7d = feat.get('price_change_7d', 0) * 100  # to %
        if abs(price_change_7d) >= 50:
            signals.append(SignalDetail(
                code='SPIKE_7D', category='PATTERN',
                description=f'Extreme 7-day price move of {price_change_7d:+.0f}% – classic pump pattern',
                weight=4,
            ))
        elif abs(price_change_7d) >= 25:
            signals.append(SignalDetail(
                code='SPIKE_7D', category='PATTERN',
                description=f'Significant 7-day price move of {price_change_7d:+.0f}%',
                weight=3,
            ))

        vol_surge = feat.get('volume_surge_factor', 1)
        if vol_surge >= 5:
            signals.append(SignalDetail(
                code='VOLUME_EXPLOSION', category='PATTERN',
                description=f'Volume {vol_surge:.1f}x the 30-day average – extreme unusual activity',
                weight=3,
            ))
        elif vol_surge >= 3:
            signals.append(SignalDetail(
                code='VOLUME_EXPLOSION', category='PATTERN',
                description=f'Volume {vol_surge:.1f}x the 30-day average – unusual activity',
                weight=2,
            ))

        # Spike-then-drop (pump-and-dump classic)
        if 'pump_and_dump_pattern' in anomaly_result.anomaly_types:
            signals.append(SignalDetail(
                code='SPIKE_THEN_DROP', category='PATTERN',
                description='Price spiked then dropped sharply – classic pump-and-dump pattern',
                weight=3,
            ))

        # Z-score based price anomaly
        price_z = max(
            abs(feat.get('return_zscore_short', 0)),
            abs(feat.get('return_zscore_long', 0)),
            abs(feat.get('price_zscore_long', 0)),
        )
        if price_z >= 3.0:
            signals.append(SignalDetail(
                code='PRICE_ANOMALY', category='PATTERN',
                description=f'Extreme price anomaly (Z-score {price_z:.1f}) – statistically unusual',
                weight=4,
            ))
        elif price_z >= 2.0:
            signals.append(SignalDetail(
                code='PRICE_ANOMALY', category='PATTERN',
                description=f'Significant price anomaly (Z-score {price_z:.1f})',
                weight=3,
            ))
        elif price_z >= 1.5:
            signals.append(SignalDetail(
                code='PRICE_ANOMALY', category='PATTERN',
                description=f'Moderate price anomaly (Z-score {price_z:.1f})',
                weight=2,
            ))

        # Volume Z-score anomaly
        vol_z = max(
            feat.get('volume_zscore_short', 0),
            feat.get('volume_zscore_long', 0),
        )
        if vol_z >= 2.0:
            signals.append(SignalDetail(
                code='VOLUME_ANOMALY', category='PATTERN',
                description=f'Abnormal volume (Z-score {vol_z:.1f}) – possible coordinated buying',
                weight=2,
            ))

        # RSI overbought
        rsi = feat.get('rsi_14', 50)
        if rsi > 80:
            signals.append(SignalDetail(
                code='OVERBOUGHT_RSI', category='PATTERN',
                description=f'Extremely overbought (RSI {rsi:.0f}) – price unsustainably high',
                weight=2,
            ))
        elif rsi > 70:
            signals.append(SignalDetail(
                code='OVERBOUGHT_RSI', category='PATTERN',
                description=f'Overbought (RSI {rsi:.0f})',
                weight=1,
            ))

        # ATR-based high volatility
        atr_pct = feat.get('atr_percent', 0)
        if atr_pct > 10:
            signals.append(SignalDetail(
                code='HIGH_VOLATILITY', category='PATTERN',
                description=f'Extreme volatility (ATR {atr_pct:.1f}% of price)',
                weight=2,
            ))
        elif atr_pct > 5:
            signals.append(SignalDetail(
                code='HIGH_VOLATILITY', category='PATTERN',
                description=f'High volatility (ATR {atr_pct:.1f}% of price)',
                weight=1,
            ))

        # Pump pattern (price up + volume up simultaneously)
        if feat.get('pump_pattern', 0) or 'pump_pattern_detected' in anomaly_result.anomaly_types:
            signals.append(SignalDetail(
                code='PUMP_PATTERN', category='PATTERN',
                description='Combined price pump + volume explosion detected',
                weight=3,
            ))

        # Keltner channel breakout
        if feat.get('keltner_breakout_upper', 0):
            signals.append(SignalDetail(
                code='KELTNER_BREAKOUT', category='PATTERN',
                description='Price broke above volatility envelope (Keltner upper breakout)',
                weight=1,
            ))

        # Extreme surge (30-day)
        price_change_30d = feat.get('price_change_30d', 0) * 100
        if abs(price_change_30d) >= 100:
            signals.append(SignalDetail(
                code='EXTREME_SURGE', category='PATTERN',
                description=f'Extreme 30-day move of {price_change_30d:+.0f}% – rapid appreciation',
                weight=3,
            ))

        # ----- ALERT signals -----
        if sec_flagged:
            signals.append(SignalDetail(
                code='ALERT_LIST_HIT', category='ALERT',
                description='Appears on SEC / regulatory alert or suspension list – extreme caution',
                weight=5,
            ))

        return signals

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
        # Start with anomaly score as the primary signal (most reliable
        # with real-world data because it uses statistical thresholds rather
        # than models trained on synthetic distributions).
        combined = anomaly_result.anomaly_score

        # Blend in ML model probabilities as supplementary signal.
        # ML models are trained on synthetic data so we give them lower
        # weight to avoid them dragging the score down when they
        # fail to recognise real-world patterns.
        ml_prob = rf_prob
        if lstm_prob is not None:
            if ENSEMBLE_CONFIG['use_max_strategy']:
                ml_prob = max(rf_prob, lstm_prob)
            else:
                rf_weight = ENSEMBLE_CONFIG['rf_weight']
                lstm_weight = ENSEMBLE_CONFIG['lstm_weight']
                ml_prob = (rf_prob * rf_weight + lstm_prob * lstm_weight)

        # Combine: anomaly score dominates (70%), ML provides supplementary
        # boost (30%).  Use max to ensure the ML models can only raise the
        # score, never lower it below the anomaly-based floor.
        combined = max(
            combined,
            anomaly_result.anomaly_score * 0.7 + ml_prob * 0.3,
        )

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

        # Step 6: Compute direct risk signals (primary scoring method)
        print("\n[Step 6] Computing risk signals...")
        computed_signals = self.compute_signals(
            features, feature_names, fundamentals, sec_flagged,
            anomaly_result, price_data,
        )
        signal_total_score = sum(s.weight for s in computed_signals)
        print(f"   Signals detected: {len(computed_signals)}")
        print(f"   Signal total score: {signal_total_score}")
        for sig in computed_signals[:5]:
            print(f"     [{sig.category}] {sig.code} (weight {sig.weight})")

        # Determine risk level from signal score (matches TS scoring thresholds)
        has_alert = any(s.code == 'ALERT_LIST_HIT' for s in computed_signals)
        if has_alert:
            signal_risk_level = 'HIGH'
        elif signal_total_score >= 5:
            signal_risk_level = 'HIGH'
        elif signal_total_score >= 2:
            signal_risk_level = 'MEDIUM'
        else:
            signal_risk_level = 'LOW'

        # Step 7: ML model ensemble (supplementary)
        print("\n[Step 7] ML ensemble (supplementary)...")
        is_otc = fundamentals.get('is_otc', False)
        market_cap = fundamentals.get('market_cap', float('inf'))
        is_micro_cap = market_cap < MARKET_THRESHOLDS['micro_cap']

        combined_prob = self.combine_predictions(
            rf_prob, lstm_prob, anomaly_result, sec_flagged,
            is_otc=is_otc, is_micro_cap=is_micro_cap
        )
        ml_risk_level = self.calibrate_probability(combined_prob)
        print(f"   ML combined probability: {combined_prob:.3f}")
        print(f"   ML risk level: {ml_risk_level}")

        # Final risk level: use the HIGHER of signal-based vs ML-based
        # This ensures the AI backend is never less sensitive than the TS fallback
        risk_priority = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2}
        if risk_priority.get(signal_risk_level, 0) >= risk_priority.get(ml_risk_level, 0):
            risk_level = signal_risk_level
        else:
            risk_level = ml_risk_level
        print(f"\n   >>> Final risk level: {risk_level} (signal={signal_risk_level}, ml={ml_risk_level})")

        # Step 8: Generate explanation
        print("\n[Step 8] Generating explanation...")
        explanation, key_indicators = self.generate_explanation(
            context, features, feature_names, anomaly_result, combined_prob
        )

        # Step 9: News verification for HIGH risk results
        # Check if legitimate news catalysts explain suspicious activity
        news_verification = None
        if risk_level == 'HIGH' and not use_synthetic:
            print("\n[Step 9] Verifying HIGH risk - checking for legitimate catalysts...")
            try:
                from live_data import verify_legitimate_catalysts
                news_verification = verify_legitimate_catalysts(ticker)

                if news_verification['should_reduce_risk']:
                    risk_level = news_verification['recommended_level']
                    key_indicators.append(
                        f"News verification: {news_verification['catalyst_summary']}"
                    )
                    print(f"   Risk reduced to {risk_level} due to legitimate catalyst")
                else:
                    key_indicators.append(
                        f"No legitimate catalyst: {news_verification['catalyst_summary']}"
                    )
                    print(f"   Risk remains HIGH - no legitimate catalyst found")
            except Exception as e:
                print(f"   Warning: News verification failed: {e}")
                # Don't block the assessment if news verification fails
        elif risk_level == 'HIGH':
            print("\n[Step 9] Skipping news verification (synthetic data mode)")

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
                'signal_total_score': signal_total_score,
                'signal_risk_level': signal_risk_level,
                'ml_risk_level': ml_risk_level,
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
            detailed_report=detailed_report,
            signals=computed_signals,
            signal_total_score=signal_total_score,
            news_verification=news_verification
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
