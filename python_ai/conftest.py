"""
Shared pytest fixtures for the Scam Detection System test suite.
"""

import pytest
import pandas as pd
import numpy as np
from datetime import date, timedelta


@pytest.fixture
def sample_price_data():
    """30 days of normal stock price data (DataFrame with Date index, OHLCV columns)."""
    np.random.seed(42)
    n_days = 30
    dates = pd.date_range(start="2024-01-01", periods=n_days, freq="B")

    base_price = 10.0
    prices = [base_price]
    for _ in range(n_days - 1):
        change = np.random.normal(0, 0.01)  # 1% daily std dev, no trend
        prices.append(prices[-1] * (1 + change))

    prices = np.array(prices)
    opens = prices * np.random.uniform(0.99, 1.01, n_days)
    highs = prices * np.random.uniform(1.00, 1.02, n_days)
    lows = prices * np.random.uniform(0.98, 1.00, n_days)
    volumes = np.random.randint(80_000, 120_000, n_days).astype(float)

    df = pd.DataFrame(
        {
            "Open": opens,
            "High": highs,
            "Low": lows,
            "Close": prices,
            "Volume": volumes,
        },
        index=dates,
    )
    df.index.name = "Date"
    return df


@pytest.fixture
def pump_price_data():
    """
    30 days with a 3-day pump pattern starting at day 25.
    Days 25-27: accelerating gains + volume surge.
    """
    np.random.seed(7)
    n_days = 30
    dates = pd.date_range(start="2024-01-01", periods=n_days, freq="B")

    base_price = 2.50
    prices = [base_price]
    volumes = []

    for i in range(n_days - 1):
        if 24 <= i <= 26:  # pump days (0-indexed: days 25-27)
            day_in_pump = i - 24  # 0, 1, 2
            surge = 0.12 + day_in_pump * 0.05  # 12%, 17%, 22% gains
            prices.append(prices[-1] * (1 + surge))
            volumes.append(500_000 * (2 + day_in_pump))  # 2x, 3x, 4x volume
        else:
            change = np.random.normal(0, 0.015)
            prices.append(prices[-1] * (1 + change))
            volumes.append(float(np.random.randint(80_000, 120_000)))

    # Append one more volume entry to match n_days
    volumes.append(float(np.random.randint(80_000, 120_000)))

    prices = np.array(prices)
    volumes = np.array(volumes)
    opens = prices * np.random.uniform(0.99, 1.01, n_days)
    highs = prices * np.random.uniform(1.00, 1.03, n_days)
    lows = prices * np.random.uniform(0.97, 1.00, n_days)

    df = pd.DataFrame(
        {
            "Open": opens,
            "High": highs,
            "Low": lows,
            "Close": prices,
            "Volume": volumes,
        },
        index=dates,
    )
    df.index.name = "Date"
    return df


@pytest.fixture
def otc_fundamentals():
    """Fundamentals dict for a typical OTC/penny stock."""
    return {
        "market_cap": 25_000_000,
        "exchange": "OTC",
        "price": 2.50,
        "avg_volume": 100_000,
    }


@pytest.fixture
def major_exchange_fundamentals():
    """Fundamentals dict for a typical major-exchange stock."""
    return {
        "market_cap": 500_000_000,
        "exchange": "NASDAQ",
        "price": 45.00,
        "avg_volume": 2_000_000,
    }
