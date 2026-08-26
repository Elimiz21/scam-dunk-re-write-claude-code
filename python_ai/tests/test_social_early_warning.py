import pytest
import sys
sys.path.insert(0, '.')
from social_early_warning import compute_mention_velocity, evaluate_watchlist_criteria, WatchlistSignal

def test_velocity_spike_detected():
    mention_data = {
        'ticker': 'PUMP', 'mention_count_24h': 150,
        'mention_baseline_7d': 10, 'unique_authors': 8, 'total_mentions': 150,
    }
    velocity = compute_mention_velocity(mention_data)
    assert velocity['mention_velocity'] == 15.0
    assert velocity['unique_authors_ratio'] < 0.1

def test_normal_mentions_low_velocity():
    mention_data = {
        'ticker': 'NORMAL', 'mention_count_24h': 12,
        'mention_baseline_7d': 10, 'unique_authors': 10, 'total_mentions': 12,
    }
    velocity = compute_mention_velocity(mention_data)
    assert velocity['mention_velocity'] < 2.0

def test_watchlist_criteria_high_velocity():
    velocity_data = {'ticker': 'PUMP', 'mention_velocity': 5.0, 'mention_count_24h': 50, 'unique_authors_ratio': 0.5}
    result = evaluate_watchlist_criteria(velocity_data)
    assert result['watchlist_recommended'] is True
    assert 'SOCIAL_PROMOTION_DETECTED' in [s.code for s in result['signals']]

def test_coordinated_bot_activity():
    velocity_data = {'ticker': 'BOT', 'mention_velocity': 8.0, 'mention_count_24h': 80, 'unique_authors_ratio': 0.15}
    result = evaluate_watchlist_criteria(velocity_data)
    assert 'COORDINATED_BOT_ACTIVITY' in [s.code for s in result['signals']]

def test_low_count_no_bot_signal():
    velocity_data = {'ticker': 'LOW', 'mention_velocity': 6.0, 'mention_count_24h': 6, 'unique_authors_ratio': 0.2}
    result = evaluate_watchlist_criteria(velocity_data)
    assert 'COORDINATED_BOT_ACTIVITY' not in [s.code for s in result['signals']]

def test_below_threshold_no_watchlist():
    velocity_data = {'ticker': 'QUIET', 'mention_velocity': 1.5, 'mention_count_24h': 15, 'unique_authors_ratio': 0.8}
    result = evaluate_watchlist_criteria(velocity_data)
    assert result['watchlist_recommended'] is False
    assert len(result['signals']) == 0
