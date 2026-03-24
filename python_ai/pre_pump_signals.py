"""
Pre-Pump Structural Signals Module

Detects early warning patterns for potential pump-and-dump schemes by
analyzing SEC EDGAR filing patterns and insider trading behavior.
"""

import time
import logging
from dataclasses import dataclass
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any

import requests

logger = logging.getLogger(__name__)

EDGAR_HEADERS = {
    'User-Agent': 'ScamDunk Research Tool support@scamdunk.com',
    'Accept': 'application/json',
}

REVERSE_MERGER_KEYWORDS = [
    'reverse merger',
    'change of control',
    'reverse stock split',
    'share exchange agreement',
    'business combination',
]


@dataclass
class PrePumpSignal:
    """A single detected pre-pump structural signal."""
    code: str
    category: str
    description: str
    weight: int


# ---------------------------------------------------------------------------
# Core analysis functions
# ---------------------------------------------------------------------------

def analyze_filing_patterns(filing_data: Dict) -> List[PrePumpSignal]:
    """
    Analyze SEC filing patterns for pre-pump structural signals.

    Args:
        filing_data: dict with keys:
            - ticker (str)
            - cik (str)
            - filings (list of {type, date, title})
            - last_filing_before_gap (ISO date string or None)

    Returns:
        Deduplicated list of PrePumpSignal instances.
    """
    signals: Dict[str, PrePumpSignal] = {}
    filings: List[Dict] = filing_data.get('filings', [])
    last_filing_before_gap: Optional[str] = filing_data.get('last_filing_before_gap')

    # --- SHELL_REACTIVATION: dormancy gap >= 180 days followed by activity ---
    if last_filing_before_gap:
        try:
            gap_date = datetime.strptime(last_filing_before_gap, '%Y-%m-%d').date()
            # Find earliest filing date in the current batch
            filing_dates = []
            for f in filings:
                try:
                    filing_dates.append(datetime.strptime(f['date'], '%Y-%m-%d').date())
                except (KeyError, ValueError):
                    pass
            if filing_dates:
                earliest_recent = min(filing_dates)
                gap_days = (earliest_recent - gap_date).days
                if gap_days >= 180:
                    signals['SHELL_REACTIVATION'] = PrePumpSignal(
                        code='SHELL_REACTIVATION',
                        category='filing_pattern',
                        description=(
                            f'Shell company reactivated after {gap_days}-day dormancy gap '
                            f'(last filing before gap: {last_filing_before_gap})'
                        ),
                        weight=3,
                    )
        except ValueError:
            logger.warning('Could not parse last_filing_before_gap: %s', last_filing_before_gap)

    # --- REVERSE_MERGER_OTC: 8-K with reverse merger / change of control keywords ---
    for filing in filings:
        if filing.get('type', '').upper() == '8-K':
            title_lower = filing.get('title', '').lower()
            if any(kw in title_lower for kw in REVERSE_MERGER_KEYWORDS):
                signals['REVERSE_MERGER_OTC'] = PrePumpSignal(
                    code='REVERSE_MERGER_OTC',
                    category='filing_pattern',
                    description=(
                        f'8-K filing indicates reverse merger or change-of-control event: '
                        f'"{filing.get("title", "")}"'
                    ),
                    weight=2,
                )
                break

    # --- SUSPICIOUS_FILING_BURST: 3+ filings within 30-day window after dormancy ---
    if last_filing_before_gap and filings:
        try:
            gap_date = datetime.strptime(last_filing_before_gap, '%Y-%m-%d').date()
            # Collect filing dates that are after the gap
            post_gap_dates = []
            for f in filings:
                try:
                    d = datetime.strptime(f['date'], '%Y-%m-%d').date()
                    if d > gap_date:
                        post_gap_dates.append(d)
                except (KeyError, ValueError):
                    pass

            post_gap_dates.sort()
            # Sliding 30-day window
            for i, anchor in enumerate(post_gap_dates):
                window = [d for d in post_gap_dates if 0 <= (d - anchor).days <= 30]
                if len(window) >= 3:
                    signals['SUSPICIOUS_FILING_BURST'] = PrePumpSignal(
                        code='SUSPICIOUS_FILING_BURST',
                        category='filing_pattern',
                        description=(
                            f'{len(window)} filings within a 30-day window following dormancy '
                            f'(starting {anchor})'
                        ),
                        weight=2,
                    )
                    break
        except ValueError:
            pass

    return list(signals.values())


def analyze_insider_behavior(insider_data: Dict) -> List[PrePumpSignal]:
    """
    Analyze insider trading filings for pre-pump behavioral signals.

    Args:
        insider_data: dict with keys:
            - form4_filings (list of filing dicts)
            - form144_filings (list of filing dicts)
            - price_change_90d (float, e.g. 0.35 = +35%)

    Returns:
        List of PrePumpSignal instances.
    """
    signals: Dict[str, PrePumpSignal] = {}
    form4_filings: List[Dict] = insider_data.get('form4_filings', [])
    form144_filings: List[Dict] = insider_data.get('form144_filings', [])
    price_change_90d: float = insider_data.get('price_change_90d', 0.0)

    # --- INSIDER_SELLING_SETUP: Form 144 filed + price up > 10% ---
    if form144_filings and price_change_90d > 0.10:
        total_shares = sum(f.get('shares', 0) for f in form144_filings)
        insiders = list({f.get('insider', 'Unknown') for f in form144_filings})
        signals['INSIDER_SELLING_SETUP'] = PrePumpSignal(
            code='INSIDER_SELLING_SETUP',
            category='insider_behavior',
            description=(
                f'Form 144 filed by {", ".join(insiders)} ({total_shares:,} shares) '
                f'while stock is up {price_change_90d:.0%} over 90 days — '
                f'potential distribution setup'
            ),
            weight=2,
        )

    # --- NO_INSIDER_BUYING: No purchases in Form 4 + price up >= 20% ---
    if price_change_90d >= 0.20:
        purchases = [
            f for f in form4_filings
            if str(f.get('transaction_type', '')).upper() in ('P', 'A', 'BUY', 'PURCHASE')
        ]
        if not purchases:
            signals['NO_INSIDER_BUYING'] = PrePumpSignal(
                code='NO_INSIDER_BUYING',
                category='insider_behavior',
                description=(
                    f'No insider purchases on record while stock is up {price_change_90d:.0%} '
                    f'over 90 days — insiders not participating in the rally'
                ),
                weight=1,
            )

    return list(signals.values())


# ---------------------------------------------------------------------------
# EDGAR data fetching helpers
# ---------------------------------------------------------------------------

def _resolve_cik(ticker: str) -> Optional[str]:
    """Resolve a ticker symbol to its SEC CIK number."""
    try:
        url = 'https://www.sec.gov/files/company_tickers.json'
        resp = requests.get(url, headers=EDGAR_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        ticker_upper = ticker.upper()
        for entry in data.values():
            if entry.get('ticker', '').upper() == ticker_upper:
                return str(entry['cik_str']).zfill(10)
    except Exception as exc:
        logger.warning('Failed to resolve CIK for %s: %s', ticker, exc)
    return None


def _fetch_submissions(cik_padded: str) -> Optional[Dict]:
    """Fetch the EDGAR submissions JSON for a given zero-padded CIK."""
    try:
        url = f'https://data.sec.gov/submissions/CIK{cik_padded}.json'
        resp = requests.get(url, headers=EDGAR_HEADERS, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning('Failed to fetch submissions for CIK %s: %s', cik_padded, exc)
    return None


def fetch_edgar_filings(ticker: str, cik: Optional[str] = None) -> Dict:
    """
    Fetch recent SEC EDGAR filings for a ticker.

    Returns a dict compatible with analyze_filing_patterns:
        {ticker, cik, filings, last_filing_before_gap}
    """
    cik_padded = cik
    if cik_padded and len(cik_padded) < 10:
        cik_padded = cik_padded.zfill(10)
    if not cik_padded:
        cik_padded = _resolve_cik(ticker)
    if not cik_padded:
        logger.warning('Could not resolve CIK for %s', ticker)
        return {'ticker': ticker, 'cik': None, 'filings': [], 'last_filing_before_gap': None}

    submissions = _fetch_submissions(cik_padded)
    if not submissions:
        return {'ticker': ticker, 'cik': cik_padded, 'filings': [], 'last_filing_before_gap': None}

    recent = submissions.get('filings', {}).get('recent', {})
    form_types: List[str] = recent.get('form', [])
    filed_dates: List[str] = recent.get('filingDate', [])
    descriptions: List[str] = recent.get('primaryDocument', [])

    # Build list of all filings sorted by date
    all_filings = []
    for ftype, fdate, fdesc in zip(form_types, filed_dates, descriptions):
        all_filings.append({'type': ftype, 'date': fdate, 'title': fdesc})
    all_filings.sort(key=lambda x: x['date'], reverse=True)

    # Filter to last 90 days
    cutoff = (date.today() - timedelta(days=90)).isoformat()
    recent_filings = [f for f in all_filings if f['date'] >= cutoff]

    # Detect dormancy gap: find last filing before the 90-day window, then check
    # whether there is a gap of >= 180 days before the earliest filing in the window
    last_before_gap: Optional[str] = None
    if recent_filings:
        earliest_in_window = min(f['date'] for f in recent_filings)
        older_filings = [f for f in all_filings if f['date'] < earliest_in_window]
        if older_filings:
            most_recent_older = max(f['date'] for f in older_filings)
            oldest_date = datetime.strptime(most_recent_older, '%Y-%m-%d').date()
            newest_date = datetime.strptime(earliest_in_window, '%Y-%m-%d').date()
            if (newest_date - oldest_date).days >= 180:
                last_before_gap = most_recent_older

    return {
        'ticker': ticker,
        'cik': cik_padded,
        'filings': recent_filings,
        'last_filing_before_gap': last_before_gap,
    }


def fetch_insider_filings(ticker: str, cik: Optional[str] = None) -> Dict:
    """
    Fetch Form 4 and Form 144 filings for a ticker from EDGAR.

    Returns a dict compatible with analyze_insider_behavior:
        {form4_filings, form144_filings, price_change_90d}
        (price_change_90d is left as 0.0 — caller must populate it)
    """
    cik_padded = cik
    if cik_padded and len(cik_padded) < 10:
        cik_padded = cik_padded.zfill(10)
    if not cik_padded:
        cik_padded = _resolve_cik(ticker)
    if not cik_padded:
        return {'form4_filings': [], 'form144_filings': [], 'price_change_90d': 0.0}

    submissions = _fetch_submissions(cik_padded)
    if not submissions:
        return {'form4_filings': [], 'form144_filings': [], 'price_change_90d': 0.0}

    recent = submissions.get('filings', {}).get('recent', {})
    form_types: List[str] = recent.get('form', [])
    filed_dates: List[str] = recent.get('filingDate', [])

    form4_filings: List[Dict] = []
    form144_filings: List[Dict] = []
    cutoff = (date.today() - timedelta(days=90)).isoformat()

    for ftype, fdate in zip(form_types, filed_dates):
        if fdate < cutoff:
            continue
        if ftype in ('4', '4/A'):
            form4_filings.append({'type': ftype, 'date': fdate, 'transaction_type': ''})
        elif ftype in ('144', '144/A'):
            form144_filings.append({'type': ftype, 'date': fdate, 'shares': 0, 'insider': 'Unknown'})

    return {
        'form4_filings': form4_filings,
        'form144_filings': form144_filings,
        'price_change_90d': 0.0,
    }


# ---------------------------------------------------------------------------
# Batch scanner
# ---------------------------------------------------------------------------

def scan_pre_pump_signals(tickers: List[str], fundamentals: Dict[str, Dict]) -> Dict[str, Any]:
    """
    Batch scan tickers for pre-pump structural signals.

    Only processes stocks with market_cap < 300M (or those without cap data).
    Rate-limits EDGAR calls to avoid throttling.

    Args:
        tickers: list of ticker symbols
        fundamentals: dict of {ticker: {market_cap: float, ...}}

    Returns:
        {
            ticker: {
                signals: [list of signal dicts],
                watchlist_recommended: bool
            }
        }
        Only tickers with signals are included.
    """
    results: Dict[str, Any] = {}
    MAX_MARKET_CAP = 300_000_000  # 300M

    for ticker in tickers:
        ticker_upper = ticker.upper()
        fund = fundamentals.get(ticker_upper, fundamentals.get(ticker, {}))
        market_cap = fund.get('market_cap')

        # Skip large-caps
        if market_cap is not None and market_cap >= MAX_MARKET_CAP:
            logger.debug('Skipping %s — market cap %.0f >= 300M', ticker_upper, market_cap)
            continue

        # Fetch filing data
        try:
            filing_data = fetch_edgar_filings(ticker_upper)
        except Exception as exc:
            logger.warning('fetch_edgar_filings failed for %s: %s', ticker_upper, exc)
            filing_data = {'ticker': ticker_upper, 'cik': None, 'filings': [], 'last_filing_before_gap': None}

        time.sleep(0.2)  # rate limit EDGAR calls

        filing_signals = analyze_filing_patterns(filing_data)

        is_otc = fund.get('exchange', '').upper() in ('OTC', 'OTCBB', 'PINK', 'OTC MARKETS')
        should_fetch_insider = bool(filing_signals) or is_otc

        all_signals = list(filing_signals)

        if should_fetch_insider:
            try:
                insider_data = fetch_insider_filings(ticker_upper, cik=filing_data.get('cik'))
            except Exception as exc:
                logger.warning('fetch_insider_filings failed for %s: %s', ticker_upper, exc)
                insider_data = {'form4_filings': [], 'form144_filings': [], 'price_change_90d': 0.0}

            time.sleep(0.2)

            # Fetch price change via yfinance
            price_change_90d = 0.0
            try:
                import yfinance as yf
                hist = yf.Ticker(ticker_upper).history(period='3mo')
                if not hist.empty and len(hist) >= 2:
                    price_start = hist['Close'].iloc[0]
                    price_end = hist['Close'].iloc[-1]
                    if price_start > 0:
                        price_change_90d = (price_end - price_start) / price_start
            except Exception as exc:
                logger.warning('yfinance price fetch failed for %s: %s', ticker_upper, exc)

            insider_data['price_change_90d'] = price_change_90d
            insider_signals = analyze_insider_behavior(insider_data)
            all_signals.extend(insider_signals)

        if all_signals:
            total_weight = sum(s.weight for s in all_signals)
            results[ticker_upper] = {
                'signals': [
                    {
                        'code': s.code,
                        'category': s.category,
                        'description': s.description,
                        'weight': s.weight,
                    }
                    for s in all_signals
                ],
                'watchlist_recommended': total_weight >= 3,
            }

    return results
