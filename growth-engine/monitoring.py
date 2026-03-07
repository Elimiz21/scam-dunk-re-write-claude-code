"""
Monitoring Agent: Tracks engagement on posted replies and alerts
when posts gain traction or need follow-up.
"""

import re
from datetime import datetime, timezone

import httpx

from config import settings
from db import get_posted_drafts, insert_engagement


async def check_reddit_engagement(post_url: str) -> dict | None:
    """Check engagement metrics for a Reddit post."""
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
            return {
                "upvotes": post_data.get("ups", 0),
                "downvotes": post_data.get("downs", 0),
                "comments": post_data.get("num_comments", 0),
            }
    except Exception as e:
        print(f"[Monitoring] Reddit check error for {post_url}: {e}")
        return None


async def check_x_engagement_via_serper(post_url: str) -> dict | None:
    """Check X post engagement by searching for it via Serper."""
    if not settings.serper_api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Extract tweet ID for more targeted search
            match = re.search(r"/status/(\d+)", post_url)
            if not match:
                return None

            resp = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
                json={"q": f"site:x.com {post_url}", "num": 1},
            )
            resp.raise_for_status()
            data = resp.json()

            # Extract metrics from search snippet if available
            results = data.get("organic", [])
            if results:
                snippet = results[0].get("snippet", "")
                # Try to extract engagement numbers from snippet
                likes_match = re.search(r"(\d+)\s*(?:likes?|hearts?)", snippet, re.I)
                retweets_match = re.search(r"(\d+)\s*(?:retweets?|reposts?)", snippet, re.I)
                replies_match = re.search(r"(\d+)\s*(?:replies|comments?)", snippet, re.I)

                return {
                    "likes": int(likes_match.group(1)) if likes_match else None,
                    "retweets": int(retweets_match.group(1)) if retweets_match else None,
                    "replies": int(replies_match.group(1)) if replies_match else None,
                }
    except Exception as e:
        print(f"[Monitoring] X check error for {post_url}: {e}")

    return None


def determine_trending(metrics: dict, platform: str) -> bool:
    """Determine if a post is trending based on its metrics."""
    if platform == "reddit":
        upvotes = metrics.get("upvotes", 0) or 0
        comments = metrics.get("comments", 0) or 0
        return upvotes >= 20 or comments >= 10
    elif platform == "x":
        likes = metrics.get("likes", 0) or 0
        retweets = metrics.get("retweets", 0) or 0
        return likes >= 10 or retweets >= 5
    return False


def determine_follow_up(metrics: dict, platform: str) -> bool:
    """Determine if a post needs a follow-up reply."""
    if platform == "reddit":
        comments = metrics.get("comments", 0) or 0
        return comments >= 5  # Active discussion
    elif platform == "x":
        replies = metrics.get("replies", 0) or 0
        return replies >= 3
    return False


async def run_monitoring():
    """Check engagement on all posted replies."""
    print("[Monitoring] Starting monitoring run...")

    posted_drafts = get_posted_drafts()
    if not posted_drafts:
        print("[Monitoring] No posted drafts to monitor")
        return

    print(f"[Monitoring] Checking {len(posted_drafts)} posted drafts")

    checked = 0
    trending = 0

    for draft in posted_drafts:
        platform = draft.get("platform", "reddit")
        post_url = draft.get("postUrl", "")

        if not post_url:
            continue

        metrics = None
        if platform == "reddit":
            metrics = await check_reddit_engagement(post_url)
        elif platform == "x":
            metrics = await check_x_engagement_via_serper(post_url)

        if not metrics:
            continue

        is_trending = determine_trending(metrics, platform)
        needs_follow_up = determine_follow_up(metrics, platform)

        insert_engagement(
            draft_id=draft["id"],
            upvotes=metrics.get("upvotes"),
            downvotes=metrics.get("downvotes"),
            comments=metrics.get("comments"),
            likes=metrics.get("likes"),
            retweets=metrics.get("retweets"),
            replies=metrics.get("replies"),
            views=metrics.get("views"),
            is_trending=is_trending,
            needs_follow_up=needs_follow_up,
        )

        checked += 1
        if is_trending:
            trending += 1

    print(f"[Monitoring] Checked {checked} drafts, {trending} trending")
    return {"checked": checked, "trending": trending}
