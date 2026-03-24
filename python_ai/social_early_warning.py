"""
Social Early Warning Module for ScamDunk

Monitors social media mention velocity and detects coordinated promotion activity
across Reddit (via ApeWisdom) and StockTwits.
"""

import time
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Any

import requests

logger = logging.getLogger(__name__)


@dataclass
class WatchlistSignal:
    code: str
    category: str
    description: str
    weight: int


def compute_mention_velocity(mention_data: Dict) -> Dict:
    """
    Compute mention velocity and author diversity ratio for a ticker.

    Args:
        mention_data: {ticker, mention_count_24h, mention_baseline_7d, unique_authors, total_mentions}

    Returns:
        {ticker, mention_velocity, mention_count_24h, unique_authors_ratio}
    """
    mention_count_24h = mention_data['mention_count_24h']
    mention_baseline_7d = mention_data['mention_baseline_7d']
    unique_authors = mention_data['unique_authors']
    total_mentions = mention_data['total_mentions']

    mention_velocity = mention_count_24h / max(mention_baseline_7d, 1)
    unique_authors_ratio = unique_authors / max(total_mentions, 1)

    return {
        'ticker': mention_data['ticker'],
        'mention_velocity': mention_velocity,
        'mention_count_24h': mention_count_24h,
        'unique_authors_ratio': unique_authors_ratio,
    }


def evaluate_watchlist_criteria(velocity_data: Dict) -> Dict:
    """
    Evaluate whether a ticker meets watchlist criteria based on social velocity signals.

    Args:
        velocity_data: {ticker, mention_velocity, mention_count_24h, unique_authors_ratio}

    Returns:
        {watchlist_recommended: bool, signals: List[WatchlistSignal]}
    """
    mention_velocity = velocity_data['mention_velocity']
    mention_count_24h = velocity_data['mention_count_24h']
    unique_authors_ratio = velocity_data['unique_authors_ratio']

    signals: List[WatchlistSignal] = []

    # SOCIAL_PROMOTION_DETECTED: velocity >= 3.0
    if mention_velocity >= 3.0:
        signals.append(WatchlistSignal(
            code='SOCIAL_PROMOTION_DETECTED',
            category='SOCIAL',
            description='Abnormal spike in social media mentions relative to baseline',
            weight=3,
        ))

    # MENTION_VELOCITY_SPIKE: velocity >= 5.0
    if mention_velocity >= 5.0:
        signals.append(WatchlistSignal(
            code='MENTION_VELOCITY_SPIKE',
            category='SOCIAL',
            description='Extreme mention velocity spike detected',
            weight=2,
        ))

    # COORDINATED_BOT_ACTIVITY: velocity >= 5.0 AND unique_authors_ratio < 0.3 AND mention_count_24h >= 10
    if mention_velocity >= 5.0 and unique_authors_ratio < 0.3 and mention_count_24h >= 10:
        signals.append(WatchlistSignal(
            code='COORDINATED_BOT_ACTIVITY',
            category='SOCIAL',
            description='Low author diversity with high mention velocity suggests coordinated bot activity',
            weight=3,
        ))

    watchlist_recommended = len(signals) > 0

    return {
        'watchlist_recommended': watchlist_recommended,
        'signals': signals,
    }


def fetch_apewisdom_mentions() -> Dict[str, Dict]:
    """
    Fetch Reddit mention data for all stocks from ApeWisdom.

    Returns:
        Dict mapping ticker -> mention data dict
    """
    url = 'https://apewisdom.io/api/v1.0/filter/all-stocks/'
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        results = data.get('results', [])

        mentions_by_ticker: Dict[str, Dict] = {}
        for item in results:
            ticker = item.get('ticker', '').upper()
            if ticker:
                mentions_by_ticker[ticker] = {
                    'ticker': ticker,
                    'mention_count_24h': item.get('mentions', 0),
                    'mention_baseline_7d': item.get('mentions_24h_ago', 1),
                    'unique_authors': item.get('upvotes', 0),
                    'total_mentions': item.get('mentions', 0),
                    'rank': item.get('rank', 0),
                }
        return mentions_by_ticker
    except Exception as e:
        logger.warning(f"Failed to fetch ApeWisdom mentions: {e}")
        return {}


def fetch_stocktwits_volume(ticker: str) -> Dict:
    """
    Fetch StockTwits volume data for a ticker.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dict with message_count, unique_authors, sentiment info
    """
    url = f'https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json'
    try:
        response = requests.get(url, timeout=10)
        text = response.text.strip()

        # Check for Cloudflare block
        if text.startswith('<'):
            logger.warning(f"StockTwits: Cloudflare block detected for {ticker}")
            return {'ticker': ticker, 'blocked': True, 'message_count': 0, 'unique_authors': 0}

        data = response.json()
        messages = data.get('messages', [])
        authors = {msg.get('user', {}).get('id') for msg in messages if msg.get('user')}

        # Extract sentiment counts
        bullish = sum(1 for m in messages if m.get('entities', {}).get('sentiment', {}) and
                      m['entities']['sentiment'].get('basic') == 'Bullish')
        bearish = sum(1 for m in messages if m.get('entities', {}).get('sentiment', {}) and
                      m['entities']['sentiment'].get('basic') == 'Bearish')

        return {
            'ticker': ticker,
            'blocked': False,
            'message_count': len(messages),
            'unique_authors': len(authors),
            'bullish_count': bullish,
            'bearish_count': bearish,
        }
    except Exception as e:
        logger.warning(f"Failed to fetch StockTwits data for {ticker}: {e}")
        return {'ticker': ticker, 'blocked': False, 'message_count': 0, 'unique_authors': 0}


def scan_social_early_warning(
    tickers: List[str],
    mention_baselines: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Batch scan tickers for social early warning signals.

    Args:
        tickers: List of ticker symbols to scan
        mention_baselines: Optional dict of ticker -> baseline mention count

    Returns:
        Dict of tickers that meet watchlist criteria, each with velocity + signals data
    """
    if mention_baselines is None:
        mention_baselines = {}

    # Bulk fetch Reddit mentions from ApeWisdom
    logger.info("Fetching ApeWisdom mentions...")
    ape_wisdom_data = fetch_apewisdom_mentions()

    watchlist: Dict[str, Any] = {}
    tickers_upper = [t.upper() for t in tickers]

    for ticker in tickers_upper:
        try:
            ape_data = ape_wisdom_data.get(ticker)

            # Build mention_data from available sources
            if ape_data:
                baseline = mention_baselines.get(ticker, ape_data.get('mention_baseline_7d', 1))
                mention_data = {
                    'ticker': ticker,
                    'mention_count_24h': ape_data['mention_count_24h'],
                    'mention_baseline_7d': baseline,
                    'unique_authors': ape_data['unique_authors'],
                    'total_mentions': ape_data['total_mentions'],
                }

                # Fetch StockTwits for tickers with Reddit activity
                if ape_data['mention_count_24h'] > 0:
                    st_data = fetch_stocktwits_volume(ticker)
                    time.sleep(2)

                    if not st_data.get('blocked') and st_data['message_count'] > 0:
                        # Augment with StockTwits unique authors if available
                        combined_mentions = mention_data['mention_count_24h'] + st_data['message_count']
                        combined_unique = mention_data['unique_authors'] + st_data['unique_authors']
                        mention_data['unique_authors'] = combined_unique
                        mention_data['total_mentions'] = combined_mentions
            else:
                # Ticker not found in ApeWisdom — use baseline or zero
                baseline = mention_baselines.get(ticker, 1)
                mention_data = {
                    'ticker': ticker,
                    'mention_count_24h': 0,
                    'mention_baseline_7d': baseline,
                    'unique_authors': 0,
                    'total_mentions': 0,
                }

            velocity = compute_mention_velocity(mention_data)
            evaluation = evaluate_watchlist_criteria(velocity)

            if evaluation['watchlist_recommended']:
                watchlist[ticker] = {
                    **velocity,
                    'signals': [
                        {
                            'code': s.code,
                            'category': s.category,
                            'description': s.description,
                            'weight': s.weight,
                        }
                        for s in evaluation['signals']
                    ],
                    'watchlist_recommended': True,
                }

        except Exception as e:
            logger.error(f"Error scanning {ticker}: {e}")
            continue

    logger.info(f"Social scan complete: {len(tickers_upper)} tickers scanned, {len(watchlist)} flagged")
    return watchlist
