import pytest
import sys
sys.path.insert(0, '.')
from pre_pump_signals import (
    analyze_filing_patterns,
    analyze_insider_behavior,
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
