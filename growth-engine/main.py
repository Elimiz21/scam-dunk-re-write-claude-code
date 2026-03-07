"""
Growth Engine: FastAPI service for ScamDunk's social media growth automation.

Runs on Railway as a separate service from the main Next.js app.
Shares the Supabase PostgreSQL database for data exchange.

Agents:
  - Discovery: Finds relevant Reddit/X posts via Serper + Perplexity
  - Drafting: Generates voice-matched reply drafts via OpenAI
  - Monitoring: Tracks engagement on posted replies

The admin dashboard in the main Next.js app provides:
  - Review queue with one-click reply for Reddit
  - Auto-post approval for X
  - Engagement metrics and alerts
"""

import asyncio
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI, HTTPException, Header

from config import settings
from db import ensure_default_config, ensure_default_voice_template
from discovery import run_discovery
from drafting import run_drafting
from monitoring import run_monitoring


scheduler = AsyncIOScheduler()


def verify_api_key(x_api_key: str = Header(None, alias="X-Growth-API-Key")):
    """Verify the shared API key for admin dashboard communication."""
    if not settings.growth_engine_api_key:
        return  # No key configured, allow all (dev mode)
    if x_api_key != settings.growth_engine_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize defaults and start scheduler."""
    print("[GrowthEngine] Starting up...")

    # Ensure defaults exist
    ensure_default_config()
    ensure_default_voice_template()

    # Schedule agents
    config = ensure_default_config()
    discovery_hours = config.get("discoveryIntervalHours", 4) if config else 4
    monitoring_hours = config.get("monitoringIntervalHours", 12) if config else 12

    scheduler.add_job(
        run_discovery_and_draft,
        IntervalTrigger(hours=discovery_hours),
        id="discovery_and_draft",
        name="Discovery + Drafting Pipeline",
        replace_existing=True,
    )

    scheduler.add_job(
        run_monitoring,
        IntervalTrigger(hours=monitoring_hours),
        id="monitoring",
        name="Engagement Monitoring",
        replace_existing=True,
    )

    scheduler.start()
    print(f"[GrowthEngine] Scheduler started: discovery every {discovery_hours}h, monitoring every {monitoring_hours}h")

    yield

    scheduler.shutdown()
    print("[GrowthEngine] Shut down.")


app = FastAPI(
    title="ScamDunk Growth Engine",
    description="AI-powered social media growth automation for ScamDunk.com",
    version="1.0.0",
    lifespan=lifespan,
)


async def run_discovery_and_draft():
    """Run discovery followed by drafting."""
    try:
        await run_discovery()
        await run_drafting()
    except Exception as e:
        print(f"[GrowthEngine] Pipeline error: {e}")


# ─── API Endpoints ──────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "service": "growth-engine"}


@app.post("/api/trigger/discovery")
async def trigger_discovery(x_api_key: str = Header(None, alias="X-Growth-API-Key")):
    """Manually trigger a discovery run."""
    verify_api_key(x_api_key)
    asyncio.create_task(run_discovery_and_draft())
    return {"status": "started", "message": "Discovery + drafting pipeline triggered"}


@app.post("/api/trigger/monitoring")
async def trigger_monitoring(x_api_key: str = Header(None, alias="X-Growth-API-Key")):
    """Manually trigger a monitoring run."""
    verify_api_key(x_api_key)
    asyncio.create_task(run_monitoring())
    return {"status": "started", "message": "Monitoring triggered"}


@app.get("/api/status")
async def status(x_api_key: str = Header(None, alias="X-Growth-API-Key")):
    """Get scheduler status and next run times."""
    verify_api_key(x_api_key)
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": str(job.next_run_time) if job.next_run_time else None,
        })
    return {"status": "running", "jobs": jobs}
