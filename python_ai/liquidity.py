"""Explicit volume units shared by rules and contextual features."""

import math
from numbers import Real
from typing import Optional


def known_nonnegative(value) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, Real):
        return None
    numeric = float(value)
    return numeric if math.isfinite(numeric) and numeric >= 0 else None


def average_dollar_volume(fundamentals: dict) -> Optional[float]:
    """Prefer observed dollar turnover; never compare shares to dollar limits.

    Older providers can supply shares and a price. Their product is an explicit
    estimate, while absent/invalid inputs remain unknown rather than zero.
    """
    dollars = known_nonnegative(fundamentals.get('avg_daily_dollar_volume'))
    if dollars is not None:
        return dollars
    shares = known_nonnegative(fundamentals.get('avg_daily_volume'))
    price = known_nonnegative(fundamentals.get('current_price'))
    if price is None:
        price = known_nonnegative(fundamentals.get('latest_price'))
    if shares is None or price is None or price <= 0:
        return None
    return known_nonnegative(shares * price)
