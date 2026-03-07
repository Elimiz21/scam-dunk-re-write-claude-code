"""Database access layer using psycopg2 directly (matches Prisma schema)."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras

from config import settings

# Register UUID adapter
psycopg2.extras.register_uuid()


def get_conn():
    return psycopg2.connect(settings.database_url)


def generate_id() -> str:
    """Generate a cuid-like ID (Prisma uses cuid by default)."""
    return str(uuid.uuid4()).replace("-", "")[:25]


# ─── Growth Opportunity CRUD ────────────────────────────────


def insert_opportunity(
    platform: str,
    source: str,
    post_url: str,
    post_title: Optional[str],
    post_body: Optional[str],
    author: Optional[str],
    post_date: Optional[datetime],
    engagement: Optional[dict],
    discovered_via: str,
    search_query: Optional[str],
    relevance_score: int,
    engagement_score: int,
    urgency_score: int,
    overall_score: int,
) -> Optional[str]:
    """Insert a new growth opportunity. Returns ID or None if URL already exists."""
    opp_id = generate_id()
    now = datetime.now(timezone.utc)

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO "GrowthOpportunity" (
                        id, platform, source, "postUrl", "postTitle", "postBody",
                        author, "postDate", engagement, "discoveredVia", "searchQuery",
                        "relevanceScore", "engagementScore", "urgencyScore", "overallScore",
                        status, "createdAt", "updatedAt"
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT ("postUrl") DO NOTHING
                    RETURNING id
                    """,
                    (
                        opp_id, platform, source, post_url, post_title, post_body,
                        author, post_date, json.dumps(engagement) if engagement else None,
                        discovered_via, search_query,
                        relevance_score, engagement_score, urgency_score, overall_score,
                        "discovered", now, now,
                    ),
                )
                result = cur.fetchone()
                conn.commit()
                return result[0] if result else None
    except Exception as e:
        print(f"[DB] Error inserting opportunity: {e}")
        return None


def get_opportunities_by_status(status: str, limit: int = 50) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT * FROM "GrowthOpportunity"
                WHERE status = %s
                ORDER BY "overallScore" DESC, "createdAt" DESC
                LIMIT %s
                """,
                (status, limit),
            )
            return [dict(row) for row in cur.fetchall()]


def update_opportunity_status(opp_id: str, status: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE "GrowthOpportunity"
                SET status = %s, "updatedAt" = %s
                WHERE id = %s
                """,
                (status, datetime.now(timezone.utc), opp_id),
            )
            conn.commit()


# ─── Growth Draft CRUD ──────────────────────────────────────


def insert_draft(
    opportunity_id: str,
    reply_text: str,
    includes_link: bool,
    variant: int = 1,
) -> str:
    draft_id = generate_id()
    now = datetime.now(timezone.utc)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "GrowthDraft" (
                    id, "opportunityId", "replyText", "includesLink",
                    variant, status, "createdAt", "updatedAt"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (draft_id, opportunity_id, reply_text, includes_link, variant, "pending", now, now),
            )
            conn.commit()
    return draft_id


def get_posted_drafts(limit: int = 100) -> list[dict]:
    """Get drafts that have been posted (for monitoring)."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT d.*, o."postUrl", o.platform, o.source
                FROM "GrowthDraft" d
                JOIN "GrowthOpportunity" o ON d."opportunityId" = o.id
                WHERE d.status = 'posted'
                ORDER BY d."postedAt" DESC
                LIMIT %s
                """,
                (limit,),
            )
            return [dict(row) for row in cur.fetchall()]


# ─── Growth Engagement CRUD ─────────────────────────────────


def insert_engagement(
    draft_id: str,
    upvotes: Optional[int] = None,
    downvotes: Optional[int] = None,
    comments: Optional[int] = None,
    likes: Optional[int] = None,
    retweets: Optional[int] = None,
    replies: Optional[int] = None,
    views: Optional[int] = None,
    is_trending: bool = False,
    needs_follow_up: bool = False,
) -> str:
    eng_id = generate_id()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "GrowthEngagement" (
                    id, "draftId", "checkedAt",
                    upvotes, downvotes, comments, likes, retweets, replies, views,
                    "isTrending", "needsFollowUp"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    eng_id, draft_id, datetime.now(timezone.utc),
                    upvotes, downvotes, comments, likes, retweets, replies, views,
                    is_trending, needs_follow_up,
                ),
            )
            conn.commit()
    return eng_id


# ─── Growth Config ──────────────────────────────────────────


def get_growth_config() -> Optional[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute('SELECT * FROM "GrowthConfig" WHERE id = %s', ("singleton",))
            row = cur.fetchone()
            return dict(row) if row else None


def ensure_default_config():
    """Create default config if it doesn't exist."""
    config = get_growth_config()
    if config:
        return config

    now = datetime.now(timezone.utc)
    default_subreddits = [
        "Scams", "stocks", "investing", "wallstreetbets", "pennystocks",
        "StockMarket", "personalfinance", "SecurityAnalysis", "InvestmentFraud",
        "pumpanddump",
    ]
    default_reddit_terms = [
        "is this a scam stock",
        "got scammed investing",
        "pump and dump",
        "stock due diligence",
        "how to check if stock is legit",
        "investment fraud",
        "penny stock scam",
        "stock promotion scam",
    ]
    default_x_terms = [
        "stock scam",
        "pump and dump stock",
        "is this stock legit",
        "investment scam warning",
        "got scammed trading",
    ]
    default_x_hashtags = [
        "#stockscam", "#pumpanddump", "#investmentfraud",
        "#scamalert", "#duediligence",
    ]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "GrowthConfig" (
                    id, "redditSubreddits", "redditSearchTerms",
                    "xSearchTerms", "xHashtags",
                    "discoveryIntervalHours", "monitoringIntervalHours",
                    "maxDailyDiscoveries", "maxDailyPosts",
                    "autoPostX", "discoveryEnabled", "draftingEnabled", "monitoringEnabled",
                    "updatedAt"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    "singleton", default_subreddits, default_reddit_terms,
                    default_x_terms, default_x_hashtags,
                    4, 12, 30, 10,
                    False, True, True, True, now,
                ),
            )
            conn.commit()

    return get_growth_config()


# ─── Voice Template ─────────────────────────────────────────


def get_active_voice_template() -> Optional[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                'SELECT * FROM "GrowthVoiceTemplate" WHERE "isActive" = true LIMIT 1'
            )
            row = cur.fetchone()
            return dict(row) if row else None


def ensure_default_voice_template():
    """Create default voice template if none exist."""
    template = get_active_voice_template()
    if template:
        return template

    template_id = generate_id()
    now = datetime.now(timezone.utc)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "GrowthVoiceTemplate" (
                    id, name, "isActive", tone, vocabulary, "avoidWords",
                    "exampleReplies", "linkFrequency", "linkStyle",
                    "createdAt", "updatedAt"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    template_id,
                    "default",
                    True,
                    (
                        "Helpful, knowledgeable, and empathetic. Like a friend who happens to "
                        "know a lot about investing and wants to help you avoid getting burned. "
                        "Never preachy or condescending. Use plain language, not jargon. "
                        "Share practical steps people can take right now."
                    ),
                    [
                        "due diligence", "red flags", "check the fundamentals",
                        "be careful", "here's what I'd look at", "in my experience",
                        "worth investigating", "protect yourself",
                    ],
                    [
                        "guaranteed", "definitely a scam", "trust me", "buy now",
                        "financial advice", "you should invest", "100% sure",
                    ],
                    [
                        (
                            "Hey, sorry to hear about this. A few things you can check right away: "
                            "look up the company's SEC filings, check if the stock is OTC (often a red flag), "
                            "and see if the trading volume matches the hype. If someone is pushing you to "
                            "buy urgently, that's almost always a bad sign."
                        ),
                        (
                            "This has some classic pump-and-dump patterns. The sudden volume spike + "
                            "social media hype is textbook. Before putting any money in, I'd check: "
                            "1) Is the company actually filing with the SEC? 2) What's the market cap? "
                            "3) Who's promoting it and why? There are tools like ScamDunk.com that can "
                            "run these checks automatically."
                        ),
                    ],
                    0.4,
                    "natural",
                    now,
                    now,
                ),
            )
            conn.commit()

    return get_active_voice_template()
