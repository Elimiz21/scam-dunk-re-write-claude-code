"""
Pre-Pump Structural Signals Module

Detects early warning patterns for potential pump-and-dump schemes by
analyzing SEC EDGAR filing patterns and insider trading behavior.
"""

import csv
import io
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

SEC_FTD_HEADERS = {
    'User-Agent': 'ScamDunk Research Tool support@scamdunk.com',
}

# ---------------------------------------------------------------------------
# Module-level cache for FTD data (updated twice monthly — cache is valid)
# ---------------------------------------------------------------------------
_ftd_cache: Dict[str, Any] = {}  # key: yyyymmdd -> list of row dicts

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
# FTD / RegSHO analysis functions
# ---------------------------------------------------------------------------

def analyze_ftd_data(ftd_data: Dict) -> List[PrePumpSignal]:
    """
    Analyze SEC Fails-to-Deliver records for a single ticker.

    Args:
        ftd_data: dict with keys:
            - ticker (str)
            - ftd_records (list of {date: str, quantity: int, price: float})
              sorted descending by date (most recent first)
            - shares_outstanding (int)

    Returns:
        List of PrePumpSignal instances.
    """
    signals: List[PrePumpSignal] = []
    records: List[Dict] = ftd_data.get('ftd_records', [])
    shares_outstanding: int = ftd_data.get('shares_outstanding', 0)

    if not records or shares_outstanding <= 0:
        return signals

    # Determine which settlement days breach the 0.5% threshold
    threshold = 0.005 * shares_outstanding  # 0.5% of outstanding
    breach_days = [r for r in records if r.get('quantity', 0) > threshold]

    if len(breach_days) >= 5:
        max_qty = max(r.get('quantity', 0) for r in breach_days)
        max_pct = max_qty / shares_outstanding
        signals.append(PrePumpSignal(
            code='HIGH_FTD_RATE',
            category='short_interest',
            description=(
                f'FTDs exceeded 0.5% of shares outstanding on {len(breach_days)} consecutive '
                f'settlement days (peak: {max_qty:,} shares = {max_pct:.2%} of outstanding)'
            ),
            weight=1,
        ))

    return signals


def analyze_threshold_list_status(status: Dict) -> List[PrePumpSignal]:
    """
    Analyze RegSHO threshold list membership for a single ticker.

    Args:
        status: dict with keys:
            - ticker (str)
            - on_threshold_list (bool)
            - consecutive_days (int)
            - source (str, optional)

    Returns:
        List of PrePumpSignal instances.
    """
    signals: List[PrePumpSignal] = []
    if not status.get('on_threshold_list'):
        return signals

    consecutive_days: int = status.get('consecutive_days', 0)
    source: str = status.get('source', 'unknown exchange')
    signals.append(PrePumpSignal(
        code='SHORT_INTEREST_SPIKE',
        category='short_interest',
        description=(
            f'Stock appears on RegSHO threshold securities list ({source}) '
            f'for {consecutive_days} consecutive day(s) — aggregate FTDs >= 10,000 shares '
            f'and >= 0.5% of outstanding shares'
        ),
        weight=2,
    ))
    return signals


# ---------------------------------------------------------------------------
# SEC FTD & RegSHO data fetching helpers
# ---------------------------------------------------------------------------

def _get_recent_ftd_file_url() -> Optional[str]:
    """
    Determine the URL for the most recent SEC FTD CSV file.

    The SEC publishes FTD data twice monthly:
      - Files are named cnsfails<YYYYMMDD>a.zip / cnsfails<YYYYMMDD>b.zip
      - 'a' = data for the 1st–15th of the month (published ~end of month)
      - 'b' = data for the 16th–end of month (published ~mid next month)

    Strategy: try candidate dates going back up to 45 days until one returns
    a 200 response.
    """
    base_url = 'https://www.sec.gov/files/data/fails-deliver-data/'
    today = date.today()
    candidates: List[str] = []

    # Generate candidate filenames for the last 45 days (covers ~3 publications)
    for delta in range(0, 46):
        candidate_date = today - timedelta(days=delta)
        yyyymmdd = candidate_date.strftime('%Y%m%d')
        for suffix in ('b', 'a'):
            candidates.append(f'cnsfails{yyyymmdd}{suffix}.zip')

    # Deduplicate while preserving order
    seen: set = set()
    unique_candidates: List[str] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique_candidates.append(c)

    for filename in unique_candidates:
        url = base_url + filename
        try:
            resp = requests.head(url, headers=SEC_FTD_HEADERS, timeout=10, allow_redirects=True)
            if resp.status_code == 200:
                return url
        except Exception:
            continue
    return None


def _parse_ftd_csv(csv_text: str, ticker: str) -> List[Dict]:
    """
    Parse a SEC FTD CSV (pipe-delimited) and return rows for the given ticker.

    SEC format (pipe-separated):
      SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE
    """
    results: List[Dict] = []
    reader = csv.DictReader(io.StringIO(csv_text), delimiter='|')
    ticker_upper = ticker.upper()
    for row in reader:
        symbol = (row.get('SYMBOL') or row.get(' SYMBOL') or '').strip().upper()
        if symbol != ticker_upper:
            continue
        try:
            quantity = int(str(row.get('QUANTITY (FAILS)', 0)).strip().replace(',', '') or 0)
        except ValueError:
            quantity = 0
        try:
            price = float(str(row.get('PRICE', 0)).strip() or 0)
        except ValueError:
            price = 0.0
        raw_date = (row.get('SETTLEMENT DATE') or row.get(' SETTLEMENT DATE') or '').strip()
        # Normalize date to ISO format (SEC uses YYYYMMDD)
        try:
            parsed_date = datetime.strptime(raw_date, '%Y%m%d').strftime('%Y-%m-%d')
        except ValueError:
            parsed_date = raw_date
        results.append({'date': parsed_date, 'quantity': quantity, 'price': price})

    # Sort descending by date (most recent first)
    results.sort(key=lambda r: r['date'], reverse=True)
    return results


def fetch_sec_ftd_data(ticker: str) -> Dict:
    """
    Fetch recent Fails-to-Deliver data from SEC for a ticker.

    SEC publishes FTD data as zipped CSVs at:
    https://www.sec.gov/files/data/fails-deliver-data/

    Returns:
        {ticker, ftd_days, max_ftd_quantity, has_threshold_violation, ftd_records}
    """
    global _ftd_cache

    import zipfile

    ticker_upper = ticker.upper()
    result_base = {
        'ticker': ticker_upper,
        'ftd_days': 0,
        'max_ftd_quantity': 0,
        'has_threshold_violation': False,
        'ftd_records': [],
    }

    url = _get_recent_ftd_file_url()
    if not url:
        logger.warning('Could not locate recent SEC FTD file')
        return result_base

    # Use URL as cache key
    if url in _ftd_cache:
        csv_text = _ftd_cache[url]
    else:
        try:
            resp = requests.get(url, headers=SEC_FTD_HEADERS, timeout=30)
            resp.raise_for_status()
            # Content is a zip file
            zf = zipfile.ZipFile(io.BytesIO(resp.content))
            # The zip should contain one CSV file
            csv_name = next(n for n in zf.namelist() if n.endswith('.txt') or n.endswith('.csv'))
            csv_text = zf.read(csv_name).decode('utf-8', errors='replace')
            _ftd_cache[url] = csv_text
            time.sleep(0.2)  # rate limit SEC requests
        except Exception as exc:
            logger.warning('Failed to fetch SEC FTD data from %s: %s', url, exc)
            return result_base

    records = _parse_ftd_csv(csv_text, ticker_upper)
    if not records:
        return result_base

    max_qty = max(r['quantity'] for r in records)
    return {
        'ticker': ticker_upper,
        'ftd_days': len(records),
        'max_ftd_quantity': max_qty,
        'has_threshold_violation': False,  # caller checks against shares_outstanding
        'ftd_records': records,
    }


def check_regsho_threshold(ticker: str) -> Dict:
    """
    Check if a ticker is on the RegSHO threshold securities list.

    The threshold list is published daily by exchanges:
    - NASDAQ: https://www.nasdaqtrader.com/trader.aspx?id=RegSHOThreshold
    - NYSE: https://www.nyse.com/regulation/threshold-securities

    NASDAQ provides a downloadable file at a predictable URL that returns
    pipe-delimited data for the current trading day.

    Returns:
        {ticker, on_threshold_list, consecutive_days, source}
    """
    ticker_upper = ticker.upper()
    base_result = {
        'ticker': ticker_upper,
        'on_threshold_list': False,
        'consecutive_days': 0,
        'source': 'NASDAQ',
    }

    # NASDAQ publishes current-day threshold list as a downloadable text file
    nasdaq_url = 'https://www.nasdaqtrader.com/dynamic/symdir/regsho/nasdaqth.txt'
    try:
        resp = requests.get(nasdaq_url, headers=SEC_FTD_HEADERS, timeout=15)
        resp.raise_for_status()
        text = resp.text

        # The file is pipe-delimited: Date|Symbol|ShortName|Exchange|Reg SHO Threshold Flag|Rules
        # or sometimes just Symbol in first column. Count occurrences of the ticker.
        consecutive_days = 0
        for line in text.splitlines():
            parts = line.strip().split('|')
            if len(parts) >= 2:
                symbol_col = parts[1].strip().upper() if len(parts) > 1 else parts[0].strip().upper()
                if symbol_col == ticker_upper:
                    consecutive_days += 1

        if consecutive_days > 0:
            return {
                'ticker': ticker_upper,
                'on_threshold_list': True,
                'consecutive_days': consecutive_days,
                'source': 'NASDAQ',
            }

        time.sleep(0.2)
    except Exception as exc:
        logger.warning('Failed to fetch NASDAQ RegSHO threshold list: %s', exc)
        time.sleep(0.2)

    # Fallback: NYSE threshold list
    nyse_url = 'https://www.nyse.com/api/regulatory/threshold-securities/download?market=NYSE'
    try:
        resp = requests.get(nyse_url, headers=SEC_FTD_HEADERS, timeout=15)
        resp.raise_for_status()
        text = resp.text
        consecutive_days = 0
        for line in text.splitlines():
            parts = line.strip().split('|')
            if len(parts) >= 2:
                symbol_col = parts[1].strip().upper() if len(parts) > 1 else parts[0].strip().upper()
                if symbol_col == ticker_upper:
                    consecutive_days += 1

        if consecutive_days > 0:
            return {
                'ticker': ticker_upper,
                'on_threshold_list': True,
                'consecutive_days': consecutive_days,
                'source': 'NYSE',
            }
    except Exception as exc:
        logger.warning('Failed to fetch NYSE RegSHO threshold list: %s', exc)

    return base_result


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

        # --- FTD and RegSHO checks (OTC/penny stocks only) ---
        if is_otc or market_cap is None:
            shares_outstanding = fund.get('shares_outstanding', 0)

            # SEC FTD check
            try:
                ftd_raw = fetch_sec_ftd_data(ticker_upper)
                ftd_raw['shares_outstanding'] = shares_outstanding
                ftd_signals = analyze_ftd_data(ftd_raw)
                all_signals.extend(ftd_signals)
            except Exception as exc:
                logger.warning('FTD check failed for %s: %s', ticker_upper, exc)

            time.sleep(0.2)

            # RegSHO threshold list check
            try:
                threshold_status = check_regsho_threshold(ticker_upper)
                regsho_signals = analyze_threshold_list_status(threshold_status)
                all_signals.extend(regsho_signals)
            except Exception as exc:
                logger.warning('RegSHO check failed for %s: %s', ticker_upper, exc)

            time.sleep(0.2)

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
