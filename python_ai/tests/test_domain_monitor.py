"""
Tests for domain_monitor module.

Covers pattern generation, signal evaluation, and graceful degradation.
DNS-live and API-live tests are skipped in CI (no network assumptions).
"""

import pytest
import sys
sys.path.insert(0, '.')

from domain_monitor import (
    generate_promotional_domains,
    evaluate_domain_results,
    check_domain_registrations,
    scan_domain_infrastructure,
    PROMOTIONAL_DOMAIN_PATTERNS,
    PROMOTIONAL_TLD_PATTERNS,
)
from pre_pump_signals import PrePumpSignal


# ---------------------------------------------------------------------------
# Pattern generation
# ---------------------------------------------------------------------------

def test_promotional_domain_patterns():
    """Test that domain pattern generation works correctly."""
    domains = generate_promotional_domains('PUMP')
    assert 'pumpalert.com' in domains
    assert 'investpump.com' in domains
    assert len(domains) > 10


def test_pattern_count_matches_constants():
    """Number of generated domains equals patterns * TLDs."""
    domains = generate_promotional_domains('XYZ')
    expected = len(PROMOTIONAL_DOMAIN_PATTERNS) * len(PROMOTIONAL_TLD_PATTERNS)
    assert len(domains) == expected


def test_pattern_uses_lowercase_ticker():
    """Domains should always use lowercase ticker regardless of input case."""
    domains_upper = generate_promotional_domains('PUMP')
    domains_lower = generate_promotional_domains('pump')
    assert domains_upper == domains_lower
    for d in domains_upper:
        assert 'PUMP' not in d
        assert 'pump' in d


def test_pattern_includes_all_tlds():
    """Every TLD appears in the generated list."""
    domains = generate_promotional_domains('TEST')
    for tld in PROMOTIONAL_TLD_PATTERNS:
        assert any(d.endswith(tld) for d in domains)


def test_pattern_includes_all_base_patterns():
    """Every base pattern (before TLD) appears in the generated list."""
    domains = generate_promotional_domains('ABC')
    for pattern in PROMOTIONAL_DOMAIN_PATTERNS:
        base = pattern.format(ticker='abc')
        assert any(d.startswith(base) for d in domains)


# ---------------------------------------------------------------------------
# Signal evaluation
# ---------------------------------------------------------------------------

def test_signal_from_resolved_domain():
    """A resolved promotional domain produces PROMOTIONAL_DOMAIN_DETECTED signal."""
    results = [{'domain': 'pumpalert.com', 'resolves': True}]
    signals = evaluate_domain_results('PUMP', results)
    codes = [s.code for s in signals]
    assert 'PROMOTIONAL_DOMAIN_DETECTED' in codes


def test_no_signal_when_no_domains():
    """Empty results produce no signals."""
    signals = evaluate_domain_results('GOOD', [])
    assert len(signals) == 0


def test_no_signal_when_domains_dont_resolve():
    """Domains present but with resolves=False produce no signals."""
    results = [
        {'domain': 'goodalert.com', 'resolves': False},
        {'domain': 'goodstock.net', 'resolves': False},
    ]
    signals = evaluate_domain_results('GOOD', results)
    assert len(signals) == 0


def test_signal_weight_is_three():
    """PROMOTIONAL_DOMAIN_DETECTED has weight 3 as specified."""
    results = [{'domain': 'pumpalert.com', 'resolves': True}]
    signals = evaluate_domain_results('PUMP', results)
    assert signals[0].weight == 3


def test_signal_is_prepumpsignal_instance():
    """Signal objects are PrePumpSignal instances for compatibility."""
    results = [{'domain': 'pumpalert.com', 'resolves': True}]
    signals = evaluate_domain_results('PUMP', results)
    assert isinstance(signals[0], PrePumpSignal)


def test_signal_category():
    """Signal category is domain_infrastructure."""
    results = [{'domain': 'pumpalert.com', 'resolves': True}]
    signals = evaluate_domain_results('PUMP', results)
    assert signals[0].category == 'domain_infrastructure'


def test_single_signal_for_multiple_resolved_domains():
    """Multiple resolved domains produce a single aggregated signal, not one per domain."""
    results = [
        {'domain': 'pumpalert.com', 'resolves': True},
        {'domain': 'investpump.net', 'resolves': True},
        {'domain': 'pumpstock.io', 'resolves': True},
    ]
    signals = evaluate_domain_results('PUMP', results)
    assert len(signals) == 1


def test_signal_description_contains_domain():
    """Signal description mentions at least one resolved domain."""
    results = [{'domain': 'pumpalert.com', 'resolves': True}]
    signals = evaluate_domain_results('PUMP', results)
    assert 'pumpalert.com' in signals[0].description


def test_signal_description_truncates_long_list():
    """When more than 5 domains, description says '+N more'."""
    results = [
        {'domain': f'pump{i}.com', 'resolves': True}
        for i in range(8)
    ]
    signals = evaluate_domain_results('PUMP', results)
    assert '+3 more' in signals[0].description


# ---------------------------------------------------------------------------
# check_domain_registrations (no API key — DNS path)
# ---------------------------------------------------------------------------

def test_check_domain_registrations_returns_required_keys():
    """Return dict always has ticker, domains_found, signals keys."""
    result = check_domain_registrations('ZZZNODOMAIN', api_key=None)
    assert 'ticker' in result
    assert 'domains_found' in result
    assert 'signals' in result


def test_check_domain_registrations_ticker_uppercased():
    """Returned ticker is always uppercase."""
    result = check_domain_registrations('pump', api_key=None)
    assert result['ticker'] == 'PUMP'


def test_check_domain_registrations_domains_is_list():
    """domains_found is always a list."""
    result = check_domain_registrations('ZZZNODOMAIN', api_key=None)
    assert isinstance(result['domains_found'], list)


def test_check_domain_registrations_signals_is_list():
    """signals is always a list."""
    result = check_domain_registrations('ZZZNODOMAIN', api_key=None)
    assert isinstance(result['signals'], list)


# ---------------------------------------------------------------------------
# scan_domain_infrastructure
# ---------------------------------------------------------------------------

def test_scan_returns_dict():
    """Batch scan always returns a dict."""
    result = scan_domain_infrastructure(['ZZZNODOMAIN1', 'ZZZNODOMAIN2'])
    assert isinstance(result, dict)


def test_scan_only_includes_tickers_with_signals():
    """Tickers with no signals are not included in scan results."""
    # Use clearly non-existent tickers so DNS won't resolve
    result = scan_domain_infrastructure(['ZZZNODOMAIN1'])
    # Either empty (no signals) or contains the ticker — never raises
    for ticker in result:
        assert result[ticker]['signals']


def test_scan_with_company_names():
    """scan_domain_infrastructure accepts company_names without error."""
    result = scan_domain_infrastructure(
        ['ZZZNODOMAIN'],
        company_names={'ZZZNODOMAIN': 'ZZZ Test Corp'},
    )
    assert isinstance(result, dict)


def test_scan_watchlist_recommended_when_signals_present(monkeypatch):
    """watchlist_recommended is True when signals are present (weight >= 3)."""
    import domain_monitor

    def mock_check(ticker, company_name=None, api_key=None):
        return {
            'ticker': ticker,
            'domains_found': [{'domain': f'{ticker.lower()}alert.com', 'registered_date': None, 'registrar': None}],
            'signals': [PrePumpSignal(
                code='PROMOTIONAL_DOMAIN_DETECTED',
                category='domain_infrastructure',
                description='test',
                weight=3,
            )],
        }

    monkeypatch.setattr(domain_monitor, 'check_domain_registrations', mock_check)
    result = scan_domain_infrastructure(['PUMP'])
    assert 'PUMP' in result
    assert result['PUMP']['watchlist_recommended'] is True


def test_scan_signal_serialized_as_dict(monkeypatch):
    """Signals in scan results are serialized as dicts (not PrePumpSignal objects)."""
    import domain_monitor

    def mock_check(ticker, company_name=None, api_key=None):
        return {
            'ticker': ticker,
            'domains_found': [],
            'signals': [PrePumpSignal(
                code='PROMOTIONAL_DOMAIN_DETECTED',
                category='domain_infrastructure',
                description='test',
                weight=3,
            )],
        }

    monkeypatch.setattr(domain_monitor, 'check_domain_registrations', mock_check)
    result = scan_domain_infrastructure(['PUMP'])
    sig = result['PUMP']['signals'][0]
    assert isinstance(sig, dict)
    assert sig['code'] == 'PROMOTIONAL_DOMAIN_DETECTED'
    assert sig['weight'] == 3
