"""
Tests for the TS<->Python API contract and the auth/data-integrity fixes.

PY-H1  Auth: constant-time X-API-Key check; non-health routes refuse without it.
PY-H7  news_flag is read from the request body (not hardcoded).
PY-H8  data_available is honoured (thin data -> False/INSUFFICIENT).
PY-L1  CORS preflight (OPTIONS) is not blocked by auth.
PY-C3  Live-mode fundamentals failure does NOT fabricate a healthy large-cap.

The /analyze tests run with use_live_data=False (synthetic) so they need no
network and no ML models (disabled by default).
"""

import os
import sys
import json
import subprocess
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, '.')

# Ensure auth is configured before importing the app.
os.environ.setdefault('AI_API_SECRET', 'test-secret')
os.environ['ALLOW_SYNTHETIC_TESTS'] = 'true'
os.environ['ENVIRONMENT'] = 'test'
os.environ.pop('AI_REQUIRE_AUTH', None)
for _railway_name in (
    'RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME',
    'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID',
):
    os.environ.pop(_railway_name, None)

import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

import api_server
from api_server import AnalysisRequest, _analysis_inputs
from data_ingestion import get_stock_fundamentals


API_KEY = os.environ['AI_API_SECRET']


def _bars(count=40):
    return [
        {
            'date': (date(2026, 8, 1) + timedelta(days=index)).isoformat(),
            'open': 10.0 + index,
            'high': 11.0 + index,
            'low': 9.0 + index,
            'close': 10.5 + index,
            'volume': 0 if index == 0 else 1000 + index,
        }
        for index in range(count)
    ]


def _captured_aapl_bars():
    fixture = Path(__file__).parent / 'fixtures' / 'aapl-real-bars-2026-09-16.json'
    return json.loads(fixture.read_text())['bars']


@pytest.fixture(scope='module')
def client():
    return TestClient(api_server.app)


# ---------------------------------------------------------------------------
# PY-H1 / PY-L1: auth
# ---------------------------------------------------------------------------

def test_health_is_open(client):
    r = client.get('/health')
    assert r.status_code == 200
    body = r.json()
    assert 'ready' in body and 'ml_models_enabled' in body


def test_analyze_requires_api_key(client):
    r = client.post('/analyze', json={'ticker': 'AAPL', 'use_live_data': False})
    assert r.status_code == 401


def test_analyze_rejects_wrong_api_key(client):
    r = client.post(
        '/analyze',
        headers={'X-API-Key': 'wrong'},
        json={'ticker': 'AAPL', 'use_live_data': False},
    )
    assert r.status_code == 401


def test_options_preflight_not_blocked(client):
    # OPTIONS must pass through the auth middleware (CORS preflight).
    r = client.options(
        '/analyze',
        headers={
            'Origin': os.environ.get('ALLOWED_ORIGIN', 'https://scamdunk.com'),
            'Access-Control-Request-Method': 'POST',
        },
    )
    assert r.status_code != 401


def test_authenticated_preflight_proves_the_secret(client):
    rejected = client.get('/auth-check', headers={'X-API-Key': 'wrong'})
    accepted = client.get('/auth-check', headers={'X-API-Key': API_KEY})
    assert rejected.status_code == 401
    assert accepted.status_code == 200
    assert accepted.json()['authenticated'] is True


def test_news_flag_missing_defaults_false_and_explicit_false_is_preserved():
    assert AnalysisRequest.model_validate({'ticker': 'TEST'}).news_flag is False
    assert AnalysisRequest.model_validate(
        {'ticker': 'TEST', 'news_flag': False}
    ).news_flag is False


def test_news_flag_null_is_rejected():
    with pytest.raises(ValidationError):
        AnalysisRequest.model_validate({'ticker': 'TEST', 'news_flag': None})


def test_production_evaluation_rejects_missing_real_bars_and_fundamentals():
    with pytest.raises(ValidationError):
        AnalysisRequest.model_validate({
            'ticker': 'TEST',
            'analysis_mode': 'production_evaluation',
            'use_live_data': False,
        })


def test_use_live_data_false_cannot_implicitly_select_synthetic_data():
    with pytest.raises(ValidationError):
        AnalysisRequest.model_validate({
            'ticker': 'TEST',
            'use_live_data': False,
        })


def _isolated_synthetic_contract(environment):
    child_environment = {'PATH': os.environ.get('PATH', '')}
    child_environment.update(environment)
    child_environment['AI_API_SECRET'] = 'isolated-test-secret'
    code = """
import json, sys
sys.path.insert(0, 'python_ai')
import api_server
accepted = True
try:
    api_server.AnalysisRequest.model_validate({
        'ticker': 'TEST',
        'analysis_mode': 'synthetic_test',
        'use_live_data': False,
    })
except Exception:
    accepted = False
print(json.dumps({
    'is_production': api_server._IS_PRODUCTION,
    'synthetic_enabled': api_server._SYNTHETIC_TESTS_ENABLED,
    'accepted': accepted,
}))
"""
    result = subprocess.run(
        [sys.executable, '-c', code],
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        env=child_environment,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout.strip())


@pytest.mark.parametrize(
    ('environment', 'expected'),
    [
        ({}, {'is_production': False, 'synthetic_enabled': False, 'accepted': False}),
        (
            {'ALLOW_SYNTHETIC_TESTS': 'true'},
            {'is_production': False, 'synthetic_enabled': True, 'accepted': True},
        ),
        (
            {
                'ENVIRONMENT': '',
                'RAILWAY_ENVIRONMENT_NAME': 'production',
                'ALLOW_SYNTHETIC_TESTS': 'true',
            },
            {'is_production': True, 'synthetic_enabled': False, 'accepted': False},
        ),
        (
            {
                'RAILWAY_ENVIRONMENT_NAME': 'staging',
                'RAILWAY_PROJECT_ID': 'project',
                'ALLOW_SYNTHETIC_TESTS': 'true',
            },
            {'is_production': False, 'synthetic_enabled': False, 'accepted': False},
        ),
    ],
)
def test_synthetic_mode_is_local_opt_in_only(environment, expected):
    assert _isolated_synthetic_contract(environment) == expected


def test_production_evaluation_accepts_bounded_real_inputs_without_synthetic_mode():
    request = AnalysisRequest.model_validate({
        'ticker': 'TEST',
        'analysis_mode': 'production_evaluation',
        'use_live_data': False,
        'news_flag': False,
        'historical_bars': _bars(),
        'fundamentals': {
            'company_name': None,
            'exchange': 'NASDAQ',
            'current_price': 0,
            'market_cap': 0,
            'avg_daily_volume': 0,
            'is_otc': False,
            'on_watchlist': False,
        },
    })
    assert len(request.historical_bars) == 40
    assert request.historical_bars[0].volume == 0
    assert request.fundamentals.market_cap == 0


def test_production_evaluation_with_real_bars_and_null_quote_fails_closed(client):
    """Production canary: real bars plus quote:null must not crash or invent context."""
    response = client.post(
        '/analyze',
        headers={'X-API-Key': API_KEY},
        json={
            'ticker': 'AAPL',
            'asset_type': 'stock',
            'analysis_mode': 'production_evaluation',
            'use_live_data': False,
            'days': 40,
            'sec_flagged': None,
            'news_flag': False,
            'historical_bars': _captured_aapl_bars(),
            'fundamentals': {
                'company_name': None,
                'exchange': None,
                'current_price': None,
                'market_cap': None,
                'avg_daily_volume': None,
                'is_otc': False,
                'on_watchlist': False,
            },
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body['input_source'] == 'provided_real_bars'
    assert body['data_available'] is False
    assert body['layers_applied'] == ['rule_signals']
    assert body['is_micro_cap'] is False
    assert body['rf_probability'] is None
    assert body['lstm_probability'] is None
    assert body['stock_info']['exchange'] is None
    assert body['stock_info']['market_cap'] is None
    assert body['stock_info']['avg_volume'] is None
    assert not ({'SMALL_MARKET_CAP', 'MICRO_LIQUIDITY'} & {
        signal['code'] for signal in body['signals']
    })


def test_provided_real_bars_produce_deterministic_offline_scoring():
    from pipeline import ScamDetectionPipeline

    request = AnalysisRequest.model_validate({
        'ticker': 'TEST',
        'analysis_mode': 'production_evaluation',
        'use_live_data': False,
        'historical_bars': _bars(),
        'fundamentals': {
            'company_name': 'Test Corp',
            'exchange': 'NASDAQ',
            'current_price': 49.5,
            'market_cap': 1_000_000_000,
            'avg_daily_volume': 1_000,
            'is_otc': False,
            'on_watchlist': False,
        },
    })
    first_frame, first_fundamentals, use_synthetic, source = _analysis_inputs(request)
    second_frame, second_fundamentals, _, _ = _analysis_inputs(request)

    assert first_frame.equals(second_frame)
    assert first_fundamentals == second_fundamentals
    assert use_synthetic is False
    assert source == 'provided_real_bars'

    engine = ScamDetectionPipeline(load_models=False)
    first = engine.analyze(
        ticker='TEST',
        price_data=first_frame,
        fundamentals=first_fundamentals,
        use_synthetic=False,
    )
    second = engine.analyze(
        ticker='TEST',
        price_data=second_frame,
        fundamentals=second_fundamentals,
        use_synthetic=False,
    )
    assert first.risk_level == second.risk_level
    assert first.signal_total_score == second.signal_total_score
    assert first.anomaly_score == second.anomaly_score
    assert [signal.code for signal in first.signals] == [
        signal.code for signal in second.signals
    ]


def test_production_evaluation_high_risk_never_calls_live_news(client, monkeypatch):
    import live_data

    calls = []
    monkeypatch.setattr(
        live_data,
        'verify_legitimate_catalysts',
        lambda ticker: calls.append(ticker),
    )
    request_body = {
        'ticker': 'TEST',
        'analysis_mode': 'production_evaluation',
        'use_live_data': False,
        'sec_flagged': True,
        'historical_bars': _bars(),
        'fundamentals': {
            'company_name': 'Test Corp',
            'exchange': 'NASDAQ',
            'current_price': 49.5,
            'market_cap': 1_000_000_000,
            'avg_daily_volume': 1_000,
            'is_otc': False,
            'on_watchlist': False,
        },
    }
    first_response = client.post(
        '/analyze', headers={'X-API-Key': API_KEY}, json=request_body,
    )
    second_response = client.post(
        '/analyze', headers={'X-API-Key': API_KEY}, json=request_body,
    )
    assert first_response.status_code == second_response.status_code == 200
    first = first_response.json()
    second = second_response.json()

    assert first['risk_level'] == second['risk_level'] == 'HIGH'
    assert first['risk_score'] == second['risk_score']
    assert first['signals'] == second['signals']
    assert first['input_source'] == second['input_source'] == 'provided_real_bars'
    assert calls == []


def test_layers_applied_reflect_prediction_success_not_model_readiness():
    from types import SimpleNamespace
    from api_server import _applied_layers

    failed_predictions = SimpleNamespace(
        data_available=True,
        rf_applied=False,
        lstm_applied=False,
        rf_probability=0.0,
        lstm_probability=None,
    )
    successful_predictions = SimpleNamespace(
        data_available=True,
        rf_applied=True,
        lstm_applied=True,
        rf_probability=0.4,
        lstm_probability=0.5,
    )

    assert _applied_layers(failed_predictions) == [
        'rule_signals', 'anomaly_detection'
    ]
    assert _applied_layers(successful_predictions) == [
        'rule_signals', 'anomaly_detection', 'random_forest', 'lstm'
    ]


# ---------------------------------------------------------------------------
# Contract shape + PY-H7 (news_flag) + PY-H8 (data_available)
# ---------------------------------------------------------------------------

def test_analyze_response_contract(client):
    r = client.post(
        '/analyze',
        headers={'X-API-Key': API_KEY},
        json={'ticker': 'XYZA', 'asset_type': 'stock', 'use_live_data': False,
              'analysis_mode': 'synthetic_test',
              'days': 90, 'sec_flagged': False, 'news_flag': False},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Required contract fields
    for key in ('risk_level', 'risk_score', 'risk_probability', 'signals', 'data_available'):
        assert key in body, f"missing {key}"
    assert body['risk_level'] in ('LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT')
    assert 0.0 <= body['risk_probability'] <= 1.0
    # Each signal carries the contract fields, including severity.
    for sig in body['signals']:
        assert {'code', 'description', 'weight', 'severity'} <= set(sig.keys())
        assert sig['severity'] in ('low', 'medium', 'high')


def test_news_flag_is_accepted(client):
    # Providing news_flag=true must be accepted (not rejected / ignored as a
    # hardcoded False). We assert the request succeeds and returns the contract.
    r = client.post(
        '/analyze',
        headers={'X-API-Key': API_KEY},
        json={'ticker': 'AAPL', 'use_live_data': False,
              'analysis_mode': 'synthetic_test', 'news_flag': True},
    )
    assert r.status_code == 200, r.text


def test_batch_endpoint_rejects_oversized_input(client):
    r = client.post(
        '/pre-pump-scan',
        headers={'X-API-Key': API_KEY},
        json={'tickers': [f'T{i}' for i in range(51)]},
    )
    # pydantic max_length=50 -> 422 validation error
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# PY-C3: live-mode fundamentals never fabricate
# ---------------------------------------------------------------------------

def test_live_fundamentals_do_not_fabricate(monkeypatch):
    """When yfinance is unavailable in live mode, return unavailable, not a
    random healthy large-cap on a major exchange."""
    import data_ingestion
    monkeypatch.setattr(data_ingestion, 'YFINANCE_AVAILABLE', False)
    fund = get_stock_fundamentals('SOMEOTC', use_synthetic=False)
    assert fund.get('fundamentals_available') is False
    assert fund.get('market_cap') is None
    assert fund.get('exchange') is None
    # Critically, is_otc is NOT silently set to a (False) value that masks risk
    # by fabricating a major-exchange large-cap; market_cap stays None.
    assert fund.get('is_micro_cap') in (False, None)


def test_synthetic_fundamentals_still_work():
    """use_synthetic=True path is unchanged (still returns a usable profile)."""
    fund = get_stock_fundamentals('TEST', use_synthetic=True, is_scam_scenario=True)
    assert fund['market_cap'] is not None
    assert fund['exchange'] in ('OTC', 'PINK', 'OTCBB')
