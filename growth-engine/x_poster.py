"""
X (Twitter) Poster: Auto-posts approved replies to X using the X API v2.
Uses OAuth 1.0a User Context for posting on behalf of the user.
"""

import hashlib
import hmac
import time
import urllib.parse
import uuid
from typing import Optional

import httpx

from config import settings


def _generate_oauth_signature(
    method: str,
    url: str,
    params: dict,
    consumer_secret: str,
    token_secret: str,
) -> str:
    """Generate OAuth 1.0a signature."""
    sorted_params = sorted(params.items())
    param_string = "&".join(f"{k}={urllib.parse.quote(str(v), safe='')}" for k, v in sorted_params)

    base_string = "&".join([
        method.upper(),
        urllib.parse.quote(url, safe=""),
        urllib.parse.quote(param_string, safe=""),
    ])

    signing_key = f"{urllib.parse.quote(consumer_secret, safe='')}&{urllib.parse.quote(token_secret, safe='')}"
    signature = hmac.new(
        signing_key.encode(), base_string.encode(), hashlib.sha1
    ).digest()

    import base64
    return base64.b64encode(signature).decode()


def _build_oauth_header(method: str, url: str, body_params: dict = None) -> str:
    """Build the OAuth 1.0a Authorization header."""
    oauth_params = {
        "oauth_consumer_key": settings.x_api_key,
        "oauth_nonce": uuid.uuid4().hex,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": settings.x_access_token,
        "oauth_version": "1.0",
    }

    all_params = {**oauth_params}
    if body_params:
        all_params.update(body_params)

    signature = _generate_oauth_signature(
        method, url, all_params,
        settings.x_api_secret, settings.x_access_token_secret,
    )
    oauth_params["oauth_signature"] = signature

    auth_header = "OAuth " + ", ".join(
        f'{k}="{urllib.parse.quote(str(v), safe="")}"'
        for k, v in sorted(oauth_params.items())
    )
    return auth_header


async def post_tweet(text: str, reply_to_tweet_id: Optional[str] = None) -> Optional[dict]:
    """
    Post a tweet using X API v2.
    If reply_to_tweet_id is provided, posts as a reply to that tweet.
    Returns the tweet data on success, None on failure.
    """
    if not all([settings.x_api_key, settings.x_api_secret,
                settings.x_access_token, settings.x_access_token_secret]):
        print("[X Poster] X API credentials not configured")
        return None

    url = "https://api.x.com/2/tweets"

    payload = {"text": text}
    if reply_to_tweet_id:
        payload["reply"] = {"in_reply_to_tweet_id": reply_to_tweet_id}

    auth_header = _build_oauth_header("POST", url)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if resp.status_code == 201:
                data = resp.json()
                tweet_data = data.get("data", {})
                print(f"[X Poster] Tweet posted: {tweet_data.get('id')}")
                return tweet_data
            else:
                print(f"[X Poster] Failed to post tweet: {resp.status_code} - {resp.text}")
                return None

    except Exception as e:
        print(f"[X Poster] Error posting tweet: {e}")
        return None


def extract_tweet_id_from_url(url: str) -> Optional[str]:
    """Extract the tweet ID from an X/Twitter URL."""
    import re
    match = re.search(r"/status/(\d+)", url)
    return match.group(1) if match else None
