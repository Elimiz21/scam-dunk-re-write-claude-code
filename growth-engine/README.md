# ScamDunk Growth Engine

AI-powered social media growth automation service for ScamDunk.com. Runs as a separate Python service on Railway, sharing the Supabase PostgreSQL database with the main Next.js app.

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│   Next.js App (Vercel)  │     │  Growth Engine (Railway)  │
│                         │     │                           │
│  Admin Dashboard:       │     │  Discovery Agent:         │
│  - Review Queue         │◄───►│  - Serper.dev (Reddit/X)  │
│  - One-click Reply      │     │  - Perplexity AI (Reddit) │
│  - Engagement History   │     │  - Reddit JSON enrichment │
│  - Settings             │     │                           │
│                         │     │  Drafting Agent:           │
│                         │     │  - OpenAI GPT-4o           │
│                         │     │  - Voice templates         │
│                         │     │                           │
│                         │     │  Monitoring Agent:         │
│                         │     │  - Engagement tracking     │
│                         │     │  - Trending alerts         │
└────────┬────────────────┘     └────────┬──────────────────┘
         │                               │
         └───────────┬───────────────────┘
                     │
              ┌──────▼──────┐
              │  Supabase   │
              │  PostgreSQL │
              └─────────────┘
```

## Reddit Discovery (No API Key Needed)

The growth engine uses **Serper.dev** and **Perplexity AI** instead of Reddit's API:

1. **Serper.dev** (`site:reddit.com` queries) — Most reliable method. Uses Google Search API scoped to Reddit. Returns fresh posts with metadata. ~2,500 free queries/month.

2. **Perplexity AI** (sonar model) — Web-grounded AI finds active Reddit discussions and returns source URLs as citations. Great for discovering conversations, not just keyword matches.

3. **Reddit Public JSON** (enrichment only) — After discovering posts via Serper/Perplexity, we fetch `post.json` to get engagement data (upvotes, comments). This is lightweight and doesn't require auth.

## One-Click Reddit Reply Flow

1. Discovery agent finds relevant Reddit posts
2. Drafting agent generates a reply using your voice template
3. In the admin dashboard **Review Queue**:
   - You see the original post with a link
   - You see the AI-generated reply
   - Click **"Copy & Open in Reddit"**:
     - Reply text is copied to your clipboard
     - Original Reddit post opens in a new tab
     - Draft is marked as "posted" in the database
   - You paste the reply in Reddit and submit

## Setup

### 1. Environment Variables

Copy `.env.example` and fill in:

```bash
cp .env.example .env
```

Required:
- `DATABASE_URL` — Same Supabase connection string as your main app
- `SERPER_API_KEY` — From serper.dev (2,500 free queries)
- `OPENAI_API_KEY` — For draft generation

Optional:
- `PERPLEXITY_API_KEY` — Additional Reddit discovery
- `X_API_KEY/SECRET` + `X_ACCESS_TOKEN/SECRET` — For auto-posting to X
- `GROWTH_ENGINE_API_KEY` — Shared secret with main app

### 2. Database Migration

Run from the main app directory:

```bash
npx prisma migrate dev --name add-growth-engine-models
```

### 3. Local Development

```bash
cd growth-engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### 4. Deploy to Railway

1. Create a new Railway service
2. Point it to the `growth-engine/` directory
3. Set environment variables
4. Railway will use the Dockerfile automatically

### 5. Connect to Admin Dashboard

Set in your main app's `.env`:
```
GROWTH_ENGINE_URL=https://your-railway-service.up.railway.app
GROWTH_ENGINE_API_KEY=same-key-as-growth-engine
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/trigger/discovery` | Manually trigger discovery + drafting |
| POST | `/api/trigger/monitoring` | Manually trigger engagement monitoring |
| GET | `/api/status` | Scheduler status and next run times |

## Agents

### Discovery Agent (every 4 hours)
- Searches Reddit via Serper.dev with `site:reddit.com` scoped queries
- Searches Reddit via Perplexity AI for active discussions
- Searches X via Serper.dev with `site:x.com` scoped queries
- Enriches Reddit posts with engagement data via public JSON
- Scores and ranks results by relevance, engagement potential, and urgency
- Stores top 30 results daily

### Drafting Agent (runs after discovery)
- Generates contextual reply drafts using OpenAI GPT-4o
- Uses configurable voice templates for consistent tone
- Randomly includes ScamDunk.com references (~40% of replies by default)
- Respects platform context (subreddit name, post content)

### Monitoring Agent (every 12 hours)
- Checks engagement on posted replies
- Tracks upvotes, comments, likes, retweets
- Flags trending posts and posts needing follow-up
