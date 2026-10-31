import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from scoring_policy import signal_score, signal_level

CASES = json.loads((Path(__file__).parents[1] / 'scoring-contract-fixtures.json').read_text())
@pytest.mark.parametrize('case', CASES, ids=lambda case: case['name'])
def test_shared_contract(case):
    signals = [SimpleNamespace(**signal) for signal in case['signals']]
    assert signal_score(signals) == case['score']
    assert signal_level(signal_score(signals), signals) == case['level']

def test_rsi_removal_ablation():
    signals = [SimpleNamespace(**signal) for signal in CASES[1]['signals'] if signal['code'] not in {'OVERBOUGHT_RSI', 'PERSISTENT_OVERBOUGHT'}]
    assert signal_level(signal_score(signals), signals) == 'MEDIUM'
