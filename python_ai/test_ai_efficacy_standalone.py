"""
AI Brain Efficacy Testing Suite - Standalone Version

This script analyzes the risk thresholds and logic WITHOUT running the full ML pipeline.
It demonstrates WHY the system always returns LOW/MEDIUM and never HIGH.
"""

import numpy as np
from datetime import datetime

# =============================================================================
# Recreate the key thresholds and logic from the codebase
# =============================================================================

RISK_THRESHOLDS = {
    'LOW': 0.3,        # Probability < 0.3 = Low Risk
    'MEDIUM': 0.7,     # 0.3 <= Probability < 0.7 = Medium Risk
    'HIGH': 1.0,       # Probability >= 0.7 = High Risk
}

MARKET_THRESHOLDS = {
    'micro_cap': 50_000_000,      # < $50M = micro cap
    'small_cap': 300_000_000,     # < $300M = small cap
}

def calibrate_probability(probability: float) -> str:
    """Map probability to risk level (from pipeline.py)"""
    if probability < RISK_THRESHOLDS['LOW']:
        return 'LOW'
    elif probability < RISK_THRESHOLDS['MEDIUM']:
        return 'MEDIUM'
    else:
        return 'HIGH'


def combine_predictions(
    rf_prob: float,
    lstm_prob: float,
    anomaly_score: float,
    anomaly_is_active: bool,
    has_severe_pattern: bool,
    sec_flagged: bool,
    is_otc: bool,
    is_micro_cap: bool,
    use_max_strategy: bool = False
) -> float:
    """
    Recreate the combine_predictions logic from pipeline.py lines 135-213
    """
    combined = rf_prob

    # If LSTM is available, combine predictions
    if lstm_prob is not None:
        if use_max_strategy:
            combined = max(rf_prob, lstm_prob)
        else:
            # Weighted average (0.5/0.5 default)
            combined = (rf_prob * 0.5 + lstm_prob * 0.5)

    # Apply anomaly boost if detected
    if anomaly_is_active:
        anomaly_boost = anomaly_score * 0.3
        combined = min(combined + anomaly_boost, 1.0)

    # SEC flag is CRITICAL - heavily boost probability
    if sec_flagged:
        combined = max(combined, 0.85)

    # Apply floor for severe patterns
    if has_severe_pattern:
        combined = max(combined, 0.6)

    # OTC + severe pattern combinations
    if has_severe_pattern and is_otc:
        combined = max(combined, 0.75)
    if has_severe_pattern and is_otc and is_micro_cap:
        combined = max(combined, 0.80)

    # Additional boost for multiple risk factors
    risk_factor_count = sum([is_otc, is_micro_cap, has_severe_pattern,
                             anomaly_is_active, sec_flagged])
    if risk_factor_count >= 3:
        combined = max(combined, 0.70)
    if risk_factor_count >= 4:
        combined = max(combined, 0.80)

    return min(combined, 1.0)


# =============================================================================
# OPTION 2: Synthetic Edge Case Testing (Standalone)
# =============================================================================

def run_synthetic_tests():
    """
    Test edge cases by simulating what the ML models would output
    and showing what probability is needed to reach HIGH.
    """
    print("\n" + "=" * 70)
    print("SYNTHETIC EDGE CASE ANALYSIS")
    print("=" * 70)
    print("\nThis simulates various scenarios to see what probability results.\n")

    test_cases = [
        {
            "name": "Best case: SEC Flagged",
            "rf_prob": 0.50,
            "lstm_prob": 0.50,
            "anomaly_score": 0.5,
            "anomaly_active": True,
            "severe_pattern": True,
            "sec_flagged": True,
            "is_otc": True,
            "is_micro_cap": True,
            "expected": "HIGH"
        },
        {
            "name": "Extreme pump pattern (no SEC flag)",
            "rf_prob": 0.65,
            "lstm_prob": 0.60,
            "anomaly_score": 0.8,
            "anomaly_active": True,
            "severe_pattern": True,
            "sec_flagged": False,
            "is_otc": True,
            "is_micro_cap": True,
            "expected": "HIGH"
        },
        {
            "name": "Typical scam scenario",
            "rf_prob": 0.55,
            "lstm_prob": 0.50,
            "anomaly_score": 0.4,
            "anomaly_active": True,
            "severe_pattern": True,
            "sec_flagged": False,
            "is_otc": True,
            "is_micro_cap": True,
            "expected": "HIGH"
        },
        {
            "name": "OTC micro-cap without pattern",
            "rf_prob": 0.45,
            "lstm_prob": 0.40,
            "anomaly_score": 0.3,
            "anomaly_active": False,
            "severe_pattern": False,
            "sec_flagged": False,
            "is_otc": True,
            "is_micro_cap": True,
            "expected": "MEDIUM"
        },
        {
            "name": "Normal blue-chip stock",
            "rf_prob": 0.15,
            "lstm_prob": 0.10,
            "anomaly_score": 0.1,
            "anomaly_active": False,
            "severe_pattern": False,
            "sec_flagged": False,
            "is_otc": False,
            "is_micro_cap": False,
            "expected": "LOW"
        },
        {
            "name": "High RF output only (0.75)",
            "rf_prob": 0.75,
            "lstm_prob": 0.50,
            "anomaly_score": 0.0,
            "anomaly_active": False,
            "severe_pattern": False,
            "sec_flagged": False,
            "is_otc": False,
            "is_micro_cap": False,
            "expected": "HIGH"
        },
        {
            "name": "Medium RF with all flags",
            "rf_prob": 0.50,
            "lstm_prob": 0.50,
            "anomaly_score": 0.6,
            "anomaly_active": True,
            "severe_pattern": True,
            "sec_flagged": False,
            "is_otc": True,
            "is_micro_cap": True,
            "expected": "HIGH"
        },
    ]

    results = []

    for tc in test_cases:
        combined = combine_predictions(
            rf_prob=tc["rf_prob"],
            lstm_prob=tc["lstm_prob"],
            anomaly_score=tc["anomaly_score"],
            anomaly_is_active=tc["anomaly_active"],
            has_severe_pattern=tc["severe_pattern"],
            sec_flagged=tc["sec_flagged"],
            is_otc=tc["is_otc"],
            is_micro_cap=tc["is_micro_cap"]
        )

        risk_level = calibrate_probability(combined)
        passed = risk_level == tc["expected"]

        results.append({
            "name": tc["name"],
            "expected": tc["expected"],
            "actual": risk_level,
            "combined_prob": combined,
            "passed": passed
        })

        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {tc['name']}")
        print(f"       Expected: {tc['expected']}, Got: {risk_level}")
        print(f"       Combined Prob: {combined:.3f} (need >= 0.7 for HIGH)")
        print(f"       Inputs: RF={tc['rf_prob']:.2f}, LSTM={tc['lstm_prob']:.2f}, "
              f"Anomaly={tc['anomaly_active']} ({tc['anomaly_score']:.1f})")
        print(f"       Flags: SEC={tc['sec_flagged']}, OTC={tc['is_otc']}, "
              f"MicroCap={tc['is_micro_cap']}, Severe={tc['severe_pattern']}")
        print()

    return results


# =============================================================================
# ANALYSIS: What RF/LSTM values are needed for HIGH?
# =============================================================================

def analyze_threshold_requirements():
    """
    Calculate what model outputs are needed to achieve HIGH risk
    under various conditions.
    """
    print("\n" + "=" * 70)
    print("THRESHOLD ANALYSIS: What's Needed for HIGH Risk?")
    print("=" * 70)

    print("\nFor HIGH risk, combined probability must be >= 0.7")
    print("\n--- Scenario Analysis ---\n")

    scenarios = [
        {
            "name": "SEC Flagged (any stock)",
            "sec_flagged": True,
            "is_otc": False,
            "is_micro_cap": False,
            "severe_pattern": False,
            "anomaly_active": False,
        },
        {
            "name": "OTC + Micro-cap + Severe Pattern + Anomaly",
            "sec_flagged": False,
            "is_otc": True,
            "is_micro_cap": True,
            "severe_pattern": True,
            "anomaly_active": True,
        },
        {
            "name": "OTC + Severe Pattern only",
            "sec_flagged": False,
            "is_otc": True,
            "is_micro_cap": False,
            "severe_pattern": True,
            "anomaly_active": False,
        },
        {
            "name": "Just OTC and Micro-cap (no patterns)",
            "sec_flagged": False,
            "is_otc": True,
            "is_micro_cap": True,
            "severe_pattern": False,
            "anomaly_active": False,
        },
        {
            "name": "No flags at all (pure ML output)",
            "sec_flagged": False,
            "is_otc": False,
            "is_micro_cap": False,
            "severe_pattern": False,
            "anomaly_active": False,
        },
    ]

    for scenario in scenarios:
        print(f"Scenario: {scenario['name']}")

        # Find minimum RF prob needed for HIGH
        min_rf_for_high = None
        for rf in np.arange(0.0, 1.01, 0.01):
            combined = combine_predictions(
                rf_prob=rf,
                lstm_prob=rf,  # Assume equal
                anomaly_score=0.5 if scenario["anomaly_active"] else 0,
                anomaly_is_active=scenario["anomaly_active"],
                has_severe_pattern=scenario["severe_pattern"],
                sec_flagged=scenario["sec_flagged"],
                is_otc=scenario["is_otc"],
                is_micro_cap=scenario["is_micro_cap"]
            )
            if combined >= 0.7:
                min_rf_for_high = rf
                break

        if min_rf_for_high is not None:
            print(f"  -> Minimum RF/LSTM probability needed: {min_rf_for_high:.2f}")
        else:
            print(f"  -> Cannot reach HIGH with any RF/LSTM output!")

        # Show what happens with typical RF outputs
        for typical_rf in [0.3, 0.5, 0.65]:
            combined = combine_predictions(
                rf_prob=typical_rf,
                lstm_prob=typical_rf,
                anomaly_score=0.5 if scenario["anomaly_active"] else 0,
                anomaly_is_active=scenario["anomaly_active"],
                has_severe_pattern=scenario["severe_pattern"],
                sec_flagged=scenario["sec_flagged"],
                is_otc=scenario["is_otc"],
                is_micro_cap=scenario["is_micro_cap"]
            )
            risk = calibrate_probability(combined)
            print(f"     RF/LSTM={typical_rf:.2f} -> Combined={combined:.3f} -> {risk}")

        print()


# =============================================================================
# ROOT CAUSE ANALYSIS
# =============================================================================

def analyze_root_cause():
    """
    Explain exactly why the system fails to return HIGH risk.
    """
    print("\n" + "=" * 70)
    print("ROOT CAUSE ANALYSIS")
    print("=" * 70)

    print("""
THE PROBLEM:
The system almost never returns HIGH risk because of these issues:

1. THRESHOLD GAP TOO WIDE
   - LOW:    probability < 0.3
   - MEDIUM: 0.3 <= probability < 0.7  (covers 40 percentage points!)
   - HIGH:   probability >= 0.7

   The MEDIUM range is HUGE. Most real-world scenarios fall into this bucket.

2. RF MODEL OUTPUTS ARE TOO CONSERVATIVE
   Based on the synthetic training data:
   - Scam samples have extreme features (150% weekly gains, 10x volume)
   - Normal samples have moderate features
   - Real stocks rarely match the extreme scam patterns perfectly
   - Result: RF outputs cluster around 0.4-0.6 for suspicious stocks

3. BOOSTING FLOORS ARE INSUFFICIENT
   The combine_predictions() logic has these floors:
   - Severe pattern alone: 0.6 (still MEDIUM!)
   - OTC + severe pattern: 0.75 (just above HIGH threshold)
   - OTC + severe + micro-cap: 0.80 (HIGH, but needs ALL flags)
   - 4+ risk factors: 0.80 (HIGH)

   Problem: The floors only kick in with MULTIPLE conditions.
   A stock needs SEC flag OR multiple extreme conditions to get HIGH.

4. ANOMALY BOOST IS WEAK
   - Boost formula: anomaly_score * 0.3
   - Max boost: 1.0 * 0.3 = 0.3
   - If RF gives 0.5 and anomaly adds 0.3 = 0.65 (still MEDIUM!)

5. THE ONLY RELIABLE PATH TO HIGH:
   a) SEC Flagged -> automatic 0.85 floor -> HIGH
   b) OTC + Micro-cap + Severe Pattern -> 0.80 floor -> HIGH
   c) 4+ risk factors combined -> 0.80 floor -> HIGH
   d) RF/LSTM outputs >= 0.7 directly (rare with current training)
""")

    print("\nRECOMMENDED FIXES:")
    print("""
1. ADJUST THRESHOLDS:
   Current: LOW < 0.3, MEDIUM < 0.7, HIGH >= 0.7

   Option A - Lower HIGH threshold:
   Suggested: LOW < 0.25, MEDIUM < 0.55, HIGH >= 0.55

   Option B - Add CRITICAL level:
   LOW < 0.3, MEDIUM < 0.5, HIGH < 0.75, CRITICAL >= 0.75

2. INCREASE BOOSTING FLOORS:
   - Severe pattern: 0.6 -> 0.70 (HIGH)
   - OTC + pattern: 0.75 -> 0.80
   - Micro-cap + pattern: 0.70 (new)
   - Volume explosion alone: 0.65 (new)

3. STRENGTHEN ANOMALY BOOST:
   Current: anomaly_score * 0.3
   Suggested: anomaly_score * 0.5 (or use multiplier instead of addition)

4. RETRAIN ML MODEL:
   - Add more moderate scam examples (not just extreme)
   - Include real historical pump-and-dump data
   - Calibrate model to output higher probabilities for suspicious patterns

5. ADD CATEGORICAL OVERRIDES:
   - OTC exchange -> minimum MEDIUM
   - Micro-cap -> minimum MEDIUM
   - Volume > 10x normal -> minimum MEDIUM
   - Price spike > 100% weekly -> minimum HIGH
""")


# =============================================================================
# MAIN
# =============================================================================

def main():
    print("\n" + "=" * 70)
    print("SCAMDUNK AI BRAIN - EFFICACY ANALYSIS")
    print("=" * 70)
    print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Run synthetic edge case tests
    results = run_synthetic_tests()

    # Analyze what's needed for HIGH
    analyze_threshold_requirements()

    # Root cause analysis
    analyze_root_cause()

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    passed = sum(1 for r in results if r["passed"])
    failed = len(results) - passed

    print(f"\nSynthetic Tests: {passed}/{len(results)} passed")

    high_without_sec = [r for r in results
                        if r["expected"] == "HIGH" and "SEC" not in r["name"]]
    high_without_sec_passed = sum(1 for r in high_without_sec if r["passed"])

    print(f"HIGH without SEC flag: {high_without_sec_passed}/{len(high_without_sec)} achieved")

    print("\nKEY FINDING: The system CAN reach HIGH, but only when:")
    print("  1. Stock is SEC flagged (automatic 0.85 floor), OR")
    print("  2. Multiple flags combine (OTC + micro-cap + severe pattern), OR")
    print("  3. RF/LSTM output is >= 0.70 directly")
    print("\nThe problem is that conditions 2 and 3 rarely occur in practice,")
    print("so most stocks end up as MEDIUM regardless of how suspicious they are.")

    print("\n" + "=" * 70)
    print("ANALYSIS COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
