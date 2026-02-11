# Social Media Scan Redesign Plan

## Current State & Problems

### What Exists Today

**1. Legacy Scanner** (`evaluation/scripts/social-media-scan.ts`)
- Uses OpenAI to **simulate/predict** what social media activity *might* look like
- Does NOT fetch real data from any platform
- Essentially asks GPT "what would Reddit posts about this stock look like?"
- Useless for actual detection

**2. Real Scanner** (`evaluation/scripts/real-social-scanner.ts`)
- Attempts real API calls to 3 platforms: Reddit (public JSON), StockTwits, YouTube
- Reddit: Limited to 10 req/min without OAuth, frequently rate-limited/blocked
- StockTwits: Often blocked by Cloudflare, unreliable
- YouTube: Requires `YOUTUBE_API_KEY` (not configured), limited to 100 searches/day
- Excludes Twitter/X, Discord, Telegram, TikTok, Facebook/Instagram entirely

### Why It Fails
1. No API keys configured (YouTube key missing)
2. Reddit public JSON endpoint is heavily rate-limited and unreliable
3. StockTwits blocks automated requests via Cloudflare
4. Zero coverage of Twitter/X, Discord, Telegram, TikTok -- where much pump-and-dump promotion actually happens
5. The "AI simulation" approach in the legacy scanner produces fabricated data, not evidence

### What We Need
A system that takes a daily list of suspicious/high-risk stock tickers and finds **real evidence** of social media promotion across as many platforms as possible. Coverage matters more than depth on any single platform.

---

## Available Resources

| Resource | Status | Details |
|----------|--------|---------|
| Reddit account | Available | User can provide credentials for authenticated access |
| Discord account | Available | User can provide credentials or create a bot |
| YouTube API Key | Available | 10,000 units/day free tier |
| OpenAI API Key | Available | Pay-as-you-go |
| Anthropic API Key | Available | Pay-as-you-go |
| FMP API Key | Available | Already used for stock data |

---

## Three Viable Routes

---

### ROUTE 1: Search Engine Aggregation Layer

**Concept**: Use search engines as a universal proxy to find mentions across ALL social media platforms simultaneously, without needing individual platform APIs.

**How It Works**:
1. Create a Google Programmable Search Engine (PSE) restricted to social media domains
2. For each suspicious ticker, run targeted searches like:
   - `"$AAPL" site:reddit.com`
   - `"AAPL stock" site:twitter.com`
   - `"AAPL" site:stocktwits.com`
   - `"AAPL" site:discord.com`
   - `"AAPL stock" site:tiktok.com`
   - `"AAPL" site:youtube.com`
3. Parse search result snippets for promotional language patterns
4. Use AI (Claude/GPT) to analyze the aggregated snippets for pump-and-dump indicators

**Platform Coverage**:
- Reddit (via Google index of public posts)
- Twitter/X (via Google index of public tweets)
- YouTube (via Google index of video titles/descriptions)
- StockTwits (via Google index)
- TikTok (via Google index of public videos)
- Discord (limited - only indexed public servers)
- Facebook/Instagram (limited - only indexed public pages/groups)
- Financial forums (Seeking Alpha, InvestorHub, Yahoo Finance, etc.)
- Any other indexed web content mentioning the ticker

**APIs Required**:
- **Google Custom Search JSON API**: Free 100 queries/day, then $5 per 1,000 queries
- **Alternative/Supplement: SerpAPI** (~$50/mo for 5,000 searches) - provides structured search results from Google
- **Alternative/Supplement: Bing Web Search API** - Free 1,000 transactions/month
- OpenAI or Anthropic for analysis of results

**Cost Estimate**:
- Scanning 30 tickers/day x 3 search variations = 90 queries/day = free tier covers it
- With SerpAPI as backup: ~$50/month for reliable structured results
- AI analysis: ~$0.50-1.00/day for snippet analysis

**Architecture**:
```
[Suspicious Tickers List]
        |
        v
[Search Engine Query Builder]
  - Constructs targeted site-specific queries
  - Rotates between Google CSE / SerpAPI / Bing
        |
        v
[Search Result Aggregator]
  - Collects snippets, URLs, dates, titles
  - Deduplicates across search engines
  - Groups by platform
        |
        v
[AI Promotion Analyzer] (Claude or GPT)
  - Analyzes snippets for promotional language
  - Identifies coordinated posting patterns
  - Scores promotion risk per platform
  - Identifies potential promoter accounts from snippets
        |
        v
[Results Database]
  - Stores mentions, scores, evidence
  - Tracks promoter accounts over time
```

**Strengths**:
- Broadest possible coverage from a single API
- Covers platforms that have no public API at all (TikTok, Facebook)
- Google already does the crawling/indexing work
- Very low cost
- Simple to implement

**Weaknesses**:
- Google doesn't index everything (private groups, ephemeral content)
- Results are delayed (Google crawl lag, typically hours to days)
- Limited to what search engines choose to index
- Can't access post engagement metrics (upvotes, comments, views)
- Rate limited on free tier

---

### ROUTE 2: Authenticated Platform APIs + Discord/Reddit Bot Monitoring

**Concept**: Use the user's actual accounts to get authenticated API access to Reddit and Discord, combine with YouTube Data API, StockTwits, and RSS monitoring for continuous coverage.

**How It Works**:

**Reddit (Authenticated OAuth)**:
1. Register a Reddit "script" app at reddit.com/prefs/apps using the user's account
2. This gives OAuth2 credentials (client_id, client_secret) tied to the account
3. Authenticated access provides: 60 requests/min (6x the current unauthenticated rate), full search API, access to specific subreddit feeds, user profile data, comment threads
4. Monitor key subreddits via dedicated feeds:
   - r/wallstreetbets, r/pennystocks, r/shortsqueeze, r/Shortsqueeze
   - r/robinhoodpennystocks, r/smallstreetbets, r/squeezeplay
   - r/daytrading, r/stockmarket, r/stocks, r/investing, r/options
5. For each suspicious ticker, search across Reddit AND pull recent posts from monitored subreddits

**Discord (Bot Account)**:
1. Create a Discord bot via the Discord Developer Portal
2. Join the bot to stock-related Discord servers (manually, since bot must be invited):
   - Public stock trading servers
   - Penny stock groups
   - "Alpha" call servers
   - Known pump-and-dump group types
3. The bot listens to message events and searches message history for ticker mentions
4. Discord API provides: message search within joined servers, real-time message monitoring, user information, server metadata

**YouTube (Data API v3)**:
1. Already have API key
2. Search for videos mentioning ticker symbols (100 searches/day on free tier)
3. Also monitor specific channels known for stock promotion
4. Pull video statistics (views, likes, comments) for context

**StockTwits (Enhanced)**:
1. Keep existing scanner but add retry logic and Cloudflare bypass (cookie rotation)
2. Add StockTwits trending endpoint to detect surging mention volume

**RSS Feed Monitoring**:
1. Subscribe to RSS feeds for key subreddits (Reddit provides RSS for every subreddit)
2. Monitor financial forum RSS feeds (Seeking Alpha, Yahoo Finance discussions)
3. YouTube channel RSS feeds for known stock promotion channels
4. Process feeds every hour for new mentions

**Architecture**:
```
[Suspicious Tickers List]
        |
        v
[Platform Orchestrator]
  |         |          |         |          |
  v         v          v         v          v
[Reddit]  [Discord]  [YouTube] [StockTwits] [RSS]
 OAuth     Bot API    Data v3   Public API   Feeds
 60rpm     Search     100/day   Best-effort  Hourly
  |         |          |         |          |
  v         v          v         v          v
[Unified Mention Collector]
  - Normalizes data across platforms
  - Deduplicates
  - Extracts: author, content, date, engagement, platform
        |
        v
[Promotion Pattern Detector]
  - Algorithmic: keyword matching, account age, posting frequency
  - AI-Enhanced: Claude/GPT analyzes context for subtle promotion
  - Cross-platform: detects same ticker pushed on multiple platforms
        |
        v
[Promoter Tracker]
  - Identifies accounts that repeatedly promote flagged tickers
  - Tracks promoter behavior over time
  - Detects coordinated campaigns (same message across platforms)
        |
        v
[Results & Alerts]
```

**Strengths**:
- Real-time data from Reddit and Discord (where pump-and-dump coordination actually happens)
- Full engagement metrics (upvotes, comments, reactions)
- User profile data (account age, posting history) for promoter identification
- Can monitor specific communities continuously, not just search
- High confidence -- this is actual evidence, not search engine snippets

**Weaknesses**:
- Requires account setup and management (Reddit app registration, Discord bot creation)
- Discord bot must be invited to each server manually
- Twitter/X still excluded ($100/mo API minimum)
- TikTok, Facebook, Instagram still excluded
- More complex to implement and maintain
- Reddit OAuth tokens need periodic refresh

**Setup Steps**:
1. Go to https://www.reddit.com/prefs/apps -> "Create app" -> script type
2. Note client_id and client_secret
3. Go to https://discord.com/developers/applications -> "New Application" -> Bot
4. Generate bot token, set intents (Message Content intent required)
5. Generate bot invite link with appropriate permissions
6. Join bot to target Discord servers
7. Configure all credentials in `.env.local`

---

### ROUTE 3: AI Research Agent with Web Browsing

**Concept**: Deploy an AI agent (Claude or GPT) that acts like a human research analyst, using web search and browsing tools to investigate each suspicious ticker across all public social media.

**How It Works**:
1. For each batch of suspicious tickers, spawn an AI agent with web search/browsing capabilities
2. The agent receives structured instructions:
   - "Search for any mentions of $TICKER on Reddit, Twitter, YouTube, TikTok, StockTwits, Discord, and financial forums"
   - "Identify promotional language, coordinated campaigns, and suspicious accounts"
   - "Return structured evidence with URLs, quotes, and risk assessment"
3. The agent uses web search tools to find mentions, visits URLs to read full content, and analyzes what it finds
4. Results are returned in structured JSON format for database storage

**Implementation Options**:

**Option A: Anthropic Claude with Tool Use**
- Use Claude API with custom tools: `web_search`, `fetch_url`
- Claude conducts multi-step research autonomously
- Returns structured JSON with findings
- Cost: ~$0.05-0.15 per ticker investigation (depending on depth)

**Option B: OpenAI Assistants with Web Browsing**
- Use OpenAI's Assistants API with the browsing tool
- GPT-4 browses the web, searching for and reading social media posts
- Can navigate Reddit threads, read Twitter posts, watch YouTube descriptions
- Cost: ~$0.10-0.20 per ticker investigation

**Option C: Perplexity API**
- Perplexity provides web-grounded AI responses
- Ask: "Find recent social media mentions of $TICKER stock on Reddit, Twitter, YouTube, and StockTwits. Focus on promotional content and pump-and-dump indicators."
- Returns sourced, cited answers with actual URLs
- Pro API: $20/month for 600 queries/day (sufficient for daily scans)
- Most cost-effective for this specific use case

**Option D: Hybrid Agent Approach**
- Use Perplexity for initial broad search (cheap, fast, grounded)
- Use Claude/GPT for deep analysis of the most suspicious findings
- Best of both worlds

**Architecture**:
```
[Suspicious Tickers List]
        |
        v
[Agent Task Distributor]
  - Batches tickers (5-10 per agent call)
  - Constructs investigation prompts
  - Manages rate limits and costs
        |
        v
[AI Research Agents] (parallel execution)
  |                    |                    |
  v                    v                    v
[Perplexity]        [Claude]            [GPT-4]
 Broad search       Deep investigation   Cross-reference
 All platforms      Suspicious finds     Verify evidence
 600/day            As needed            As needed
        |                    |                    |
        v                    v                    v
[Evidence Synthesizer]
  - Merges findings from multiple AI agents
  - Resolves conflicts
  - Ranks by confidence
  - Extracts structured data (URLs, authors, dates)
        |
        v
[Structured Output]
  - ComprehensiveScanResult format (compatible with existing pipeline)
  - URLs to actual social media posts as evidence
  - Promotion scores with reasoning
  - Identified promoter accounts
```

**Strengths**:
- Most flexible -- can adapt to any platform without specific API integration
- Covers Twitter/X, TikTok, Facebook, Instagram (via public web view)
- Understands context and nuance (AI can distinguish genuine discussion from promotion)
- Can investigate unusual patterns that keyword matching would miss
- Easiest to implement (prompt engineering vs. API integration)
- Self-improving -- can be tuned with better prompts over time
- Perplexity option is extremely cost-effective

**Weaknesses**:
- AI can hallucinate findings (mitigated by requiring URLs as evidence)
- Slower per-ticker than direct API calls
- Costs scale linearly with number of tickers
- Less reliable for quantitative metrics (exact post counts, engagement numbers)
- Dependent on third-party AI service availability
- Web browsing may hit CAPTCHAs or bot detection

---

## Recommended Approach: Layered Combination

The three routes are not mutually exclusive. The optimal system combines them in layers:

### Layer 1: Search Engine Sweep (Route 1)
- Run first, every day, for ALL suspicious tickers
- Cheap, fast, broad coverage
- Produces initial mentions list and platform-specific hit counts
- Identifies which tickers have ANY social media presence

### Layer 2: Authenticated Deep Scan (Route 2)
- Run for tickers that showed activity in Layer 1
- Reddit OAuth + Discord Bot + YouTube API + StockTwits
- Gets real engagement data, full post content, user profiles
- Produces detailed evidence with metrics

### Layer 3: AI Investigation (Route 3)
- Run for the top 10-15 most suspicious tickers after Layers 1 & 2
- Perplexity for broad web-grounded search
- Claude for deep analysis and cross-platform correlation
- Produces narrative assessment, identifies coordinated campaigns
- Covers platforms missed by Layers 1 & 2

### Daily Flow:
```
Morning:
  1. Enhanced Daily Pipeline produces suspicious ticker list
  2. Layer 1: Search engine sweep of ALL suspicious tickers (5-10 min)
  3. Layer 2: Deep scan of tickers with social activity (15-30 min)
  4. Layer 3: AI investigation of top suspects (10-20 min)
  5. Final report with evidence, scores, and recommendations
```

---

## Implementation Priority

### Phase 1 (Start here - highest impact, lowest effort)
1. **Perplexity API integration** (Route 3, Option C)
   - Single API, broad coverage, grounded results with URLs
   - $20/month for 600 queries/day
   - Can replace the entire legacy scanner immediately

2. **Reddit OAuth setup** (Route 2, Reddit only)
   - User registers app, we implement OAuth flow
   - 6x rate improvement over current public JSON approach
   - Access to subreddit-specific feeds

3. **YouTube API activation** (Route 2, YouTube only)
   - Just configure the existing YOUTUBE_API_KEY
   - Scanner code already exists in real-social-scanner.ts

### Phase 2 (High value additions)
4. **Google Custom Search integration** (Route 1)
   - Covers Twitter/X, TikTok, Facebook without their APIs
   - Free 100 queries/day, expandable

5. **Discord bot deployment** (Route 2, Discord only)
   - Bot creation, server joining, message monitoring
   - Critical for catching private pump groups

6. **Claude deep analysis agent** (Route 3, Option A)
   - For the most suspicious tickers, run deep investigation
   - Cross-platform correlation and narrative assessment

### Phase 3 (Polish and optimization)
7. **Promoter tracking database** - Track accounts identified across scans
8. **Real-time alerting** - Notify when a suspicious ticker suddenly surges on social media
9. **Historical pattern matching** - Compare current promotion patterns to past confirmed pump-and-dumps

---

## Environment Variables Needed

```env
# Existing (keep)
FMP_API_KEY=...
OPENAI_API_KEY=...
YOUTUBE_API_KEY=...          # Activate this

# New - Route 1
GOOGLE_CSE_API_KEY=...       # Google Custom Search API key
GOOGLE_CSE_ID=...            # Programmable Search Engine ID
SERPAPI_KEY=...               # Optional: SerpAPI key for structured results

# New - Route 2
REDDIT_CLIENT_ID=...         # From reddit.com/prefs/apps
REDDIT_CLIENT_SECRET=...     # From reddit.com/prefs/apps
REDDIT_USERNAME=...          # User's Reddit username
REDDIT_PASSWORD=...          # User's Reddit password
DISCORD_BOT_TOKEN=...        # From Discord Developer Portal

# New - Route 3
ANTHROPIC_API_KEY=...        # For Claude-based analysis
PERPLEXITY_API_KEY=...       # For web-grounded search
```

---

## File Structure for New Implementation

```
evaluation/scripts/social-scan/
  index.ts                     # Main orchestrator - runs all layers
  types.ts                     # Shared types (SocialMention, ScanResult, etc.)

  # Layer 1: Search Engine
  search-engine-scanner.ts     # Google CSE / SerpAPI / Bing integration

  # Layer 2: Platform APIs
  reddit-oauth-scanner.ts      # Reddit with OAuth authentication
  discord-bot-scanner.ts       # Discord bot monitoring
  youtube-scanner.ts           # YouTube Data API v3 (refactored from existing)
  stocktwits-scanner.ts        # StockTwits (improved from existing)
  rss-monitor.ts               # RSS feed monitoring for subreddits & channels

  # Layer 3: AI Agents
  perplexity-researcher.ts     # Perplexity API for broad web search
  claude-investigator.ts       # Claude deep analysis agent

  # Analysis & Output
  promotion-analyzer.ts        # Pattern detection & scoring
  promoter-tracker.ts          # Track accounts over time
  report-generator.ts          # Generate daily reports
```
