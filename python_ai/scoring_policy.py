"""Versioned rule points, distinct from uncalibrated ensemble diagnostics."""
import json
from pathlib import Path

POLICY = json.loads(Path(__file__).with_name('scoring-policy.json').read_text())
SCORING_VERSION = POLICY['version']


def signal_score(signals):
    families = {name: set(codes) for name, codes in POLICY['families'].items()}
    maximums = {name: 0 for name in families}
    independent = 0
    distinct = {}
    for signal in signals:
        if signal.code not in distinct or signal.weight > distinct[signal.code].weight:
            distinct[signal.code] = signal
    for signal in distinct.values():
        family = next((name for name, codes in families.items() if signal.code in codes), None)
        if family is None:
            independent += signal.weight
        else:
            maximums[family] = max(maximums[family], signal.weight)
    return independent + sum(maximums.values())


def signal_level(score, signals):
    if any(signal.code == 'ALERT_LIST_HIT' for signal in signals):
        return 'HIGH'
    def meets(minimums):
        return any(signal.category == 'PATTERN' and signal.code in minimums and signal.weight >= minimums[signal.code] for signal in signals)
    market = POLICY['highMarketEvidence']
    high_evidence = any(signal.category in POLICY['highEvidenceCategories'] for signal in signals) or (meets(market['priceMinimumWeights']) and meets(market['volumeMinimumWeights']))
    if score >= POLICY['highThreshold'] and high_evidence:
        return 'HIGH'
    return 'MEDIUM' if score >= POLICY['mediumThreshold'] else 'LOW'
