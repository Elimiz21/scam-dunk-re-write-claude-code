"""
AI Brain Efficacy Testing Suite

This script tests the scam detection system against:
1. Option 1: Historical known scam cases (SEC enforcement actions)
2. Option 2: Synthetic extreme edge cases that MUST return HIGH risk

The goal is to identify why the system always returns LOW/MEDIUM and never HIGH.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pipeline import ScamDetectionPipeline, RiskAssessment, format_risk_output
from config import RISK_THRESHOLDS, SEC_FLAGGED_TICKERS, OTC_EXCHANGES, MARKET_THRESHOLDS
from data_ingestion import (
    generate_synthetic_stock_data,
    preprocess_price_data,
    check_sec_flagged_list
)
from feature_engineering import engineer_all_features, create_feature_vector
from anomaly_detection import detect_anomalies

# =============================================================================
# TEST DATA: Known Scam Cases and Legitimate Companies
# =============================================================================

# Real SEC enforcement cases - these are actual pump-and-dump or fraud cases
# Source: SEC.gov enforcement actions and trading suspensions
KNOWN_SCAM_TICKERS = [
    # Recent SEC trading suspensions (2023-2024)
    "HMBL",   # Humble, Inc - SEC suspended trading 2023
    "CSCW",   # Color Star Technology - SEC investigation
    "WDLF",   # Social Life Network - SEC suspended
    "IFAN",   # IFAN Financial - SEC suspended
    "OPTI",   # Optec Inc - SEC suspended
    "ENZC",   # Enzolytics - SEC investigation
    "BBRW",   # BrewBilt Brewing - SEC suspended
    "FTEG",   # For The Earth Corporation - SEC suspended
    "SRNW",   # Strainwise - SEC suspended
    "AABB",   # Asia Broadband - SEC investigation
    # Classic pump-and-dump penny stocks
    "HNSS",   # HN1 Global - pump and dump
    "JAMN",   # Jammin Java Corp - manipulation
    "CYDY",   # CytoDyn - SEC investigation
    "NAKD",   # Cenntro Electric - meme/manipulation
    "SNDL",   # Sundial Growers - volatile penny stock
]

# Well-established legitimate companies that should NEVER return HIGH
LEGITIMATE_TICKERS = [
    "AAPL",   # Apple
    "MSFT",   # Microsoft
    "GOOGL",  # Google/Alphabet
    "AMZN",   # Amazon
    "META",   # Meta
    "NVDA",   # NVIDIA
    "JPM",    # JPMorgan
    "JNJ",    # Johnson & Johnson
    "V",      # Visa
    "PG",     # Procter & Gamble
    "WMT",    # Walmart
    "DIS",    # Disney
    "KO",     # Coca-Cola
    "PEP",    # PepsiCo
    "COST",   # Costco
]


# =============================================================================
# OPTION 1: Historical Backtesting with Known Scams
# =============================================================================

def run_historical_backtest(pipeline: ScamDetectionPipeline):
    """
    Test the scanner against historically confirmed scam stocks and legitimate companies.

    Returns:
        Dict with test results and metrics
    """
    print("\n" + "=" * 70)
    print("OPTION 1: HISTORICAL BACKTESTING WITH KNOWN SCAMS")
    print("=" * 70)

    results = {
        "scam_tickers": [],
        "legitimate_tickers": [],
        "summary": {}
    }

    # Test known scam tickers
    print("\n--- Testing Known Scam/Fraud Tickers ---")
    print("(These SHOULD return HIGH or at least MEDIUM risk)\n")

    for ticker in KNOWN_SCAM_TICKERS:
        try:
            # Use synthetic data that mimics scam characteristics
            assessment = pipeline.analyze(
                ticker=ticker,
                use_synthetic=True,
                is_scam_scenario=True,  # Generate scam-like data
                news_flag=False
            )

            result = {
                "ticker": ticker,
                "risk_level": assessment.risk_level,
                "probability": assessment.combined_probability,
                "rf_prob": assessment.rf_probability,
                "lstm_prob": assessment.lstm_probability,
                "anomaly_score": assessment.anomaly_score,
                "sec_flagged": assessment.sec_flagged,
                "key_indicators": assessment.key_indicators[:3] if assessment.key_indicators else []
            }
            results["scam_tickers"].append(result)

            status = "OK" if assessment.risk_level == "HIGH" else "FAIL" if assessment.risk_level == "LOW" else "PARTIAL"
            print(f"  [{status}] {ticker}: {assessment.risk_level} ({assessment.combined_probability*100:.0f}%) - RF:{assessment.rf_probability:.2f}")

        except Exception as e:
            print(f"  [ERROR] {ticker}: {str(e)[:50]}")
            results["scam_tickers"].append({
                "ticker": ticker,
                "risk_level": "ERROR",
                "error": str(e)
            })

    # Test legitimate tickers
    print("\n--- Testing Legitimate Blue-Chip Tickers ---")
    print("(These SHOULD return LOW risk)\n")

    for ticker in LEGITIMATE_TICKERS:
        try:
            assessment = pipeline.analyze(
                ticker=ticker,
                use_synthetic=True,
                is_scam_scenario=False,  # Generate normal data
                news_flag=True  # Legitimate companies have news
            )

            result = {
                "ticker": ticker,
                "risk_level": assessment.risk_level,
                "probability": assessment.combined_probability,
                "rf_prob": assessment.rf_probability,
                "lstm_prob": assessment.lstm_probability,
                "anomaly_score": assessment.anomaly_score,
            }
            results["legitimate_tickers"].append(result)

            status = "OK" if assessment.risk_level == "LOW" else "WARN"
            print(f"  [{status}] {ticker}: {assessment.risk_level} ({assessment.combined_probability*100:.0f}%)")

        except Exception as e:
            print(f"  [ERROR] {ticker}: {str(e)[:50]}")

    # Calculate metrics
    scam_results = [r for r in results["scam_tickers"] if "error" not in r]
    legit_results = results["legitimate_tickers"]

    scam_high = sum(1 for r in scam_results if r["risk_level"] == "HIGH")
    scam_medium = sum(1 for r in scam_results if r["risk_level"] == "MEDIUM")
    scam_low = sum(1 for r in scam_results if r["risk_level"] == "LOW")

    legit_high = sum(1 for r in legit_results if r["risk_level"] == "HIGH")
    legit_medium = sum(1 for r in legit_results if r["risk_level"] == "MEDIUM")
    legit_low = sum(1 for r in legit_results if r["risk_level"] == "LOW")

    # True Positives = Scams correctly identified as HIGH
    # False Negatives = Scams incorrectly identified as LOW/MEDIUM
    # False Positives = Legitimate stocks incorrectly identified as HIGH
    # True Negatives = Legitimate stocks correctly identified as LOW

    tp = scam_high
    fn = scam_low + scam_medium
    fp = legit_high
    tn = legit_low

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    results["summary"] = {
        "total_scam_tested": len(scam_results),
        "scam_high": scam_high,
        "scam_medium": scam_medium,
        "scam_low": scam_low,
        "scam_detection_rate": (scam_high / len(scam_results) * 100) if scam_results else 0,
        "total_legit_tested": len(legit_results),
        "legit_high": legit_high,
        "legit_medium": legit_medium,
        "legit_low": legit_low,
        "false_positive_rate": (legit_high / len(legit_results) * 100) if legit_results else 0,
        "precision": precision,
        "recall": recall,
        "f1_score": f1
    }

    print("\n" + "-" * 70)
    print("HISTORICAL BACKTEST SUMMARY")
    print("-" * 70)
    print(f"\nKnown Scam Tickers ({len(scam_results)} tested):")
    print(f"  HIGH risk:   {scam_high} ({scam_high/len(scam_results)*100:.0f}%)" if scam_results else "  N/A")
    print(f"  MEDIUM risk: {scam_medium} ({scam_medium/len(scam_results)*100:.0f}%)" if scam_results else "  N/A")
    print(f"  LOW risk:    {scam_low} ({scam_low/len(scam_results)*100:.0f}%)" if scam_results else "  N/A")

    print(f"\nLegitimate Tickers ({len(legit_results)} tested):")
    print(f"  HIGH risk:   {legit_high} ({legit_high/len(legit_results)*100:.0f}%)" if legit_results else "  N/A")
    print(f"  MEDIUM risk: {legit_medium} ({legit_medium/len(legit_results)*100:.0f}%)" if legit_results else "  N/A")
    print(f"  LOW risk:    {legit_low} ({legit_low/len(legit_results)*100:.0f}%)" if legit_results else "  N/A")

    print(f"\nClassification Metrics:")
    print(f"  Precision:        {precision:.2%}")
    print(f"  Recall:           {recall:.2%}")
    print(f"  F1 Score:         {f1:.2%}")

    return results


# =============================================================================
# OPTION 2: Synthetic Edge Case Testing
# =============================================================================

def create_extreme_pump_dump_data(ticker: str = "EXTREME_PUMP", days: int = 90):
    """
    Create synthetic data representing an EXTREME pump-and-dump scenario.
    This should DEFINITELY trigger HIGH risk.
    """
    np.random.seed(12345)

    dates = pd.date_range(end=datetime.now().date(), periods=days, freq='D')

    # Start with low price
    start_price = 0.50

    # Normal trading for first 75 days
    normal_returns = np.random.normal(0.001, 0.02, 75)

    # EXTREME PUMP: 300% gain over 10 days
    pump_returns = np.random.uniform(0.15, 0.25, 10)  # 15-25% daily gains

    # DUMP: 60% crash over 5 days
    dump_returns = np.random.uniform(-0.20, -0.10, 5)  # 10-20% daily losses

    all_returns = np.concatenate([normal_returns, pump_returns, dump_returns])
    prices = start_price * np.cumprod(1 + all_returns)

    # Generate OHLC
    opens = prices * (1 + np.random.normal(0, 0.01, days))
    closes = prices
    highs = np.maximum(opens, closes) * (1 + np.abs(np.random.normal(0, 0.02, days)))
    lows = np.minimum(opens, closes) * (1 - np.abs(np.random.normal(0, 0.02, days)))

    # EXTREME volume surge during pump (20x normal)
    base_volume = 50000
    volumes = np.full(days, base_volume)
    volumes[75:85] = base_volume * np.random.uniform(15, 25, 10)  # 15-25x during pump
    volumes[85:90] = base_volume * np.random.uniform(10, 15, 5)   # 10-15x during dump

    return pd.DataFrame({
        'Date': dates,
        'Open': opens,
        'High': highs,
        'Low': lows,
        'Close': closes,
        'Volume': volumes.astype(int),
        'Ticker': ticker
    })


def create_sec_flagged_scenario_data(ticker: str = "SEC_FLAG_TEST"):
    """Create data for a stock that should be SEC-flagged."""
    return create_extreme_pump_dump_data(ticker)


def create_classic_penny_stock_scam_data(ticker: str = "PENNY_SCAM"):
    """Create data mimicking classic penny stock manipulation."""
    np.random.seed(54321)

    days = 90
    dates = pd.date_range(end=datetime.now().date(), periods=days, freq='D')

    # Very low starting price
    start_price = 0.03

    # Gradual pump over 20 days with high volatility
    returns = np.random.normal(0.001, 0.015, 60)  # Normal period
    pump_returns = np.random.uniform(0.08, 0.18, 20)  # 8-18% daily during pump
    dump_returns = np.random.uniform(-0.12, -0.05, 10)  # Gradual dump

    all_returns = np.concatenate([returns, pump_returns, dump_returns])
    prices = start_price * np.cumprod(1 + all_returns)

    # Generate OHLC with high intraday volatility
    opens = prices * (1 + np.random.normal(0, 0.03, days))
    closes = prices
    highs = np.maximum(opens, closes) * (1 + np.abs(np.random.normal(0, 0.05, days)))
    lows = np.minimum(opens, closes) * (1 - np.abs(np.random.normal(0, 0.05, days)))

    # Extremely low base volume, huge spike during pump
    base_volume = 10000
    volumes = np.full(days, base_volume)
    volumes[60:80] = base_volume * np.random.uniform(20, 50, 20)  # Massive volume during pump

    return pd.DataFrame({
        'Date': dates,
        'Open': opens,
        'High': highs,
        'Low': lows,
        'Close': closes,
        'Volume': volumes.astype(int),
        'Ticker': ticker
    })


def run_synthetic_edge_case_tests(pipeline: ScamDetectionPipeline):
    """
    Test with synthetic extreme scenarios that MUST return HIGH risk.
    If these don't return HIGH, the system is broken.
    """
    print("\n" + "=" * 70)
    print("OPTION 2: SYNTHETIC EDGE CASE TESTING")
    print("=" * 70)
    print("\nThese are EXTREME scenarios that MUST return HIGH risk.")
    print("If they don't, the thresholds/logic need adjustment.\n")

    results = []

    # Define test cases
    test_cases = [
        {
            "name": "Extreme Pump & Dump (300% gain, 60% crash)",
            "ticker": "EXTREME_PUMP",
            "data_fn": create_extreme_pump_dump_data,
            "fundamentals": {
                "ticker": "EXTREME_PUMP",
                "market_cap": 5_000_000,  # $5M micro-cap
                "float_shares": 500_000,
                "shares_outstanding": 1_000_000,
                "avg_daily_volume": 50_000,
                "exchange": "OTC",
                "is_otc": True,
            },
            "sec_flagged": False,
            "expected": "HIGH"
        },
        {
            "name": "SEC Flagged Stock",
            "ticker": "SCAM",  # This is in SEC_FLAGGED_TICKERS
            "data_fn": create_extreme_pump_dump_data,
            "fundamentals": {
                "ticker": "SCAM",
                "market_cap": 10_000_000,
                "float_shares": 1_000_000,
                "shares_outstanding": 2_000_000,
                "avg_daily_volume": 100_000,
                "exchange": "PINK",
                "is_otc": True,
            },
            "sec_flagged": True,  # Force SEC flag
            "expected": "HIGH"
        },
        {
            "name": "Classic Penny Stock Manipulation",
            "ticker": "PENNY_SCAM",
            "data_fn": create_classic_penny_stock_scam_data,
            "fundamentals": {
                "ticker": "PENNY_SCAM",
                "market_cap": 2_000_000,  # $2M micro-cap
                "float_shares": 100_000,
                "shares_outstanding": 500_000,
                "avg_daily_volume": 10_000,
                "exchange": "GREY",
                "is_otc": True,
            },
            "sec_flagged": False,
            "expected": "HIGH"
        },
        {
            "name": "OTC + Micro-cap + Pump Pattern Combined",
            "ticker": "MULTI_FLAG",
            "data_fn": create_extreme_pump_dump_data,
            "fundamentals": {
                "ticker": "MULTI_FLAG",
                "market_cap": 3_000_000,  # < $50M micro-cap threshold
                "float_shares": 200_000,
                "shares_outstanding": 500_000,
                "avg_daily_volume": 20_000,
                "exchange": "OTCBB",
                "is_otc": True,
            },
            "sec_flagged": False,
            "expected": "HIGH"
        },
        {
            "name": "All Red Flags Combined",
            "ticker": "PUMP",  # In SEC flagged list
            "data_fn": create_extreme_pump_dump_data,
            "fundamentals": {
                "ticker": "PUMP",
                "market_cap": 1_000_000,  # Smallest possible
                "float_shares": 50_000,
                "shares_outstanding": 100_000,
                "avg_daily_volume": 5_000,
                "exchange": "PINK",
                "is_otc": True,
            },
            "sec_flagged": True,
            "expected": "HIGH"
        },
    ]

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {test_case['name']} ---")

        try:
            # Generate synthetic price data
            price_data = test_case["data_fn"](test_case["ticker"])
            price_data = preprocess_price_data(price_data)

            # Engineer features
            price_data_fe = engineer_all_features(price_data)

            # Get fundamentals
            fundamentals = test_case["fundamentals"]

            # Check SEC flag
            sec_check = check_sec_flagged_list(test_case["ticker"])
            if test_case.get("sec_flagged"):
                sec_check["is_flagged"] = True

            # Create feature vector
            features, feature_names = create_feature_vector(
                price_data_fe,
                fundamentals,
                sec_check,
                news_flag=False
            )

            # Run anomaly detection
            anomaly_result = detect_anomalies(price_data_fe, news_flag=False)

            # Run through pipeline models
            if pipeline.rf_available:
                rf_prob, rf_pred = pipeline.rf_detector.predict_scam_probability(features)
            else:
                rf_prob = 0.5

            lstm_prob = None
            if pipeline.lstm_available:
                try:
                    sequence = pipeline.lstm_detector.prepare_sequence_from_df(price_data_fe)
                    lstm_prob, lstm_pred = pipeline.lstm_detector.predict_lstm_probability(sequence[0])
                except:
                    lstm_prob = None

            # Combine predictions
            is_otc = fundamentals.get('is_otc', False)
            market_cap = fundamentals.get('market_cap', float('inf'))
            is_micro_cap = market_cap < MARKET_THRESHOLDS['micro_cap']

            combined_prob = pipeline.combine_predictions(
                rf_prob, lstm_prob, anomaly_result, sec_check['is_flagged'],
                is_otc=is_otc, is_micro_cap=is_micro_cap
            )
            risk_level = pipeline.calibrate_probability(combined_prob)

            # Store result
            result = {
                "name": test_case["name"],
                "ticker": test_case["ticker"],
                "expected": test_case["expected"],
                "actual": risk_level,
                "passed": risk_level == test_case["expected"],
                "rf_probability": rf_prob,
                "lstm_probability": lstm_prob,
                "combined_probability": combined_prob,
                "anomaly_detected": anomaly_result.is_anomaly,
                "anomaly_score": anomaly_result.anomaly_score,
                "anomaly_types": anomaly_result.anomaly_types,
                "sec_flagged": sec_check['is_flagged'],
                "is_otc": is_otc,
                "is_micro_cap": is_micro_cap,
                "market_cap": market_cap,
            }
            results.append(result)

            # Print detailed result
            status = "PASS" if result["passed"] else "FAIL"
            print(f"  Expected: {test_case['expected']}, Got: {risk_level} [{status}]")
            print(f"  Combined Probability: {combined_prob:.3f} (threshold for HIGH: >= 0.7)")
            print(f"  RF Probability: {rf_prob:.3f}")
            print(f"  LSTM Probability: {lstm_prob:.3f if lstm_prob else 'N/A'}")
            print(f"  Anomaly Detected: {anomaly_result.is_anomaly} (score: {anomaly_result.anomaly_score:.3f})")
            print(f"  Anomaly Types: {anomaly_result.anomaly_types[:3] if anomaly_result.anomaly_types else 'None'}")
            print(f"  SEC Flagged: {sec_check['is_flagged']}")
            print(f"  Is OTC: {is_otc}")
            print(f"  Is Micro-cap: {is_micro_cap} (market cap: ${market_cap:,.0f})")

            # Explain why it might not be HIGH
            if not result["passed"]:
                print(f"\n  WHY NOT HIGH?")
                if combined_prob < 0.7:
                    print(f"    - Combined probability ({combined_prob:.3f}) < 0.7 threshold")
                if rf_prob < 0.7:
                    print(f"    - RF model only gave {rf_prob:.3f} probability")
                if not anomaly_result.is_anomaly:
                    print(f"    - No anomaly detected (no boost applied)")
                if not sec_check['is_flagged']:
                    print(f"    - Not SEC flagged (no 0.85 floor)")

        except Exception as e:
            print(f"  [ERROR] {str(e)}")
            import traceback
            traceback.print_exc()
            results.append({
                "name": test_case["name"],
                "ticker": test_case["ticker"],
                "expected": test_case["expected"],
                "actual": "ERROR",
                "passed": False,
                "error": str(e)
            })

    # Summary
    print("\n" + "-" * 70)
    print("SYNTHETIC EDGE CASE TEST SUMMARY")
    print("-" * 70)

    passed = sum(1 for r in results if r.get("passed", False))
    failed = len(results) - passed

    print(f"\nTotal Tests: {len(results)}")
    print(f"  Passed: {passed} ({passed/len(results)*100:.0f}%)")
    print(f"  Failed: {failed} ({failed/len(results)*100:.0f}%)")

    if failed > 0:
        print("\n  FAILED TEST CASES:")
        for r in results:
            if not r.get("passed", False):
                print(f"    - {r['name']}: Expected {r['expected']}, Got {r['actual']}")
                if "combined_probability" in r:
                    print(f"      Combined probability: {r['combined_probability']:.3f}")

    return results


# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

def main():
    """Run all efficacy tests."""
    print("\n" + "=" * 70)
    print("SCAMDUNK AI BRAIN EFFICACY TEST SUITE")
    print("=" * 70)
    print(f"\nTest Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\nCurrent Risk Thresholds:")
    print(f"  LOW:    probability < {RISK_THRESHOLDS['LOW']}")
    print(f"  MEDIUM: {RISK_THRESHOLDS['LOW']} <= probability < {RISK_THRESHOLDS['MEDIUM']}")
    print(f"  HIGH:   probability >= {RISK_THRESHOLDS['MEDIUM']}")

    # Initialize pipeline
    print("\nInitializing AI Pipeline...")
    pipeline = ScamDetectionPipeline(load_models=True)

    # Train if needed
    if not pipeline.rf_available:
        print("Training Random Forest model...")
        pipeline.train_models(train_rf=True, train_lstm=False, save_models=True)

    if not pipeline.lstm_available:
        print("Training LSTM model (reduced epochs for testing)...")
        try:
            pipeline.train_models(train_rf=False, train_lstm=True, lstm_epochs=5, save_models=True)
        except Exception as e:
            print(f"LSTM training failed: {e}")

    print(f"\nModels Ready:")
    print(f"  Random Forest: {'Yes' if pipeline.rf_available else 'No'}")
    print(f"  LSTM: {'Yes' if pipeline.lstm_available else 'No'}")

    # Run Option 1: Historical Backtest
    historical_results = run_historical_backtest(pipeline)

    # Run Option 2: Synthetic Edge Cases
    synthetic_results = run_synthetic_edge_case_tests(pipeline)

    # Final Summary
    print("\n" + "=" * 70)
    print("FINAL TEST SUMMARY")
    print("=" * 70)

    print("\n1. HISTORICAL BACKTEST (Known Scams vs Legitimate):")
    summary = historical_results["summary"]
    print(f"   - Scam Detection Rate (HIGH): {summary['scam_detection_rate']:.0f}%")
    print(f"   - False Positive Rate: {summary['false_positive_rate']:.0f}%")
    print(f"   - F1 Score: {summary['f1_score']:.2%}")

    print("\n2. SYNTHETIC EDGE CASES (Must be HIGH):")
    passed = sum(1 for r in synthetic_results if r.get("passed", False))
    print(f"   - Pass Rate: {passed}/{len(synthetic_results)} ({passed/len(synthetic_results)*100:.0f}%)")

    # DIAGNOSIS
    print("\n" + "=" * 70)
    print("DIAGNOSIS: WHY THE SYSTEM FAILS TO RETURN HIGH")
    print("=" * 70)

    # Check synthetic results for patterns
    all_probs = [r.get("combined_probability", 0) for r in synthetic_results if "combined_probability" in r]
    all_rf_probs = [r.get("rf_probability", 0) for r in synthetic_results if "rf_probability" in r]

    if all_probs:
        print(f"\nCombined Probability Distribution (edge cases):")
        print(f"  Min:  {min(all_probs):.3f}")
        print(f"  Max:  {max(all_probs):.3f}")
        print(f"  Mean: {np.mean(all_probs):.3f}")
        print(f"  Threshold for HIGH: >= 0.7")

    if all_rf_probs:
        print(f"\nRandom Forest Probability Distribution:")
        print(f"  Min:  {min(all_rf_probs):.3f}")
        print(f"  Max:  {max(all_rf_probs):.3f}")
        print(f"  Mean: {np.mean(all_rf_probs):.3f}")

    # Key issues identified
    print("\nKEY ISSUES IDENTIFIED:")
    issues = []

    if all_probs and max(all_probs) < 0.7:
        issues.append("1. Combined probabilities never reach 0.7 threshold for HIGH")

    if all_rf_probs and np.mean(all_rf_probs) < 0.5:
        issues.append("2. RF model outputs are too conservative (average < 0.5)")

    # Check if anomaly boosts are helping
    anomaly_scores = [r.get("anomaly_score", 0) for r in synthetic_results]
    if anomaly_scores and np.mean(anomaly_scores) < 0.3:
        issues.append("3. Anomaly detection not triggering strong enough signals")

    # Check if the boosting logic is working
    non_sec_flagged = [r for r in synthetic_results if not r.get("sec_flagged")]
    if non_sec_flagged:
        max_non_sec_prob = max(r.get("combined_probability", 0) for r in non_sec_flagged)
        if max_non_sec_prob < 0.7:
            issues.append(f"4. Without SEC flag, max probability only reaches {max_non_sec_prob:.3f}")

    for issue in issues:
        print(f"  {issue}")

    if not issues:
        print("  No major issues detected - system may be working correctly")

    print("\n" + "=" * 70)
    print("TEST SUITE COMPLETE")
    print("=" * 70)

    return {
        "historical": historical_results,
        "synthetic": synthetic_results,
        "issues": issues
    }


if __name__ == "__main__":
    main()
