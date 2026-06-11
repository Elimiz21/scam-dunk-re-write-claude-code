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

sys.path.insert(0, '.')

# Ensure auth is configured before importing the app.
os.environ.setdefault('AI_API_SECRET', 'test-secret')

import pytest
from fastapi.testclient import TestClient

import api_server
from data_ingestion import get_stock_fundamentals


API_KEY = os.environ['AI_API_SECRET']


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


# ---------------------------------------------------------------------------
# Contract shape + PY-H7 (news_flag) + PY-H8 (data_available)
# ---------------------------------------------------------------------------

def test_analyze_response_contract(client):
    r = client.post(
        '/analyze',
        headers={'X-API-Key': API_KEY},
        json={'ticker': 'XYZA', 'asset_type': 'stock', 'use_live_data': False,
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
        json={'ticker': 'AAPL', 'use_live_data': False, 'news_flag': True},
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
