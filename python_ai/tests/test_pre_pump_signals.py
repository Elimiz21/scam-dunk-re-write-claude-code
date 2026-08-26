import pytest
import sys
sys.path.insert(0, '.')
from pre_pump_signals import (
    analyze_filing_patterns,
    analyze_insider_behavior,
    analyze_ftd_data,
    analyze_threshold_list_status,
    PrePumpSignal,
)


@pytest.fixture
def dormant_then_active_filings():
    return {
        'ticker': 'SCAM',
        'cik': '0001234567',
        'filings': [
            {'type': '8-K', 'date': '2026-03-20', 'title': 'Change of Control'},
            {'type': '8-K', 'date': '2026-03-18', 'title': 'Reverse Merger Agreement'},
            {'type': '10-K', 'date': '2026-03-15', 'title': 'Annual Report'},
            {'type': '8-K', 'date': '2026-03-10', 'title': 'Name Change'},
        ],
        'last_filing_before_gap': '2025-07-01',
    }

@pytest.fixture
def normal_filings():
    return {
        'ticker': 'GOOD',
        'cik': '0009876543',
        'filings': [
            {'type': '10-Q', 'date': '2026-03-15', 'title': 'Quarterly Report'},
            {'type': '10-Q', 'date': '2025-12-15', 'title': 'Quarterly Report'},
            {'type': '10-Q', 'date': '2025-09-15', 'title': 'Quarterly Report'},
            {'type': '10-K', 'date': '2025-06-15', 'title': 'Annual Report'},
        ],
        'last_filing_before_gap': None,
    }

def test_shell_reactivation_detected(dormant_then_active_filings):
    signals = analyze_filing_patterns(dormant_then_active_filings)
    codes = [s.code for s in signals]
    assert 'SHELL_REACTIVATION' in codes

def test_reverse_merger_detected(dormant_then_active_filings):
    signals = analyze_filing_patterns(dormant_then_active_filings)
    codes = [s.code for s in signals]
    assert 'REVERSE_MERGER_OTC' in codes

def test_filing_burst_detected(dormant_then_active_filings):
    signals = analyze_filing_patterns(dormant_then_active_filings)
    codes = [s.code for s in signals]
    assert 'SUSPICIOUS_FILING_BURST' in codes

def test_normal_filings_no_signals(normal_filings):
    signals = analyze_filing_patterns(normal_filings)
    assert len(signals) == 0

def test_insider_selling_during_pump():
    insider_data = {
        'form4_filings': [],
        'form144_filings': [{'date': '2026-03-15', 'shares': 500000, 'insider': 'CEO'}],
        'price_change_90d': 0.35,
    }
    signals = analyze_insider_behavior(insider_data)
    codes = [s.code for s in signals]
    assert 'INSIDER_SELLING_SETUP' in codes

def test_no_insider_buying_on_rising_stock():
    insider_data = {
        'form4_filings': [],
        'form144_filings': [],
        'price_change_90d': 0.25,
    }
    signals = analyze_insider_behavior(insider_data)
    codes = [s.code for s in signals]
    assert 'NO_INSIDER_BUYING' in codes


# ---------------------------------------------------------------------------
# FTD / RegSHO signal tests
# ---------------------------------------------------------------------------

def test_high_ftd_rate_signal():
    """Test that HIGH_FTD_RATE signal fires for stocks with persistent FTDs."""
    ftd_data = {
        'ticker': 'SCAM',
        'ftd_records': [
            {'date': '2026-03-15', 'quantity': 50000, 'price': 2.50},
            {'date': '2026-03-14', 'quantity': 45000, 'price': 2.60},
            {'date': '2026-03-13', 'quantity': 55000, 'price': 2.40},
            {'date': '2026-03-12', 'quantity': 48000, 'price': 2.55},
            {'date': '2026-03-11', 'quantity': 52000, 'price': 2.45},
        ],
        'shares_outstanding': 5_000_000,  # 50K FTDs = 1% of float
    }
    signals = analyze_ftd_data(ftd_data)
    codes = [s.code for s in signals]
    assert 'HIGH_FTD_RATE' in codes


def test_no_ftd_signal_below_threshold():
    ftd_data = {
        'ticker': 'GOOD',
        'ftd_records': [
            {'date': '2026-03-15', 'quantity': 100, 'price': 45.00},
        ],
        'shares_outstanding': 50_000_000,  # tiny FTDs
    }
    signals = analyze_ftd_data(ftd_data)
    assert len(signals) == 0


def test_ftd_exactly_at_threshold_not_triggered():
    """FTDs at exactly 0.5% threshold should NOT fire — must exceed it."""
    ftd_data = {
        'ticker': 'EDGE',
        'ftd_records': [
            {'date': f'2026-03-{10 + i:02d}', 'quantity': 25000, 'price': 1.00}
            for i in range(5)
        ],
        'shares_outstanding': 5_000_000,  # 25K / 5M = exactly 0.5% — not > threshold
    }
    signals = analyze_ftd_data(ftd_data)
    assert len(signals) == 0


def test_high_ftd_rate_fewer_than_5_days_no_signal():
    """Only 4 qualifying days should NOT trigger the signal."""
    ftd_data = {
        'ticker': 'ALMOST',
        'ftd_records': [
            {'date': f'2026-03-{10 + i:02d}', 'quantity': 50000, 'price': 1.00}
            for i in range(4)
        ],
        'shares_outstanding': 5_000_000,
    }
    signals = analyze_ftd_data(ftd_data)
    assert len(signals) == 0


def test_regsho_threshold_signal():
    status = {'ticker': 'PUMP', 'on_threshold_list': True, 'consecutive_days': 7}
    signals = analyze_threshold_list_status(status)
    codes = [s.code for s in signals]
    assert 'SHORT_INTEREST_SPIKE' in codes


def test_regsho_not_on_list():
    status = {'ticker': 'FINE', 'on_threshold_list': False, 'consecutive_days': 0}
    signals = analyze_threshold_list_status(status)
    assert len(signals) == 0


def test_regsho_signal_weight():
    """SHORT_INTEREST_SPIKE must have weight 2."""
    status = {'ticker': 'PUMP', 'on_threshold_list': True, 'consecutive_days': 3}
    signals = analyze_threshold_list_status(status)
    assert signals[0].weight == 2


def test_high_ftd_rate_signal_weight():
    """HIGH_FTD_RATE must have weight 1."""
    ftd_data = {
        'ticker': 'SCAM',
        'ftd_records': [
            {'date': f'2026-03-{10 + i:02d}', 'quantity': 50000, 'price': 2.50}
            for i in range(5)
        ],
        'shares_outstanding': 5_000_000,
    }
    signals = analyze_ftd_data(ftd_data)
    assert signals[0].weight == 1


def test_ftd_empty_records():
    """Empty FTD records should return no signals."""
    ftd_data = {'ticker': 'EMPTY', 'ftd_records': [], 'shares_outstanding': 1_000_000}
    signals = analyze_ftd_data(ftd_data)
    assert len(signals) == 0


def test_ftd_zero_shares_outstanding():
    """Zero shares_outstanding should not cause division-by-zero and returns no signals."""
    ftd_data = {
        'ticker': 'ZERO',
        'ftd_records': [{'date': '2026-03-15', 'quantity': 99999, 'price': 1.0}],
        'shares_outstanding': 0,
    }
    signals = analyze_ftd_data(ftd_data)
    assert len(signals) == 0
