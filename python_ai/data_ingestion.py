"""
Data Ingestion Module for Scam Detection System.

This module handles:
- Loading historical price and volume data for stocks and cryptocurrencies
- Fetching SEC regulatory alert data (simulated)
- Data preprocessing and cleaning
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Union
import warnings

from config import (
    SEC_FLAGGED_TICKERS,
    SEC_LIST_LAST_UPDATE,
    OTC_EXCHANGES,
    MARKET_THRESHOLDS
)

warnings.filterwarnings('ignore')


class DataIngestionError(Exception):
    """Custom exception for data ingestion errors."""
    pass


def check_sec_flagged_list(ticker: str) -> Dict[str, Union[bool, str]]:
    """
    Check if a ticker appears on the SEC flagged/suspended list.

    In production, this would:
    - Fetch from SEC EDGAR API
    - Check SEC trading suspension list
    - Query regulatory databases

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dictionary with:
        - is_flagged: Boolean indicating if ticker is on SEC list
        - reason: Description if flagged
        - last_updated: Timestamp of last list update
    """
    ticker_upper = ticker.upper()
    is_flagged = ticker_upper in SEC_FLAGGED_TICKERS

    result = {
        'is_flagged': is_flagged,
        'reason': 'Ticker appears on SEC trading suspension/alert list' if is_flagged else None,
        'last_updated': SEC_LIST_LAST_UPDATE,
        'source': 'SEC EDGAR (simulated)'
    }

    return result


def generate_synthetic_stock_data(
    ticker: str,
    days: int = 90,
    start_price: float = 10.0,
    volatility: float = 0.02,
    base_volume: int = 100000,
    include_pump: bool = False,
    pump_start_day: Optional[int] = None,
    pump_duration: int = 7,
    pump_magnitude: float = 1.5
) -> pd.DataFrame:
    """
    Generate synthetic stock data for testing and demonstration.

    Args:
        ticker: Stock ticker symbol
        days: Number of days of data to generate
        start_price: Initial stock price
        volatility: Daily volatility (std dev of returns)
        base_volume: Average daily trading volume
        include_pump: Whether to include a pump-and-dump pattern
        pump_start_day: Day when pump begins (0-indexed)
        pump_duration: Duration of pump in days
        pump_magnitude: Multiplier for pump (1.5 = 50% increase)

    Returns:
        DataFrame with columns: Date, Open, High, Low, Close, Volume, Ticker
    """
    np.random.seed(hash(ticker) % 2**32)  # Reproducible per ticker

    dates = pd.date_range(
        end=datetime.now().date(),
        periods=days,
        freq='D'
    )

    # Generate random returns
    returns = np.random.normal(0.0005, volatility, days)

    # Apply pump-and-dump if specified
    if include_pump:
        pump_start = pump_start_day if pump_start_day else days - pump_duration - 5

        # Pump phase: strong positive returns
        for i in range(pump_duration):
            if pump_start + i < days:
                returns[pump_start + i] = np.random.uniform(0.05, 0.15)

        # Dump phase: sharp decline
        for i in range(3):  # 3 days of dumping
            if pump_start + pump_duration + i < days:
                returns[pump_start + pump_duration + i] = np.random.uniform(-0.15, -0.08)

    # Calculate prices from returns
    prices = start_price * np.cumprod(1 + returns)

    # Generate OHLC data
    opens = prices * (1 + np.random.normal(0, 0.005, days))
    closes = prices
    highs = np.maximum(opens, closes) * (1 + np.abs(np.random.normal(0, 0.01, days)))
    lows = np.minimum(opens, closes) * (1 - np.abs(np.random.normal(0, 0.01, days)))

    # Generate volume with variability
    volume_multiplier = np.random.lognormal(0, 0.5, days)

    # Increase volume during pump
    if include_pump:
        pump_start = pump_start_day if pump_start_day else days - pump_duration - 5
        for i in range(pump_duration + 3):
            if pump_start + i < days:
                volume_multiplier[pump_start + i] *= np.random.uniform(5, 15)

    volumes = (base_volume * volume_multiplier).astype(int)

    df = pd.DataFrame({
        'Date': dates,
        'Open': opens,
        'High': highs,
        'Low': lows,
        'Close': closes,
        'Volume': volumes,
        'Ticker': ticker
    })

    return df


def generate_synthetic_crypto_data(
    symbol: str,
    minutes: int = 1440 * 30,  # 30 days of minute data
    start_price: float = 100.0,
    volatility: float = 0.001,
    base_volume: float = 1000.0,
    include_pump: bool = False
) -> pd.DataFrame:
    """
    Generate synthetic cryptocurrency data at minute intervals.

    Args:
        symbol: Crypto symbol (e.g., 'BTC', 'ETH')
        minutes: Number of minutes of data
        start_price: Initial price
        volatility: Per-minute volatility
        base_volume: Base volume per minute
        include_pump: Whether to include pump-and-dump pattern

    Returns:
        DataFrame with minute-level OHLCV data
    """
    np.random.seed(hash(symbol) % 2**32)

    dates = pd.date_range(
        end=datetime.now(),
        periods=minutes,
        freq='min'
    )

    returns = np.random.normal(0, volatility, minutes)

    if include_pump:
        # Pump in last 1440 minutes (24 hours)
        pump_start = minutes - 1440
        for i in range(720):  # 12 hours of pump
            if pump_start + i < minutes:
                returns[pump_start + i] = np.random.uniform(0.001, 0.005)
        for i in range(360):  # 6 hours of dump
            if pump_start + 720 + i < minutes:
                returns[pump_start + 720 + i] = np.random.uniform(-0.005, -0.002)

    prices = start_price * np.cumprod(1 + returns)

    df = pd.DataFrame({
        'Timestamp': dates,
        'Open': prices * (1 + np.random.normal(0, 0.0005, minutes)),
        'High': prices * (1 + np.abs(np.random.normal(0, 0.001, minutes))),
        'Low': prices * (1 - np.abs(np.random.normal(0, 0.001, minutes))),
        'Close': prices,
        'Volume': base_volume * np.random.lognormal(0, 0.5, minutes),
        'Symbol': symbol
    })

    return df


def load_stock_data(
    ticker: str,
    days: int = 90,
    use_synthetic: bool = True,
    synthetic_params: Optional[Dict] = None
) -> pd.DataFrame:
    """
    Load stock data for analysis.

    In production, this would connect to:
    - Alpha Vantage API
    - Yahoo Finance API
    - Other market data providers

    Args:
        ticker: Stock ticker symbol
        days: Number of days of history
        use_synthetic: If True, generate synthetic data
        synthetic_params: Parameters for synthetic data generation

    Returns:
        DataFrame with OHLCV data
    """
    if use_synthetic:
        params = synthetic_params or {}
        return generate_synthetic_stock_data(ticker, days=days, **params)

    # Placeholder for real API integration
    raise NotImplementedError(
        "Real market data API integration not yet implemented. "
        "Use use_synthetic=True for demonstration."
    )


def load_crypto_data(
    symbol: str,
    minutes: int = 43200,  # 30 days
    use_synthetic: bool = True,
    synthetic_params: Optional[Dict] = None
) -> pd.DataFrame:
    """
    Load cryptocurrency data for analysis.

    In production, this would connect to:
    - Binance API
    - CoinGecko API
    - Other crypto data providers

    Args:
        symbol: Cryptocurrency symbol
        minutes: Number of minutes of history
        use_synthetic: If True, generate synthetic data
        synthetic_params: Parameters for synthetic data generation

    Returns:
        DataFrame with minute-level OHLCV data
    """
    if use_synthetic:
        params = synthetic_params or {}
        return generate_synthetic_crypto_data(symbol, minutes=minutes, **params)

    raise NotImplementedError(
        "Real crypto data API integration not yet implemented. "
        "Use use_synthetic=True for demonstration."
    )


def get_stock_fundamentals(
    ticker: str,
    use_synthetic: bool = True,
    is_scam_scenario: bool = False
) -> Dict[str, Union[float, str, bool]]:
    """
    Get fundamental data for a stock.

    Args:
        ticker: Stock ticker symbol
        use_synthetic: If True, generate synthetic fundamentals
        is_scam_scenario: If True, generate scam-like fundamentals

    Returns:
        Dictionary with fundamental data
    """
    if use_synthetic:
        np.random.seed(hash(ticker) % 2**32)

        if is_scam_scenario:
            # Low market cap, low float, OTC characteristics
            market_cap = np.random.uniform(1_000_000, 50_000_000)
            float_shares = np.random.uniform(1_000_000, 10_000_000)
            avg_volume = np.random.uniform(10_000, 100_000)
            exchange = np.random.choice(['OTC', 'PINK', 'OTCBB'])
        else:
            # Normal company characteristics
            market_cap = np.random.uniform(500_000_000, 50_000_000_000)
            float_shares = np.random.uniform(50_000_000, 500_000_000)
            avg_volume = np.random.uniform(500_000, 10_000_000)
            exchange = np.random.choice(['NYSE', 'NASDAQ', 'AMEX'])

        return {
            'ticker': ticker,
            'market_cap': market_cap,
            'float_shares': float_shares,
            'shares_outstanding': float_shares * np.random.uniform(1.1, 1.5),
            'avg_daily_volume': avg_volume,
            'exchange': exchange,
            'sector': 'Technology',
            'industry': 'Software',
            'is_otc': exchange in OTC_EXCHANGES,
        }

    raise NotImplementedError("Real fundamentals API not yet implemented.")


def get_crypto_metrics(
    symbol: str,
    use_synthetic: bool = True
) -> Dict[str, Union[float, str, int]]:
    """
    Get on-chain and market metrics for cryptocurrency.

    In production, this would fetch:
    - On-chain transaction data
    - Wallet concentration metrics
    - Smart contract analysis

    Args:
        symbol: Cryptocurrency symbol
        use_synthetic: If True, generate synthetic metrics

    Returns:
        Dictionary with crypto metrics (placeholders for real on-chain data)
    """
    if use_synthetic:
        np.random.seed(hash(symbol) % 2**32)

        return {
            'symbol': symbol,
            'market_cap': np.random.uniform(1_000_000, 1_000_000_000),
            'circulating_supply': np.random.uniform(1_000_000, 1_000_000_000),
            'total_supply': np.random.uniform(1_000_000, 10_000_000_000),
            # Placeholder on-chain metrics
            'holder_count': int(np.random.uniform(100, 100_000)),
            'top_10_concentration': np.random.uniform(0.1, 0.9),  # % held by top 10
            'transaction_count_24h': int(np.random.uniform(100, 10_000)),
            'unique_addresses_24h': int(np.random.uniform(50, 5_000)),
            # Flags for potential issues
            'is_honeypot': False,  # Placeholder
            'has_mint_function': np.random.choice([True, False]),
            'liquidity_locked': np.random.choice([True, False]),
        }

    raise NotImplementedError("Real on-chain metrics API not yet implemented.")


def preprocess_price_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Preprocess price data: handle missing values, compute returns, etc.

    Args:
        df: Raw OHLCV DataFrame

    Returns:
        Preprocessed DataFrame with additional computed columns
    """
    df = df.copy()

    # Ensure datetime index
    date_col = 'Date' if 'Date' in df.columns else 'Timestamp'
    df[date_col] = pd.to_datetime(df[date_col])
    df = df.sort_values(date_col).reset_index(drop=True)

    # Handle missing values
    df['Open'] = df['Open'].ffill()
    df['High'] = df['High'].ffill()
    df['Low'] = df['Low'].ffill()
    df['Close'] = df['Close'].ffill()
    df['Volume'] = df['Volume'].fillna(0)

    # Compute returns
    df['Return'] = df['Close'].pct_change()
    df['Log_Return'] = np.log(df['Close'] / df['Close'].shift(1))

    # Compute rolling returns
    df['Return_7d'] = df['Close'].pct_change(periods=7)
    df['Return_30d'] = df['Close'].pct_change(periods=30)

    # Compute dollar volume
    df['Dollar_Volume'] = df['Close'] * df['Volume']

    # Fill any remaining NaN values
    df = df.fillna(0)

    return df


def create_asset_context(
    ticker_or_symbol: str,
    asset_type: str = 'stock',
    use_synthetic: bool = True,
    is_scam_scenario: bool = False,
    news_flag: bool = False
) -> Dict:
    """
    Create complete context for an asset including all relevant data.

    Args:
        ticker_or_symbol: Ticker symbol
        asset_type: 'stock' or 'crypto'
        use_synthetic: Use synthetic data
        is_scam_scenario: Generate scam-like data
        news_flag: Whether there's relevant news (placeholder)

    Returns:
        Dictionary with all asset context
    """
    sec_check = check_sec_flagged_list(ticker_or_symbol)

    if asset_type == 'stock':
        fundamentals = get_stock_fundamentals(
            ticker_or_symbol,
            use_synthetic=use_synthetic,
            is_scam_scenario=is_scam_scenario
        )
        price_data = load_stock_data(
            ticker_or_symbol,
            use_synthetic=use_synthetic,
            synthetic_params={'include_pump': is_scam_scenario}
        )
    else:
        fundamentals = get_crypto_metrics(ticker_or_symbol, use_synthetic=use_synthetic)
        price_data = load_crypto_data(
            ticker_or_symbol,
            use_synthetic=use_synthetic,
            synthetic_params={'include_pump': is_scam_scenario}
        )

    # Preprocess price data
    price_data = preprocess_price_data(price_data)

    return {
        'ticker': ticker_or_symbol,
        'asset_type': asset_type,
        'price_data': price_data,
        'fundamentals': fundamentals,
        'sec_flagged': sec_check,
        'news_flag': news_flag,  # Placeholder for news API integration
        'sentiment_score': None,  # Placeholder for sentiment analysis
        'created_at': datetime.now().isoformat()
    }


def create_live_asset_context(
    ticker_or_symbol: str,
    asset_type: str = 'auto',
    days: int = 90,
    news_flag: bool = False
) -> Dict:
    """
    Create asset context using LIVE API data.

    Requires API keys configured in .env file.

    Args:
        ticker_or_symbol: Ticker symbol
        asset_type: 'stock', 'crypto', or 'auto'
        days: Number of days of history
        news_flag: Whether there's relevant news

    Returns:
        Dictionary with all asset context from live APIs
    """
    try:
        from live_data import fetch_live_data, check_sec_enforcement
    except ImportError:
        raise DataIngestionError(
            "live_data module not available. Use create_asset_context() with synthetic data."
        )

    # Fetch live data
    price_data, fundamentals, sec_status = fetch_live_data(
        ticker_or_symbol,
        asset_type=asset_type,
        days=days
    )

    # Preprocess price data
    price_data = preprocess_price_data(price_data)

    # Also check against our static SEC flagged list
    static_sec_check = check_sec_flagged_list(ticker_or_symbol)

    # Combine SEC status (flagged if either source flags it)
    sec_flagged = {
        'is_flagged': sec_status.get('is_flagged', False) or static_sec_check['is_flagged'],
        'reason': sec_status.get('reason') or static_sec_check.get('reason'),
        'source': f"{sec_status.get('source', 'API')} + static list",
        'last_updated': datetime.now().isoformat()
    }

    return {
        'ticker': ticker_or_symbol,
        'asset_type': 'crypto' if asset_type == 'crypto' or ticker_or_symbol.upper() in ['BTC', 'ETH', 'SOL', 'DOGE', 'SHIB'] else 'stock',
        'price_data': price_data,
        'fundamentals': fundamentals,
        'sec_flagged': sec_flagged,
        'news_flag': news_flag,
        'sentiment_score': None,
        'created_at': datetime.now().isoformat(),
        'data_source': 'LIVE API'
    }


if __name__ == '__main__':
    # Test data ingestion functions
    print("=" * 60)
    print("Testing Data Ingestion Module")
    print("=" * 60)

    # Test SEC check
    print("\n1. Testing SEC Flagged List Check:")
    for ticker in ['AAPL', 'SCAM', 'PUMP', 'MSFT']:
        result = check_sec_flagged_list(ticker)
        status = "FLAGGED" if result['is_flagged'] else "CLEAR"
        print(f"   {ticker}: {status}")

    # Test synthetic stock data
    print("\n2. Testing Synthetic Stock Data Generation:")
    stock_data = generate_synthetic_stock_data('TEST', days=30)
    print(f"   Generated {len(stock_data)} days of data")
    print(f"   Price range: ${stock_data['Close'].min():.2f} - ${stock_data['Close'].max():.2f}")
    print(f"   Volume range: {stock_data['Volume'].min():,} - {stock_data['Volume'].max():,}")

    # Test pump-and-dump data
    print("\n3. Testing Pump-and-Dump Pattern Generation:")
    pump_data = generate_synthetic_stock_data('PUMP', days=30, include_pump=True)
    pump_data = preprocess_price_data(pump_data)
    print(f"   7-day return: {pump_data['Return_7d'].iloc[-1]*100:.1f}%")
    print(f"   Max daily volume: {pump_data['Volume'].max():,}")

    # Test fundamentals
    print("\n4. Testing Fundamentals:")
    normal_fund = get_stock_fundamentals('AAPL', is_scam_scenario=False)
    scam_fund = get_stock_fundamentals('SCAM', is_scam_scenario=True)
    print(f"   Normal: Market Cap ${normal_fund['market_cap']/1e9:.2f}B, Exchange: {normal_fund['exchange']}")
    print(f"   Scam-like: Market Cap ${scam_fund['market_cap']/1e6:.2f}M, Exchange: {scam_fund['exchange']}")

    # Test full context creation
    print("\n5. Testing Full Asset Context Creation:")
    context = create_asset_context('TEST', is_scam_scenario=True)
    print(f"   Ticker: {context['ticker']}")
    print(f"   SEC Flagged: {context['sec_flagged']['is_flagged']}")
    print(f"   Price Data Points: {len(context['price_data'])}")
    print(f"   Is OTC: {context['fundamentals']['is_otc']}")

    print("\n" + "=" * 60)
    print("Data Ingestion Module Tests Complete!")
    print("=" * 60)
