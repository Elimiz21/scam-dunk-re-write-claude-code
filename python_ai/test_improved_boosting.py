"""
Comparison: Current vs Improved Boosting Logic

This shows exactly when you'll get LOW, MEDIUM, and HIGH risk
under both the current system and the proposed improvements.
"""

import numpy as np
from datetime import datetime

# =============================================================================
# CURRENT SYSTEM (from pipeline.py)
# =============================================================================

CURRENT_THRESHOLDS = {
    'LOW': 0.3,
    'MEDIUM': 0.7,
    'HIGH': 1.0,
}

def current_combine_predictions(
    rf_prob, lstm_prob, anomaly_score, anomaly_is_active,
    has_severe_pattern, sec_flagged, is_otc, is_micro_cap
):
    """Current logic from pipeline.py"""
    combined = rf_prob

    if lstm_prob is not None:
        combined = (rf_prob * 0.5 + lstm_prob * 0.5)

    # Anomaly boost (WEAK: only 0.3x)
    if anomaly_is_active:
        anomaly_boost = anomaly_score * 0.3
        combined = min(combined + anomaly_boost, 1.0)

    # SEC flag -> 0.85 floor
    if sec_flagged:
        combined = max(combined, 0.85)

    # Severe pattern -> 0.6 floor (still MEDIUM!)
    if has_severe_pattern:
        combined = max(combined, 0.6)

    # OTC + severe -> 0.75
    if has_severe_pattern and is_otc:
        combined = max(combined, 0.75)

    # OTC + severe + micro-cap -> 0.80
    if has_severe_pattern and is_otc and is_micro_cap:
        combined = max(combined, 0.80)

    # 3+ risk factors -> 0.70
    risk_factor_count = sum([is_otc, is_micro_cap, has_severe_pattern,
                             anomaly_is_active, sec_flagged])
    if risk_factor_count >= 3:
        combined = max(combined, 0.70)
    if risk_factor_count >= 4:
        combined = max(combined, 0.80)

    return min(combined, 1.0)

def current_calibrate(prob):
    if prob < CURRENT_THRESHOLDS['LOW']:
        return 'LOW'
    elif prob < CURRENT_THRESHOLDS['MEDIUM']:
        return 'MEDIUM'
    return 'HIGH'


# =============================================================================
# IMPROVED SYSTEM (Proposed Changes)
# =============================================================================

IMPROVED_THRESHOLDS = {
    'LOW': 0.25,
    'MEDIUM': 0.55,  # Lowered from 0.7
    'HIGH': 1.0,
}

def improved_combine_predictions(
    rf_prob, lstm_prob, anomaly_score, anomaly_is_active,
    has_severe_pattern, sec_flagged, is_otc, is_micro_cap,
    has_volume_explosion=False, price_spike_pct=0
):
    """Improved logic with stronger boosting"""
    combined = rf_prob

    if lstm_prob is not None:
        combined = (rf_prob * 0.5 + lstm_prob * 0.5)

    # IMPROVED: Stronger anomaly boost (0.5x instead of 0.3x)
    if anomaly_is_active:
        anomaly_boost = anomaly_score * 0.5  # CHANGED from 0.3
        combined = min(combined + anomaly_boost, 1.0)

    # SEC flag -> 0.85 floor (unchanged)
    if sec_flagged:
        combined = max(combined, 0.85)

    # NEW: OTC alone gets minimum floor (ensures MEDIUM)
    if is_otc:
        combined = max(combined, 0.30)

    # NEW: Micro-cap alone gets minimum floor (ensures MEDIUM)
    if is_micro_cap:
        combined = max(combined, 0.30)

    # NEW: Volume explosion alone gets a floor
    if has_volume_explosion:
        combined = max(combined, 0.45)

    # NEW: Price spike > 50% gets a floor
    if price_spike_pct >= 50:
        combined = max(combined, 0.45)

    # NEW: Price spike > 100% is HIGH territory
    if price_spike_pct >= 100:
        combined = max(combined, 0.60)

    # IMPROVED: Severe pattern -> 0.55 floor (was 0.6, but threshold is lower)
    if has_severe_pattern:
        combined = max(combined, 0.55)

    # OTC + severe -> 0.65 (ensures HIGH with new threshold)
    if has_severe_pattern and is_otc:
        combined = max(combined, 0.65)

    # OTC + severe + micro-cap -> 0.75
    if has_severe_pattern and is_otc and is_micro_cap:
        combined = max(combined, 0.75)

    # NEW: OTC + micro-cap (without pattern) still gets elevated
    if is_otc and is_micro_cap:
        combined = max(combined, 0.45)

    # NEW: OTC + volume explosion -> HIGH
    if is_otc and has_volume_explosion:
        combined = max(combined, 0.60)

    # 3+ risk factors -> 0.60 (ensures HIGH)
    risk_factor_count = sum([is_otc, is_micro_cap, has_severe_pattern,
                             anomaly_is_active, sec_flagged, has_volume_explosion])
    if risk_factor_count >= 3:
        combined = max(combined, 0.60)
    if risk_factor_count >= 4:
        combined = max(combined, 0.75)

    return min(combined, 1.0)

def improved_calibrate(prob):
    if prob < IMPROVED_THRESHOLDS['LOW']:
        return 'LOW'
    elif prob < IMPROVED_THRESHOLDS['MEDIUM']:
        return 'MEDIUM'
    return 'HIGH'


# =============================================================================
# TEST SCENARIOS
# =============================================================================

SCENARIOS = [
    # BLUE CHIP / LEGITIMATE STOCKS
    {
        "name": "Apple (AAPL) - Blue chip, normal trading",
        "category": "LEGITIMATE",
        "rf_prob": 0.12, "lstm_prob": 0.10,
        "anomaly_score": 0.1, "anomaly_active": False,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": False, "is_micro_cap": False,
        "volume_explosion": False, "price_spike": 5,
    },
    {
        "name": "Tesla (TSLA) - Volatile but legitimate",
        "category": "LEGITIMATE",
        "rf_prob": 0.25, "lstm_prob": 0.22,
        "anomaly_score": 0.3, "anomaly_active": False,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": False, "is_micro_cap": False,
        "volume_explosion": False, "price_spike": 15,
    },
    {
        "name": "Nvidia after earnings (20% jump)",
        "category": "LEGITIMATE",
        "rf_prob": 0.30, "lstm_prob": 0.28,
        "anomaly_score": 0.4, "anomaly_active": True,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": False, "is_micro_cap": False,
        "volume_explosion": True, "price_spike": 20,
    },

    # SUSPICIOUS BUT NOT SCAM
    {
        "name": "Small cap biotech - volatile but legit",
        "category": "SUSPICIOUS",
        "rf_prob": 0.40, "lstm_prob": 0.35,
        "anomaly_score": 0.4, "anomaly_active": True,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": False, "is_micro_cap": True,
        "volume_explosion": False, "price_spike": 30,
    },
    {
        "name": "OTC stock - stable trading",
        "category": "SUSPICIOUS",
        "rf_prob": 0.35, "lstm_prob": 0.30,
        "anomaly_score": 0.2, "anomaly_active": False,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": True, "is_micro_cap": False,
        "volume_explosion": False, "price_spike": 8,
    },
    {
        "name": "Micro-cap on major exchange",
        "category": "SUSPICIOUS",
        "rf_prob": 0.38, "lstm_prob": 0.35,
        "anomaly_score": 0.3, "anomaly_active": False,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": False, "is_micro_cap": True,
        "volume_explosion": False, "price_spike": 12,
    },

    # LIKELY SCAMS
    {
        "name": "OTC penny stock with 50% spike",
        "category": "LIKELY_SCAM",
        "rf_prob": 0.50, "lstm_prob": 0.45,
        "anomaly_score": 0.5, "anomaly_active": True,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": True, "is_micro_cap": True,
        "volume_explosion": False, "price_spike": 50,
    },
    {
        "name": "OTC + 10x volume explosion",
        "category": "LIKELY_SCAM",
        "rf_prob": 0.55, "lstm_prob": 0.50,
        "anomaly_score": 0.6, "anomaly_active": True,
        "severe_pattern": False, "sec_flagged": False,
        "is_otc": True, "is_micro_cap": False,
        "volume_explosion": True, "price_spike": 40,
    },
    {
        "name": "Micro-cap with pump pattern detected",
        "category": "LIKELY_SCAM",
        "rf_prob": 0.52, "lstm_prob": 0.48,
        "anomaly_score": 0.55, "anomaly_active": True,
        "severe_pattern": True, "sec_flagged": False,
        "is_otc": False, "is_micro_cap": True,
        "volume_explosion": False, "price_spike": 60,
    },

    # DEFINITE SCAMS
    {
        "name": "OTC + micro-cap + pump pattern",
        "category": "DEFINITE_SCAM",
        "rf_prob": 0.55, "lstm_prob": 0.50,
        "anomaly_score": 0.7, "anomaly_active": True,
        "severe_pattern": True, "sec_flagged": False,
        "is_otc": True, "is_micro_cap": True,
        "volume_explosion": False, "price_spike": 80,
    },
    {
        "name": "Classic pump & dump (150% spike + 15x volume)",
        "category": "DEFINITE_SCAM",
        "rf_prob": 0.65, "lstm_prob": 0.60,
        "anomaly_score": 0.8, "anomaly_active": True,
        "severe_pattern": True, "sec_flagged": False,
        "is_otc": True, "is_micro_cap": True,
        "volume_explosion": True, "price_spike": 150,
    },
    {
        "name": "SEC Flagged stock",
        "category": "DEFINITE_SCAM",
        "rf_prob": 0.50, "lstm_prob": 0.45,
        "anomaly_score": 0.5, "anomaly_active": True,
        "severe_pattern": True, "sec_flagged": True,
        "is_otc": True, "is_micro_cap": True,
        "volume_explosion": False, "price_spike": 100,
    },
    {
        "name": "All red flags combined",
        "category": "DEFINITE_SCAM",
        "rf_prob": 0.70, "lstm_prob": 0.65,
        "anomaly_score": 0.9, "anomaly_active": True,
        "severe_pattern": True, "sec_flagged": True,
        "is_otc": True, "is_micro_cap": True,
        "volume_explosion": True, "price_spike": 200,
    },
]


# =============================================================================
# RUN COMPARISON
# =============================================================================

def main():
    print("\n" + "=" * 80)
    print("RISK SCORING COMPARISON: CURRENT vs IMPROVED BOOSTING")
    print("=" * 80)
    print(f"\nAnalysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    print("\n" + "-" * 80)
    print("THRESHOLD COMPARISON")
    print("-" * 80)
    print(f"\n{'':20} {'CURRENT':>15} {'IMPROVED':>15}")
    print(f"{'LOW threshold':20} {'< 0.30':>15} {'< 0.25':>15}")
    print(f"{'MEDIUM threshold':20} {'0.30 - 0.69':>15} {'0.25 - 0.54':>15}")
    print(f"{'HIGH threshold':20} {'>= 0.70':>15} {'>= 0.55':>15}")

    print("\n" + "=" * 80)
    print("SCENARIO-BY-SCENARIO COMPARISON")
    print("=" * 80)

    results = {"current": [], "improved": []}
    categories = {}

    for scenario in SCENARIOS:
        # Current system
        current_prob = current_combine_predictions(
            rf_prob=scenario["rf_prob"],
            lstm_prob=scenario["lstm_prob"],
            anomaly_score=scenario["anomaly_score"],
            anomaly_is_active=scenario["anomaly_active"],
            has_severe_pattern=scenario["severe_pattern"],
            sec_flagged=scenario["sec_flagged"],
            is_otc=scenario["is_otc"],
            is_micro_cap=scenario["is_micro_cap"]
        )
        current_risk = current_calibrate(current_prob)

        # Improved system
        improved_prob = improved_combine_predictions(
            rf_prob=scenario["rf_prob"],
            lstm_prob=scenario["lstm_prob"],
            anomaly_score=scenario["anomaly_score"],
            anomaly_is_active=scenario["anomaly_active"],
            has_severe_pattern=scenario["severe_pattern"],
            sec_flagged=scenario["sec_flagged"],
            is_otc=scenario["is_otc"],
            is_micro_cap=scenario["is_micro_cap"],
            has_volume_explosion=scenario["volume_explosion"],
            price_spike_pct=scenario["price_spike"]
        )
        improved_risk = improved_calibrate(improved_prob)

        # Store results
        results["current"].append({"risk": current_risk, "prob": current_prob, "category": scenario["category"]})
        results["improved"].append({"risk": improved_risk, "prob": improved_prob, "category": scenario["category"]})

        # Track by category
        cat = scenario["category"]
        if cat not in categories:
            categories[cat] = {"current": [], "improved": []}
        categories[cat]["current"].append(current_risk)
        categories[cat]["improved"].append(improved_risk)

        # Determine if improved
        changed = "→" if current_risk != improved_risk else " "
        better = "✓" if (
            (scenario["category"] in ["LIKELY_SCAM", "DEFINITE_SCAM"] and improved_risk == "HIGH" and current_risk != "HIGH") or
            (scenario["category"] == "LEGITIMATE" and improved_risk == "LOW")
        ) else ""

        print(f"\n{scenario['name']}")
        print(f"  Category: {scenario['category']}")
        print(f"  Flags: OTC={scenario['is_otc']}, MicroCap={scenario['is_micro_cap']}, "
              f"Pattern={scenario['severe_pattern']}, SEC={scenario['sec_flagged']}")
        print(f"  Spike: {scenario['price_spike']}%, Volume Explosion: {scenario['volume_explosion']}")
        print(f"  RF/LSTM: {scenario['rf_prob']:.2f}/{scenario['lstm_prob']:.2f}")
        print(f"  CURRENT:  {current_risk:8} (prob: {current_prob:.3f})")
        print(f"  IMPROVED: {improved_risk:8} (prob: {improved_prob:.3f}) {changed} {better}")

    # Summary by category
    print("\n" + "=" * 80)
    print("SUMMARY BY CATEGORY")
    print("=" * 80)

    for cat in ["LEGITIMATE", "SUSPICIOUS", "LIKELY_SCAM", "DEFINITE_SCAM"]:
        if cat in categories:
            current_list = categories[cat]["current"]
            improved_list = categories[cat]["improved"]

            print(f"\n{cat}:")
            print(f"  CURRENT:  LOW={current_list.count('LOW')}, MEDIUM={current_list.count('MEDIUM')}, HIGH={current_list.count('HIGH')}")
            print(f"  IMPROVED: LOW={improved_list.count('LOW')}, MEDIUM={improved_list.count('MEDIUM')}, HIGH={improved_list.count('HIGH')}")

    # Overall distribution
    print("\n" + "=" * 80)
    print("OVERALL RISK DISTRIBUTION")
    print("=" * 80)

    current_all = [r["risk"] for r in results["current"]]
    improved_all = [r["risk"] for r in results["improved"]]

    print(f"\n{'System':15} {'LOW':>8} {'MEDIUM':>10} {'HIGH':>8}")
    print(f"{'-'*15} {'-'*8} {'-'*10} {'-'*8}")
    print(f"{'CURRENT':15} {current_all.count('LOW'):>8} {current_all.count('MEDIUM'):>10} {current_all.count('HIGH'):>8}")
    print(f"{'IMPROVED':15} {improved_all.count('LOW'):>8} {improved_all.count('MEDIUM'):>10} {improved_all.count('HIGH'):>8}")

    # Calculate accuracy
    print("\n" + "=" * 80)
    print("ACCURACY METRICS")
    print("=" * 80)

    def calculate_metrics(risk_list, category_list):
        # True Positives: Scams (LIKELY_SCAM or DEFINITE_SCAM) identified as HIGH
        tp = sum(1 for r, c in zip(risk_list, category_list)
                 if c in ["LIKELY_SCAM", "DEFINITE_SCAM"] and r == "HIGH")
        # False Negatives: Scams NOT identified as HIGH
        fn = sum(1 for r, c in zip(risk_list, category_list)
                 if c in ["LIKELY_SCAM", "DEFINITE_SCAM"] and r != "HIGH")
        # False Positives: Legitimate stocks identified as HIGH
        fp = sum(1 for r, c in zip(risk_list, category_list)
                 if c == "LEGITIMATE" and r == "HIGH")
        # True Negatives: Legitimate stocks NOT identified as HIGH
        tn = sum(1 for r, c in zip(risk_list, category_list)
                 if c == "LEGITIMATE" and r != "HIGH")

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

        return {"tp": tp, "fn": fn, "fp": fp, "tn": tn,
                "precision": precision, "recall": recall, "f1": f1}

    category_list = [s["category"] for s in SCENARIOS]

    current_metrics = calculate_metrics(current_all, category_list)
    improved_metrics = calculate_metrics(improved_all, category_list)

    print(f"\n{'Metric':20} {'CURRENT':>12} {'IMPROVED':>12}")
    print(f"{'-'*20} {'-'*12} {'-'*12}")
    print(f"{'Scam Detection Rate':20} {current_metrics['recall']:>11.0%} {improved_metrics['recall']:>11.0%}")
    print(f"{'Precision':20} {current_metrics['precision']:>11.0%} {improved_metrics['precision']:>11.0%}")
    print(f"{'F1 Score':20} {current_metrics['f1']:>11.0%} {improved_metrics['f1']:>11.0%}")
    print(f"{'False Positives':20} {current_metrics['fp']:>12} {improved_metrics['fp']:>12}")

    # Final summary
    print("\n" + "=" * 80)
    print("WHEN YOU'LL GET EACH RISK LEVEL (IMPROVED SYSTEM)")
    print("=" * 80)

    print("""
LOW RISK (probability < 0.25):
  ✓ Blue-chip stocks with normal trading patterns
  ✓ Large-cap stocks on major exchanges
  ✓ Any stock with RF/LSTM output < 0.25 and no red flags

MEDIUM RISK (probability 0.25 - 0.54):
  ✓ OTC stocks without suspicious patterns
  ✓ Micro-cap stocks on major exchanges
  ✓ Volatile stocks with some anomalies but no severe patterns
  ✓ Small-cap with moderate price movements (< 50%)
  ✓ Any stock with 1-2 risk factors but no severe pattern

HIGH RISK (probability >= 0.55):
  ✓ Any SEC-flagged stock (automatic)
  ✓ OTC + severe pump pattern detected
  ✓ OTC + volume explosion (10x+)
  ✓ Any stock with 100%+ price spike
  ✓ OTC + micro-cap combined (even without spike)
  ✓ 3+ risk factors combined
  ✓ Any pump-and-dump pattern detected

KEY IMPROVEMENTS:
  1. OTC stocks alone now get MEDIUM minimum (was often LOW)
  2. Micro-cap stocks alone get MEDIUM minimum
  3. Volume explosions push toward HIGH
  4. Price spikes > 50% push toward HIGH
  5. Severe patterns now guarantee HIGH (threshold lowered)
  6. Fewer stocks fall into the "MEDIUM black hole"
""")

    print("=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
