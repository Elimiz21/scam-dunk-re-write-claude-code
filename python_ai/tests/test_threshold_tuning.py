"""
Tests for OTC-tiered threshold configuration.
Verifies that get_thresholds() returns the correct tier
based on stock context (OTC, watchlist, major exchange).
"""

import pytest
import pandas as pd
import sys
sys.path.insert(0, '.')
from config import (
    get_thresholds,
    OTC_THRESHOLDS,
    MAJOR_EXCHANGE_THRESHOLDS,
    WATCHLIST_THRESHOLDS,
    ANOMALY_CONFIG,
)
from feature_engineering import compute_surge_metrics


class TestOTCThresholdsMoreAggressive:
    """OTC thresholds must be lower (more aggressive) than major exchange thresholds."""

    def test_otc_thresholds_more_aggressive(self):
        otc = get_thresholds(is_otc=True)
        major = get_thresholds(is_otc=False)

        assert otc["price_surge_7d_threshold"] < major["price_surge_7d_threshold"], (
            "OTC 7d price surge threshold should be more aggressive than major exchange"
        )
        assert otc["price_surge_3d_threshold"] < major["price_surge_3d_threshold"], (
            "OTC 3d price surge threshold should be more aggressive than major exchange"
        )
        assert otc["volume_surge_moderate"] < major["volume_surge_moderate"], (
            "OTC volume surge threshold should be more aggressive than major exchange"
        )
        assert otc["z_score_threshold"] < major["z_score_threshold"], (
            "OTC z-score threshold should be more aggressive than major exchange"
        )


class TestWatchlistThresholdsMostAggressive:
    """Watchlist thresholds must be the most aggressive (lowest)."""

    def test_watchlist_thresholds_most_aggressive(self):
        watchlist = get_thresholds(is_otc=True, on_watchlist=True)
        otc = get_thresholds(is_otc=True, on_watchlist=False)

        assert watchlist["price_surge_7d_threshold"] < otc["price_surge_7d_threshold"], (
            "Watchlist 7d price threshold should be more aggressive than OTC"
        )
        assert watchlist["price_surge_3d_threshold"] < otc["price_surge_3d_threshold"], (
            "Watchlist 3d price threshold should be more aggressive than OTC"
        )
        assert watchlist["volume_surge_moderate"] < otc["volume_surge_moderate"], (
            "Watchlist volume threshold should be more aggressive than OTC"
        )
        assert watchlist["z_score_threshold"] < otc["z_score_threshold"], (
            "Watchlist z-score threshold should be more aggressive than OTC"
        )


class TestMajorExchangePreservesExistingValues:
    """Major exchange thresholds must match the original ANOMALY_CONFIG values."""

    def test_major_exchange_preserves_existing_values(self):
        major = get_thresholds(is_otc=False)

        assert major["price_surge_7d_threshold"] == 0.25, (
            "Major exchange 7d price surge should be 0.25 (original value)"
        )
        assert major["volume_surge_moderate"] == 3.0, (
            "Major exchange moderate volume surge should be 3.0 (original value)"
        )
        assert major["z_score_threshold"] == 2.5, (
            "Major exchange z-score threshold should be 2.5 (original value)"
        )


class TestOTCSpecificValues:
    """OTC thresholds must have the exact specified values."""

    def test_otc_specific_values(self):
        otc = get_thresholds(is_otc=True)

        assert otc["price_surge_7d_threshold"] == 0.10, (
            "OTC 7d price surge threshold should be 0.10"
        )
        assert otc["volume_surge_moderate"] == 2.0, (
            "OTC moderate volume surge threshold should be 2.0"
        )
        assert otc["z_score_threshold"] == 1.8, (
            "OTC z-score threshold should be 1.8"
        )


class TestAllTiersHave3dThresholds:
    """All threshold tiers must include 3-day price and volume surge fields."""

    @pytest.mark.parametrize(
        "is_otc,on_watchlist",
        [
            (False, False),   # major exchange
            (True, False),    # OTC
            (True, True),     # watchlist
            (False, True),    # watchlist (non-OTC stock on watchlist)
        ],
    )
    def test_all_tiers_have_3d_thresholds(self, is_otc, on_watchlist):
        thresholds = get_thresholds(is_otc=is_otc, on_watchlist=on_watchlist)

        assert "price_surge_3d_threshold" in thresholds, (
            f"Tier (is_otc={is_otc}, on_watchlist={on_watchlist}) missing price_surge_3d_threshold"
        )
        assert "volume_surge_3d" in thresholds, (
            f"Tier (is_otc={is_otc}, on_watchlist={on_watchlist}) missing volume_surge_3d"
        )


class TestWatchlistOverridesOTC:
    """on_watchlist=True should return WATCHLIST_THRESHOLDS even for non-OTC stocks."""

    def test_watchlist_overrides_otc(self):
        non_otc_watchlist = get_thresholds(is_otc=False, on_watchlist=True)
        otc_watchlist = get_thresholds(is_otc=True, on_watchlist=True)

        # Both should return the same watchlist-tier values
        assert non_otc_watchlist["price_surge_7d_threshold"] == otc_watchlist["price_surge_7d_threshold"], (
            "Watchlist tier should be identical regardless of OTC status"
        )
        assert non_otc_watchlist["z_score_threshold"] == otc_watchlist["z_score_threshold"], (
            "Watchlist z-score threshold should be identical regardless of OTC status"
        )
        # Watchlist threshold should differ from major exchange
        major = get_thresholds(is_otc=False, on_watchlist=False)
        assert non_otc_watchlist["price_surge_7d_threshold"] < major["price_surge_7d_threshold"], (
            "Non-OTC on watchlist should still use more aggressive thresholds than major exchange"
        )


# ---------------------------------------------------------------------------
# Task 3: 3-day feature and acceleration tests
# ---------------------------------------------------------------------------

def test_3d_price_change_computed(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Price_Change_3d' in result.columns
    assert result['Price_Change_3d'].iloc[-1] > 0.05


def test_3d_volume_surge_computed(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Volume_Surge_3d' in result.columns
    assert result['Volume_Surge_3d'].iloc[-1] > 1.5


def test_price_acceleration_detected(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Price_Acceleration' in result.columns


def test_volume_acceleration_detected(pump_price_data):
    result = compute_surge_metrics(pump_price_data)
    assert 'Volume_Acceleration' in result.columns


def test_normal_data_no_acceleration(sample_price_data):
    result = compute_surge_metrics(sample_price_data)
    assert result['Price_Acceleration'].sum() < 5
