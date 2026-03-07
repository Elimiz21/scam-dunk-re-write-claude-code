"""
Discovery Agent: Finds relevant posts on Reddit and X about stock scams,
investment fraud, and due diligence questions.

Uses Serper.dev (site:reddit.com) and Perplexity AI as primary Reddit discovery
methods — far more reliable than Reddit's public JSON API.
"""

import re
from datetime import datetime, timezone
from typing import Optional

import httpx

from config import settings
from db import insert_opportunity, get_growth_config, ensure_default_config


# ─── Serper.dev Discovery (Reddit) ──────────────────────────


async def discover_reddit_via_serper(
    search_terms: list[str],
    subreddits: list[str],
    max_results_per_query: int = 10,
) -> list[dict]:
    """
    Use Serper.dev Google Search API with site:reddit.com to find relevant posts.
    This is the most reliable Reddit discovery method — no API key issues,
    returns fresh results, and includes post metadata.
    """
    if not settings.serper_api_key:
        print("[Discovery] No SERPER_API_KEY set, skipping Serper discovery")
        return []

    results = []
    seen_urls = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for term in search_terms:
            # Build subreddit-scoped queries
            subreddit_filter = " OR ".join(f"site:reddit.com/r/{s}" for s in subreddits[:5])
            query = f'({subreddit_filter}) "{term}"'

            try:
                resp = await client.post(
                    "https://google.serper.dev/search",
                    headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
                    json={
                        "q": query,
                        "num": max_results_per_query,
                        "tbs": "qdr:w",  # last week
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                for item in data.get("organic", []):
                    url = item.get("link", "")
                    # Only Reddit post URLs (not comment permalinks)
                    if "reddit.com/r/" not in url:
                        continue
                    # Normalize URL
                    url = url.split("?")[0].rstrip("/")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    # Extract subreddit from URL
                    sub_match = re.search(r"reddit\.com/r/(\w+)", url)
                    subreddit = sub_match.group(1) if sub_match else "unknown"

                    results.append({
                        "platform": "reddit",
                        "source": subreddit,
                        "post_url": url,
                        "post_title": item.get("title", ""),
                        "post_body": item.get("snippet", ""),
                        "author": None,  # Serper doesn't return Reddit author
                        "post_date": None,
                        "engagement": None,
                        "discovered_via": "serper",
                        "search_query": term,
                    })

            except Exception as e:
                print(f"[Discovery] Serper error for '{term}': {e}")

    print(f"[Discovery] Serper found {len(results)} Reddit posts")
    return results


# ─── Perplexity AI Discovery (Reddit) ──────────────────────


async def discover_reddit_via_perplexity(
    search_terms: list[str],
    max_results: int = 15,
) -> list[dict]:
    """
    Use Perplexity AI's sonar model to find recent Reddit discussions about
    stock scams. Perplexity provides web-grounded answers with source citations,
    making it excellent for finding active discussions.
    """
    if not settings.perplexity_api_key:
        print("[Discovery] No PERPLEXITY_API_KEY set, skipping Perplexity discovery")
        return []

    results = []
    seen_urls = set()

    async with httpx.AsyncClient(timeout=60) as client:
        # Batch search terms into fewer queries for efficiency
        for i in range(0, len(search_terms), 3):
            batch = search_terms[i : i + 3]
            combined_query = (
                f"Find recent Reddit posts and threads from the past week where people are "
                f"asking about or discussing: {', '.join(batch)}. "
                f"Focus on posts in investing, stocks, scams, and personal finance subreddits. "
                f"Include the exact Reddit post URLs."
            )

            try:
                resp = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.perplexity_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "sonar",
                        "messages": [{"role": "user", "content": combined_query}],
                        "return_citations": True,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                # Extract citations (source URLs)
                citations = data.get("citations", [])
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

                for citation in citations:
                    url = citation if isinstance(citation, str) else citation.get("url", "")
                    if "reddit.com/r/" not in url:
                        continue
                    url = url.split("?")[0].rstrip("/")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    sub_match = re.search(r"reddit\.com/r/(\w+)", url)
                    subreddit = sub_match.group(1) if sub_match else "unknown"

                    results.append({
                        "platform": "reddit",
                        "source": subreddit,
                        "post_url": url,
                        "post_title": None,  # Will be enriched later
                        "post_body": None,
                        "author": None,
                        "post_date": None,
                        "engagement": None,
                        "discovered_via": "perplexity",
                        "search_query": ", ".join(batch),
                    })

            except Exception as e:
                print(f"[Discovery] Perplexity error: {e}")

    print(f"[Discovery] Perplexity found {len(results)} Reddit posts")
    return results


# ─── Reddit Public JSON Enrichment ──────────────────────────


async def enrich_reddit_post(post_url: str) -> Optional[dict]:
    """
    Fetch metadata for a Reddit post using the public .json endpoint.
    Used to enrich posts discovered via Serper/Perplexity with engagement data.
    """
    json_url = post_url.rstrip("/") + ".json"
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ScamDunk/1.0; Stock Research Tool)",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(json_url, headers=headers, follow_redirects=True)
            if resp.status_code != 200:
                return None

            text = resp.text
            if text.startswith("<"):
                return None

            data = resp.json()
            if not isinstance(data, list) or len(data) == 0:
                return None

            post_data = data[0].get("data", {}).get("children", [{}])[0].get("data", {})
            if not post_data:
                return None

            created_utc = post_data.get("created_utc")
            post_date = datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else None

            return {
                "post_title": post_data.get("title"),
                "post_body": post_data.get("selftext", "")[:2000],
                "author": post_data.get("author"),
                "post_date": post_date,
                "engagement": {
                    "upvotes": post_data.get("ups", 0),
                    "comments": post_data.get("num_comments", 0),
                    "upvote_ratio": post_data.get("upvote_ratio", 0),
                },
            }
    except Exception as e:
        print(f"[Discovery] Reddit enrichment error for {post_url}: {e}")
        return None


# ─── X (Twitter) Discovery ──────────────────────────────────


async def discover_x_posts(
    search_terms: list[str],
    hashtags: list[str],
) -> list[dict]:
    """
    Discover relevant X posts using Serper.dev with site:x.com.
    This avoids X API limitations and provides reliable results.
    """
    if not settings.serper_api_key:
        print("[Discovery] No SERPER_API_KEY set, skipping X discovery")
        return []

    results = []
    seen_urls = set()

    # Combine search terms and hashtags
    all_queries = search_terms + [f'"{tag}"' for tag in hashtags]

    async with httpx.AsyncClient(timeout=30) as client:
        for query in all_queries:
            try:
                resp = await client.post(
                    "https://google.serper.dev/search",
                    headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
                    json={
                        "q": f"site:x.com {query}",
                        "num": 10,
                        "tbs": "qdr:w",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                for item in data.get("organic", []):
                    url = item.get("link", "")
                    if "x.com/" not in url and "twitter.com/" not in url:
                        continue
                    url = url.split("?")[0].rstrip("/")
                    # Normalize twitter.com to x.com
                    url = url.replace("twitter.com", "x.com")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    # Extract author from URL pattern x.com/username/status/id
                    author_match = re.search(r"x\.com/(\w+)/status", url)
                    author = author_match.group(1) if author_match else None

                    results.append({
                        "platform": "x",
                        "source": f"search:{query[:50]}",
                        "post_url": url,
                        "post_title": item.get("title", ""),
                        "post_body": item.get("snippet", ""),
                        "author": author,
                        "post_date": None,
                        "engagement": None,
                        "discovered_via": "serper",
                        "search_query": query,
                    })

            except Exception as e:
                print(f"[Discovery] Serper X error for '{query}': {e}")

    print(f"[Discovery] Serper found {len(results)} X posts")
    return results


# ─── Scoring ────────────────────────────────────────────────


URGENCY_KEYWORDS = [
    "just got scammed", "lost money", "is this a scam", "should i invest",
    "anyone know about", "is this legit", "warning", "urgent", "help",
    "red flag", "suspicious", "too good to be true",
]

RELEVANCE_KEYWORDS = [
    "scam", "fraud", "pump and dump", "due diligence", "penny stock",
    "otc", "investment", "trading", "stock", "broker", "sec",
    "finra", "red flag", "promotion", "guarantee", "insider",
]


def score_opportunity(post: dict) -> dict:
    """Score an opportunity based on relevance, engagement potential, and urgency."""
    title = (post.get("post_title") or "").lower()
    body = (post.get("post_body") or "").lower()
    text = f"{title} {body}"

    # Relevance score (keyword matching)
    relevance_hits = sum(1 for kw in RELEVANCE_KEYWORDS if kw in text)
    relevance_score = min(100, relevance_hits * 12)

    # Engagement score (based on existing engagement data)
    engagement = post.get("engagement") or {}
    upvotes = engagement.get("upvotes", 0)
    comments = engagement.get("comments", 0)
    engagement_score = min(100, (upvotes * 2 + comments * 5))

    # Urgency score (time-sensitive keywords + recency)
    urgency_hits = sum(1 for kw in URGENCY_KEYWORDS if kw in text)
    urgency_score = min(100, urgency_hits * 15)

    # Question marks indicate someone asking for help
    if "?" in title:
        urgency_score = min(100, urgency_score + 20)
        relevance_score = min(100, relevance_score + 10)

    # Overall composite
    overall_score = int(relevance_score * 0.4 + engagement_score * 0.3 + urgency_score * 0.3)

    return {
        "relevance_score": relevance_score,
        "engagement_score": engagement_score,
        "urgency_score": urgency_score,
        "overall_score": overall_score,
    }


# ─── Main Discovery Pipeline ───────────────────────────────


async def run_discovery():
    """Run the full discovery pipeline across Reddit and X."""
    print("[Discovery] Starting discovery run...")

    config = ensure_default_config()
    if not config:
        print("[Discovery] No config found, aborting")
        return

    if not config.get("discoveryEnabled", True):
        print("[Discovery] Discovery disabled in config")
        return

    subreddits = config.get("redditSubreddits", [])
    reddit_terms = config.get("redditSearchTerms", [])
    x_terms = config.get("xSearchTerms", [])
    x_hashtags = config.get("xHashtags", [])
    max_daily = config.get("maxDailyDiscoveries", 30)

    all_posts = []

    # Phase 1: Discover via Serper (Reddit)
    serper_reddit = await discover_reddit_via_serper(reddit_terms, subreddits)
    all_posts.extend(serper_reddit)

    # Phase 2: Discover via Perplexity (Reddit)
    perplexity_reddit = await discover_reddit_via_perplexity(reddit_terms)
    all_posts.extend(perplexity_reddit)

    # Phase 3: Discover X posts via Serper
    x_posts = await discover_x_posts(x_terms, x_hashtags)
    all_posts.extend(x_posts)

    # Deduplicate by URL
    seen = set()
    unique_posts = []
    for post in all_posts:
        url = post["post_url"]
        if url not in seen:
            seen.add(url)
            unique_posts.append(post)

    print(f"[Discovery] {len(unique_posts)} unique posts after dedup")

    # Phase 4: Enrich Reddit posts with metadata
    for post in unique_posts:
        if post["platform"] == "reddit" and not post.get("engagement"):
            enrichment = await enrich_reddit_post(post["post_url"])
            if enrichment:
                post.update(enrichment)

    # Phase 5: Score and rank
    for post in unique_posts:
        scores = score_opportunity(post)
        post.update(scores)

    # Sort by overall score
    unique_posts.sort(key=lambda p: p["overall_score"], reverse=True)

    # Phase 6: Store top results
    stored = 0
    for post in unique_posts[:max_daily]:
        opp_id = insert_opportunity(
            platform=post["platform"],
            source=post["source"],
            post_url=post["post_url"],
            post_title=post.get("post_title"),
            post_body=post.get("post_body"),
            author=post.get("author"),
            post_date=post.get("post_date"),
            engagement=post.get("engagement"),
            discovered_via=post["discovered_via"],
            search_query=post.get("search_query"),
            relevance_score=post["relevance_score"],
            engagement_score=post["engagement_score"],
            urgency_score=post["urgency_score"],
            overall_score=post["overall_score"],
        )
        if opp_id:
            stored += 1

    print(f"[Discovery] Stored {stored} new opportunities")
    return stored
