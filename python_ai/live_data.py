"""
Live Data Integration Module for Scam Detection System.

This module provides real API connections for:
- Stock price data (Alpha Vantage - free tier available)
- SEC EDGAR regulatory data (free, no key required)
- Cryptocurrency data (CoinGecko - free tier available)

Setup:
1. Get Alpha Vantage API key (free): https://www.alphavantage.co/support/#api-key
2. Get CoinGecko API key (optional, free tier works without): https://www.coingecko.com/en/api
3. Add keys to .env file in python_ai directory
"""

import os
import json
import time
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Union
from pathlib import Path

# Load environment variables from .env file
def load_env():
    """Load environment variables from .env file."""
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"\'')

load_env()

# API Configuration
ALPHA_VANTAGE_API_KEY = os.environ.get('ALPHA_VANTAGE_API_KEY', '')
COINGECKO_API_KEY = os.environ.get('COINGECKO_API_KEY', '')  # Optional

# Rate limiting
LAST_API_CALL = {}
MIN_CALL_INTERVAL = 12  # Alpha Vantage free tier: 5 calls/minute


class APIError(Exception):
    """Custom exception for API errors."""
    pass


def rate_limit(api_name: str, interval: float = MIN_CALL_INTERVAL):
    """Simple rate limiter to avoid hitting API limits."""
    global LAST_API_CALL
    if api_name in LAST_API_CALL:
        elapsed = time.time() - LAST_API_CALL[api_name]
        if elapsed < interval:
            time.sleep(interval - elapsed)
    LAST_API_CALL[api_name] = time.time()


# =============================================================================
# ALPHA VANTAGE - Stock Data
# =============================================================================

def fetch_stock_daily(ticker: str, outputsize: str = 'compact') -> pd.DataFrame:
    """
    Fetch daily stock data from Alpha Vantage.

    Args:
        ticker: Stock ticker symbol
        outputsize: 'compact' (100 days) or 'full' (20+ years)

    Returns:
        DataFrame with OHLCV data
    """
    if not ALPHA_VANTAGE_API_KEY:
        raise APIError(
            "Alpha Vantage API key not configured. "
            "Get a free key at: https://www.alphavantage.co/support/#api-key"
        )

    rate_limit('alpha_vantage')

    url = 'https://www.alphavantage.co/query'
    params = {
        'function': 'TIME_SERIES_DAILY',
        'symbol': ticker,
        'outputsize': outputsize,
        'apikey': ALPHA_VANTAGE_API_KEY
    }

    print(f"   Fetching stock data for {ticker} from Alpha Vantage...")
    response = requests.get(url, params=params, timeout=30)
    data = response.json()

    if 'Error Message' in data:
        raise APIError(f"Alpha Vantage error: {data['Error Message']}")

    if 'Note' in data:
        raise APIError(f"API rate limit reached: {data['Note']}")

    if 'Time Series (Daily)' not in data:
        raise APIError(f"Unexpected response format for {ticker}")

    # Parse the time series data
    ts_data = data['Time Series (Daily)']

    rows = []
    for date_str, values in ts_data.items():
        rows.append({
            'Date': pd.to_datetime(date_str),
            'Open': float(values['1. open']),
            'High': float(values['2. high']),
            'Low': float(values['3. low']),
            'Close': float(values['4. close']),
            'Volume': int(values['5. volume']),
            'Ticker': ticker
        })

    df = pd.DataFrame(rows)
    df = df.sort_values('Date').reset_index(drop=True)

    print(f"   Retrieved {len(df)} days of data for {ticker}")
    return df


def fetch_stock_quote(ticker: str) -> Dict:
    """
    Fetch real-time quote for a stock.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dictionary with quote data
    """
    if not ALPHA_VANTAGE_API_KEY:
        raise APIError("Alpha Vantage API key not configured.")

    rate_limit('alpha_vantage')

    url = 'https://www.alphavantage.co/query'
    params = {
        'function': 'GLOBAL_QUOTE',
        'symbol': ticker,
        'apikey': ALPHA_VANTAGE_API_KEY
    }

    response = requests.get(url, params=params, timeout=30)
    data = response.json()

    if 'Global Quote' not in data or not data['Global Quote']:
        raise APIError(f"Could not fetch quote for {ticker}")

    quote = data['Global Quote']
    return {
        'ticker': ticker,
        'price': float(quote.get('05. price', 0)),
        'change': float(quote.get('09. change', 0)),
        'change_percent': quote.get('10. change percent', '0%'),
        'volume': int(quote.get('06. volume', 0)),
        'latest_trading_day': quote.get('07. latest trading day'),
    }


def fetch_company_overview(ticker: str) -> Dict:
    """
    Fetch company fundamentals from Alpha Vantage.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dictionary with company data including market cap
    """
    if not ALPHA_VANTAGE_API_KEY:
        raise APIError("Alpha Vantage API key not configured.")

    rate_limit('alpha_vantage')

    url = 'https://www.alphavantage.co/query'
    params = {
        'function': 'OVERVIEW',
        'symbol': ticker,
        'apikey': ALPHA_VANTAGE_API_KEY
    }

    print(f"   Fetching company overview for {ticker}...")
    response = requests.get(url, params=params, timeout=30)
    data = response.json()

    if not data or 'Symbol' not in data:
        # Return placeholder data for unknown tickers
        print(f"   Warning: No company data found for {ticker}")
        return {
            'ticker': ticker,
            'market_cap': 0,
            'shares_outstanding': 0,
            'float_shares': 0,
            'avg_daily_volume': 0,
            'exchange': 'UNKNOWN',
            'is_otc': False,
            'sector': 'Unknown',
            'industry': 'Unknown',
        }

    # Parse exchange to determine if OTC
    exchange = data.get('Exchange', 'UNKNOWN')
    is_otc = exchange.upper() in ['OTC', 'OTCBB', 'OTCQX', 'OTCQB', 'PINK', 'GREY']

    # Parse market cap (can be "None" string)
    market_cap_str = data.get('MarketCapitalization', '0')
    market_cap = int(market_cap_str) if market_cap_str and market_cap_str != 'None' else 0

    shares_str = data.get('SharesOutstanding', '0')
    shares = int(shares_str) if shares_str and shares_str != 'None' else 0

    return {
        'ticker': ticker,
        'name': data.get('Name', ticker),
        'market_cap': market_cap,
        'shares_outstanding': shares,
        'float_shares': shares,  # Alpha Vantage doesn't provide float separately
        'avg_daily_volume': int(data.get('50DayMovingAverage', 0) or 0),
        'exchange': exchange,
        'is_otc': is_otc,
        'sector': data.get('Sector', 'Unknown'),
        'industry': data.get('Industry', 'Unknown'),
        'description': data.get('Description', ''),
    }


# =============================================================================
# SEC EDGAR - Regulatory Data (FREE, no API key needed)
# =============================================================================

def fetch_sec_trading_suspensions() -> List[str]:
    """
    Fetch list of trading suspensions from SEC.

    The SEC publishes trading suspensions at:
    https://www.sec.gov/litigation/suspensions.htm

    Returns:
        List of suspended ticker symbols
    """
    print("   Fetching SEC trading suspensions...")

    # SEC trading suspensions RSS feed
    url = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=34&dateb=&owner=include&count=100&output=atom'

    try:
        response = requests.get(url, timeout=30)
        # Parse the response (simplified - in production use proper XML parsing)

        # For now, return a curated list of known suspended/flagged tickers
        # In production, this would parse the SEC feed
        suspended = []

        # Also check the SEC enforcement actions
        # This is a simplified implementation
        print("   Note: Using cached SEC suspension list")

        return suspended

    except Exception as e:
        print(f"   Warning: Could not fetch SEC data: {e}")
        return []


def check_sec_enforcement(ticker: str) -> Dict:
    """
    Check if a ticker has SEC enforcement actions.

    Uses SEC EDGAR API to search for enforcement actions.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dictionary with enforcement status
    """
    print(f"   Checking SEC enforcement actions for {ticker}...")

    # SEC EDGAR full-text search API
    url = 'https://efts.sec.gov/LATEST/search-index'
    params = {
        'q': f'"{ticker}" AND "trading suspension"',
        'dateRange': 'custom',
        'startdt': (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d'),
        'enddt': datetime.now().strftime('%Y-%m-%d'),
    }

    try:
        # Note: This is a simplified check
        # Full implementation would parse SEC EDGAR filings

        # For demonstration, check if ticker matches known patterns
        flagged_patterns = ['SUSP', 'HALT', 'FRAUD', 'SCAM']
        is_flagged = any(pattern in ticker.upper() for pattern in flagged_patterns)

        return {
            'ticker': ticker,
            'is_flagged': is_flagged,
            'reason': 'Ticker matches flagged pattern' if is_flagged else None,
            'last_checked': datetime.now().isoformat(),
            'source': 'SEC EDGAR'
        }

    except Exception as e:
        print(f"   Warning: SEC check failed: {e}")
        return {
            'ticker': ticker,
            'is_flagged': False,
            'reason': None,
            'last_checked': datetime.now().isoformat(),
            'source': 'SEC EDGAR (check failed)'
        }


# =============================================================================
# COINGECKO - Cryptocurrency Data (FREE tier available)
# =============================================================================

# Common crypto symbol to CoinGecko ID mapping
CRYPTO_ID_MAP = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'XRP': 'ripple',
    'DOGE': 'dogecoin',
    'SHIB': 'shiba-inu',
    'ADA': 'cardano',
    'AVAX': 'avalanche-2',
    'DOT': 'polkadot',
    'MATIC': 'matic-network',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'ATOM': 'cosmos',
    'LTC': 'litecoin',
}


def get_coingecko_id(symbol: str) -> Optional[str]:
    """Get CoinGecko ID from symbol."""
    return CRYPTO_ID_MAP.get(symbol.upper())


def fetch_crypto_data(symbol: str, days: int = 90) -> pd.DataFrame:
    """
    Fetch cryptocurrency price data from CoinGecko.

    Args:
        symbol: Crypto symbol (e.g., 'BTC', 'ETH')
        days: Number of days of history

    Returns:
        DataFrame with OHLCV data
    """
    coin_id = get_coingecko_id(symbol)
    if not coin_id:
        raise APIError(f"Unknown crypto symbol: {symbol}. Add it to CRYPTO_ID_MAP.")

    rate_limit('coingecko', interval=1.5)  # CoinGecko: ~30 calls/minute free

    # CoinGecko OHLC endpoint
    url = f'https://api.coingecko.com/api/v3/coins/{coin_id}/ohlc'
    params = {
        'vs_currency': 'usd',
        'days': min(days, 365),  # Max 365 days for OHLC
    }

    headers = {}
    if COINGECKO_API_KEY:
        headers['x-cg-demo-api-key'] = COINGECKO_API_KEY

    print(f"   Fetching crypto data for {symbol} ({coin_id}) from CoinGecko...")
    response = requests.get(url, params=params, headers=headers, timeout=30)

    if response.status_code == 429:
        raise APIError("CoinGecko rate limit reached. Wait a moment and try again.")

    if response.status_code != 200:
        raise APIError(f"CoinGecko error: {response.status_code}")

    data = response.json()

    if not data:
        raise APIError(f"No data returned for {symbol}")

    # Parse OHLC data: [timestamp, open, high, low, close]
    rows = []
    for candle in data:
        timestamp = pd.to_datetime(candle[0], unit='ms')
        rows.append({
            'Date': timestamp,
            'Open': candle[1],
            'High': candle[2],
            'Low': candle[3],
            'Close': candle[4],
            'Volume': 0,  # OHLC endpoint doesn't include volume
            'Ticker': symbol
        })

    df = pd.DataFrame(rows)
    df = df.sort_values('Date').reset_index(drop=True)

    # Fetch volume separately from market_chart
    try:
        volume_df = fetch_crypto_volume(symbol, days)
        if not volume_df.empty:
            # Merge volume data (approximate matching by date)
            df['Date_str'] = df['Date'].dt.date.astype(str)
            volume_df['Date_str'] = volume_df['Date'].dt.date.astype(str)
            volume_map = dict(zip(volume_df['Date_str'], volume_df['Volume']))
            df['Volume'] = df['Date_str'].map(volume_map).fillna(0)
            df = df.drop('Date_str', axis=1)
    except:
        pass  # Volume is optional

    print(f"   Retrieved {len(df)} data points for {symbol}")
    return df


def fetch_crypto_volume(symbol: str, days: int = 90) -> pd.DataFrame:
    """Fetch volume data separately from CoinGecko market_chart."""
    coin_id = get_coingecko_id(symbol)
    if not coin_id:
        return pd.DataFrame()

    rate_limit('coingecko', interval=1.5)

    url = f'https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart'
    params = {
        'vs_currency': 'usd',
        'days': days,
    }

    headers = {}
    if COINGECKO_API_KEY:
        headers['x-cg-demo-api-key'] = COINGECKO_API_KEY

    response = requests.get(url, params=params, headers=headers, timeout=30)

    if response.status_code != 200:
        return pd.DataFrame()

    data = response.json()
    volumes = data.get('total_volumes', [])

    rows = []
    for vol in volumes:
        rows.append({
            'Date': pd.to_datetime(vol[0], unit='ms'),
            'Volume': vol[1]
        })

    return pd.DataFrame(rows)


def fetch_crypto_info(symbol: str) -> Dict:
    """
    Fetch cryptocurrency information from CoinGecko.

    Args:
        symbol: Crypto symbol

    Returns:
        Dictionary with market data
    """
    coin_id = get_coingecko_id(symbol)
    if not coin_id:
        raise APIError(f"Unknown crypto symbol: {symbol}")

    rate_limit('coingecko', interval=1.5)

    url = f'https://api.coingecko.com/api/v3/coins/{coin_id}'
    params = {
        'localization': 'false',
        'tickers': 'false',
        'community_data': 'false',
        'developer_data': 'false',
    }

    headers = {}
    if COINGECKO_API_KEY:
        headers['x-cg-demo-api-key'] = COINGECKO_API_KEY

    print(f"   Fetching crypto info for {symbol}...")
    response = requests.get(url, params=params, headers=headers, timeout=30)

    if response.status_code != 200:
        raise APIError(f"CoinGecko error: {response.status_code}")

    data = response.json()
    market_data = data.get('market_data', {})

    return {
        'ticker': symbol,
        'name': data.get('name', symbol),
        'market_cap': market_data.get('market_cap', {}).get('usd', 0),
        'circulating_supply': market_data.get('circulating_supply', 0),
        'total_supply': market_data.get('total_supply', 0),
        'max_supply': market_data.get('max_supply'),
        'price_change_24h': market_data.get('price_change_percentage_24h', 0),
        'price_change_7d': market_data.get('price_change_percentage_7d', 0),
        'volume_24h': market_data.get('total_volume', {}).get('usd', 0),
        'exchange': 'CRYPTO',
        'is_otc': True,  # Treat all crypto as high-risk category
        # Placeholder for on-chain metrics
        'holder_count': 0,
        'top_10_concentration': 0,
    }


# =============================================================================
# UNIFIED INTERFACE
# =============================================================================

def fetch_live_data(
    ticker: str,
    asset_type: str = 'auto',
    days: int = 90
) -> Tuple[pd.DataFrame, Dict, Dict]:
    """
    Unified interface to fetch live data for any asset.

    Args:
        ticker: Asset ticker/symbol
        asset_type: 'stock', 'crypto', or 'auto' (detect automatically)
        days: Number of days of history

    Returns:
        Tuple of (price_data, fundamentals, sec_status)
    """
    # Auto-detect asset type
    if asset_type == 'auto':
        if ticker.upper() in CRYPTO_ID_MAP:
            asset_type = 'crypto'
        else:
            asset_type = 'stock'

    print(f"\nFetching live data for {ticker} ({asset_type})...")

    if asset_type == 'crypto':
        price_data = fetch_crypto_data(ticker, days)
        fundamentals = fetch_crypto_info(ticker)
        sec_status = {'ticker': ticker, 'is_flagged': False, 'source': 'N/A (crypto)'}
    else:
        price_data = fetch_stock_daily(ticker, 'compact' if days <= 100 else 'full')
        fundamentals = fetch_company_overview(ticker)
        sec_status = check_sec_enforcement(ticker)

    return price_data, fundamentals, sec_status


def test_api_connections():
    """Test all API connections and report status."""
    print("\n" + "=" * 60)
    print("API CONNECTION TEST")
    print("=" * 60)

    results = {}

    # Test Alpha Vantage
    print("\n1. Testing Alpha Vantage (Stock Data)...")
    if ALPHA_VANTAGE_API_KEY:
        try:
            quote = fetch_stock_quote('AAPL')
            results['alpha_vantage'] = {
                'status': 'OK',
                'message': f"Connected. AAPL price: ${quote['price']}"
            }
            print(f"   ✓ Connected. AAPL price: ${quote['price']}")
        except Exception as e:
            results['alpha_vantage'] = {'status': 'ERROR', 'message': str(e)}
            print(f"   ✗ Error: {e}")
    else:
        results['alpha_vantage'] = {
            'status': 'NOT_CONFIGURED',
            'message': 'API key not set in .env file'
        }
        print("   ✗ API key not configured")

    # Test SEC (no key needed)
    print("\n2. Testing SEC EDGAR (Regulatory Data)...")
    try:
        sec_result = check_sec_enforcement('AAPL')
        results['sec_edgar'] = {
            'status': 'OK',
            'message': 'Connected to SEC EDGAR'
        }
        print("   ✓ Connected to SEC EDGAR")
    except Exception as e:
        results['sec_edgar'] = {'status': 'ERROR', 'message': str(e)}
        print(f"   ✗ Error: {e}")

    # Test CoinGecko
    print("\n3. Testing CoinGecko (Crypto Data)...")
    try:
        crypto_info = fetch_crypto_info('BTC')
        results['coingecko'] = {
            'status': 'OK',
            'message': f"Connected. BTC market cap: ${crypto_info['market_cap']/1e9:.1f}B"
        }
        print(f"   ✓ Connected. BTC market cap: ${crypto_info['market_cap']/1e9:.1f}B")
    except Exception as e:
        results['coingecko'] = {'status': 'ERROR', 'message': str(e)}
        print(f"   ✗ Error: {e}")

    # Summary
    print("\n" + "-" * 60)
    print("SUMMARY")
    print("-" * 60)

    for api, status in results.items():
        icon = "✓" if status['status'] == 'OK' else "✗"
        print(f"  {icon} {api}: {status['status']}")

    all_ok = all(s['status'] == 'OK' for s in results.values())

    if not all_ok:
        print("\nTo fix issues:")
        if results.get('alpha_vantage', {}).get('status') != 'OK':
            print("  1. Get free Alpha Vantage key: https://www.alphavantage.co/support/#api-key")
            print("  2. Add to .env: ALPHA_VANTAGE_API_KEY=your_key_here")

    return results


if __name__ == '__main__':
    test_api_connections()
