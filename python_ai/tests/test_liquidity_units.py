import math
import pandas as pd
import pytest

from liquidity import average_dollar_volume
from feature_engineering import extract_contextual_features
from pipeline import ScamDetectionPipeline


@pytest.mark.parametrize('fundamentals,expected', [
    ({'current_price': 100, 'avg_daily_volume': 100_000}, 10_000_000),
    ({'current_price': 1, 'avg_daily_volume': 100_000}, 100_000),
    ({'current_price': 100, 'avg_daily_volume': 100_000, 'avg_daily_dollar_volume': 149_999}, 149_999),
    ({'avg_daily_dollar_volume': 0}, 0),
    ({}, None),
    ({'avg_daily_volume': 100_000}, None),
    ({'current_price': 0, 'avg_daily_volume': 100_000}, None),
    ({'current_price': math.nan, 'avg_daily_volume': 100_000}, None),
    ({'avg_daily_dollar_volume': -1}, None),
    ({'current_price': True, 'avg_daily_volume': 100_000}, None),
])
def test_explicit_units_and_unknowns(fundamentals, expected):
    assert average_dollar_volume(fundamentals) == expected


@pytest.mark.parametrize('dollars,flag', [(149_999, 1), (150_000, 0), (150_001, 0), (None, 0)])
def test_liquidity_boundary_is_dollars_and_turnover_is_shares(dollars, flag):
    context = extract_contextual_features({
        'avg_daily_volume': 100_000, 'float_shares': 1_000_000,
        'avg_daily_dollar_volume': dollars,
    }, {'is_flagged': False})
    assert context['is_micro_liquidity'] == flag
    assert context['float_turnover'] == .1
    assert context['avg_daily_volume'] == 100_000


def test_real_pipeline_does_not_flag_ten_million_dollars_as_micro_liquidity():
    bars = pd.DataFrame({
        'Date': pd.date_range('2026-01-01', periods=60),
        'Open': [100.] * 60, 'High': [101.] * 60, 'Low': [99.] * 60,
        'Close': [100.] * 60, 'Volume': [100_000.] * 60,
    })
    result = ScamDetectionPipeline(load_models=False).analyze(
        ticker='UNIT', price_data=bars, use_synthetic=False,
        fundamentals={'current_price': 100, 'avg_daily_volume': 100_000, 'market_cap': 1e9, 'exchange': 'NASDAQ'},
    )
    assert 'MICRO_LIQUIDITY' not in {signal.code for signal in result.signals}
