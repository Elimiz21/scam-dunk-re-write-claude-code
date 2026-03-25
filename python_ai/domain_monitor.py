"""
Domain Monitor Module for ScamDunk

Detects when promotional websites are registered for stock tickers — a strong
pre-pump indicator that typically appears 1-3 weeks before pump-and-dump schemes
launch.

Two detection methods:
1. WhoisXML API (when WHOISXML_API_KEY is set): queries newly-registered domains feed
2. DNS resolution check (always free): checks if common promotional domain patterns resolve
"""

import os
import socket
import logging
from typing import Dict, List, Optional, Any

import requests

from pre_pump_signals import PrePumpSignal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Domain pattern constants
# ---------------------------------------------------------------------------

PROMOTIONAL_DOMAIN_PATTERNS = [
    '{ticker}alert',
    '{ticker}investor',
    '{ticker}stock',
    '{ticker}picks',
    '{ticker}news',
    'buy{ticker}',
    'invest{ticker}',
    '{ticker}moon',
    '{ticker}gains',
    '{ticker}report',
    '{ticker}analysis',
    '{ticker}opportunity',
]

PROMOTIONAL_TLD_PATTERNS = ['.com', '.net', '.info', '.org', '.io']

# WhoisXML API endpoints
WHOISXML_REVERSE_WHOIS_URL = 'https://reverse-whois.whoisxmlapi.com/api/v2'
WHOISXML_NEW_DOMAINS_URL = 'https://newly-registered-domains.whoisxmlapi.com/api/v1'
WHOISXML_AVAILABILITY_URL = 'https://domain-availability.whoisxmlapi.com/api/v1'


# ---------------------------------------------------------------------------
# Domain pattern generation
# ---------------------------------------------------------------------------

def generate_promotional_domains(ticker: str) -> List[str]:
    """
    Generate all promotional domain candidates for a given ticker.

    Args:
        ticker: Stock ticker symbol (case-insensitive)

    Returns:
        List of domain strings like 'pumpalert.com', 'investpump.net', etc.
    """
    ticker_lower = ticker.lower()
    domains = []
    for pattern in PROMOTIONAL_DOMAIN_PATTERNS:
        for tld in PROMOTIONAL_TLD_PATTERNS:
            domains.append(pattern.format(ticker=ticker_lower) + tld)
    return domains


# ---------------------------------------------------------------------------
# DNS resolution check (free, no API key required)
# ---------------------------------------------------------------------------

def check_promotional_domains_dns(ticker: str) -> List[Dict]:
    """
    Check if common promotional domain patterns resolve via DNS.

    This is free and requires no API key. It checks if domains like
    {ticker}alert.com, invest{ticker}.com etc. actually exist.

    Args:
        ticker: Stock ticker symbol

    Returns:
        List of dicts for domains that resolve: [{domain, resolves}]
    """
    results = []
    ticker_lower = ticker.lower()
    for pattern in PROMOTIONAL_DOMAIN_PATTERNS:
        for tld in PROMOTIONAL_TLD_PATTERNS:
            domain = pattern.format(ticker=ticker_lower) + tld
            try:
                socket.getaddrinfo(
                    domain, None,
                    socket.AF_INET, socket.SOCK_STREAM,
                    0, socket.AI_CANONNAME
                )
                results.append({'domain': domain, 'resolves': True})
                logger.info('Promotional domain resolves: %s', domain)
            except socket.gaierror:
                pass  # domain doesn't resolve — not suspicious
    return results


# ---------------------------------------------------------------------------
# WhoisXML API integration (optional, requires API key)
# ---------------------------------------------------------------------------

def _query_whoisxml_reverse_whois(ticker: str, company_name: Optional[str], api_key: str) -> List[Dict]:
    """
    Query WhoisXML Reverse WHOIS API for domains mentioning the ticker or company.

    Returns list of domain dicts: [{domain, registered_date, registrar}]
    """
    search_terms = [ticker.lower()]
    if company_name:
        search_terms.append(company_name.lower())

    found_domains = []
    for term in search_terms:
        try:
            payload = {
                'apiKey': api_key,
                'searchType': 'current',
                'mode': 'purchase',
                'basicSearchTerms': {
                    'include': [term],
                },
            }
            resp = requests.post(WHOISXML_REVERSE_WHOIS_URL, json=payload, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            domains_raw = data.get('domainsList', [])
            for d in domains_raw:
                if isinstance(d, str):
                    found_domains.append({
                        'domain': d,
                        'registered_date': None,
                        'registrar': None,
                        'source': 'whoisxml_reverse',
                    })
                elif isinstance(d, dict):
                    found_domains.append({
                        'domain': d.get('domainName', ''),
                        'registered_date': d.get('createdDate'),
                        'registrar': d.get('registrarName'),
                        'source': 'whoisxml_reverse',
                    })
        except Exception as exc:
            logger.warning('WhoisXML reverse WHOIS query failed for term "%s": %s', term, exc)

    return found_domains


def _query_whoisxml_new_domains(ticker: str, api_key: str) -> List[Dict]:
    """
    Query WhoisXML Newly Registered Domains API for ticker-matching domains.

    Returns list of domain dicts: [{domain, registered_date, registrar}]
    """
    found_domains = []
    ticker_lower = ticker.lower()
    try:
        params = {
            'apiKey': api_key,
            'keyword': ticker_lower,
            'since': '1',  # domains registered in the last day
            'outputFormat': 'JSON',
        }
        resp = requests.get(WHOISXML_NEW_DOMAINS_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for entry in data.get('domainsList', []):
            if isinstance(entry, str):
                found_domains.append({
                    'domain': entry,
                    'registered_date': None,
                    'registrar': None,
                    'source': 'whoisxml_new',
                })
            elif isinstance(entry, dict):
                found_domains.append({
                    'domain': entry.get('domainName', ''),
                    'registered_date': entry.get('createdDate'),
                    'registrar': entry.get('registrarName'),
                    'source': 'whoisxml_new',
                })
    except Exception as exc:
        logger.warning('WhoisXML new domains query failed for %s: %s', ticker, exc)

    return found_domains


# ---------------------------------------------------------------------------
# Signal evaluation
# ---------------------------------------------------------------------------

def evaluate_domain_results(ticker: str, dns_results: List[Dict]) -> List[PrePumpSignal]:
    """
    Evaluate DNS (or API) results and produce PrePumpSignal instances.

    Args:
        ticker: Stock ticker symbol
        dns_results: List of dicts with at least {domain, resolves: True}

    Returns:
        List of PrePumpSignal instances (empty if nothing found)
    """
    resolved = [r for r in dns_results if r.get('resolves')]
    if not resolved:
        return []

    domain_list = ', '.join(r['domain'] for r in resolved[:5])
    suffix = f' (+{len(resolved) - 5} more)' if len(resolved) > 5 else ''

    return [
        PrePumpSignal(
            code='PROMOTIONAL_DOMAIN_DETECTED',
            category='domain_infrastructure',
            description=(
                f'Promotional domain(s) resolving for {ticker.upper()}: '
                f'{domain_list}{suffix}'
            ),
            weight=3,
        )
    ]


# ---------------------------------------------------------------------------
# Main public API
# ---------------------------------------------------------------------------

def check_domain_registrations(
    ticker: str,
    company_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict:
    """
    Check for recently registered promotional domains for a ticker.

    If WHOISXML_API_KEY is provided (via param or env var), uses the real API.
    Otherwise, falls back to DNS resolution check (free, graceful degradation).

    Args:
        ticker: Stock ticker symbol
        company_name: Optional company name for broader search
        api_key: WhoisXML API key (falls back to WHOISXML_API_KEY env var)

    Returns:
        {
            ticker: str,
            domains_found: List[Dict],   # [{domain, registered_date, registrar}]
            signals: List[PrePumpSignal],
        }
    """
    resolved_key = api_key or os.environ.get('WHOISXML_API_KEY')
    domains_found: List[Dict] = []
    signals: List[PrePumpSignal] = []

    if resolved_key:
        logger.info('Using WhoisXML API for domain check on %s', ticker)
        try:
            # Reverse WHOIS: find all domains mentioning the ticker / company
            api_domains = _query_whoisxml_reverse_whois(ticker, company_name, resolved_key)

            # Newly registered domains feed: keyword match on ticker
            new_domains = _query_whoisxml_new_domains(ticker, resolved_key)

            # Merge, deduplicate by domain name
            seen: set = set()
            for d in api_domains + new_domains:
                name = d.get('domain', '')
                if name and name not in seen:
                    seen.add(name)
                    domains_found.append(d)

            # Also filter to promotional patterns only (avoid false positives)
            all_promo = set(generate_promotional_domains(ticker))
            promotional_found = [
                d for d in domains_found if d.get('domain', '') in all_promo
            ]

            # Evaluate: use promotional matches for signal; fall back to all found
            dns_like = [
                {'domain': d['domain'], 'resolves': True}
                for d in (promotional_found if promotional_found else domains_found)
            ]
            signals = evaluate_domain_results(ticker, dns_like)

        except Exception as exc:
            logger.error('WhoisXML check failed for %s, falling back to DNS: %s', ticker, exc)
            # Fall through to DNS check below
            resolved_key = None

    if not resolved_key:
        logger.info('Using DNS resolution check for %s (no API key)', ticker)
        dns_results = check_promotional_domains_dns(ticker)
        domains_found = [
            {'domain': r['domain'], 'registered_date': None, 'registrar': None}
            for r in dns_results
        ]
        signals = evaluate_domain_results(ticker, dns_results)

    return {
        'ticker': ticker.upper(),
        'domains_found': domains_found,
        'signals': signals,
    }


# ---------------------------------------------------------------------------
# Batch scanner
# ---------------------------------------------------------------------------

def scan_domain_infrastructure(
    tickers: List[str],
    company_names: Optional[Dict[str, str]] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Batch scan tickers for promotional domain infrastructure.

    Args:
        tickers: List of ticker symbols to scan
        company_names: Optional dict of ticker -> company name
        api_key: WhoisXML API key (falls back to WHOISXML_API_KEY env var)

    Returns:
        Dict of ticker -> result dict for tickers that have signals.
        Result dict: {signals, domains_found, watchlist_recommended}
    """
    if company_names is None:
        company_names = {}

    resolved_key = api_key or os.environ.get('WHOISXML_API_KEY')
    results: Dict[str, Any] = {}

    for ticker in tickers:
        ticker_upper = ticker.upper()
        try:
            company = company_names.get(ticker_upper, company_names.get(ticker))
            result = check_domain_registrations(ticker_upper, company_name=company, api_key=resolved_key)

            if result['signals']:
                total_weight = sum(s.weight for s in result['signals'])
                results[ticker_upper] = {
                    'domains_found': result['domains_found'],
                    'signals': [
                        {
                            'code': s.code,
                            'category': s.category,
                            'description': s.description,
                            'weight': s.weight,
                        }
                        for s in result['signals']
                    ],
                    'watchlist_recommended': total_weight >= 3,
                }
        except Exception as exc:
            logger.error('Domain scan failed for %s: %s', ticker_upper, exc)
            continue

    return results
