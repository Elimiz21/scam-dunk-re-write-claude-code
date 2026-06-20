"""
FastAPI Server for ScamDunk AI Module

This server exposes the full hybrid AI scam detection system:
- Random Forest ML classifier
- LSTM deep learning model
- Statistical anomaly detection
- Feature engineering (Z-scores, ATR, Keltner Channels)
- Model ensemble with probability calibration

Run with: uvicorn api_server:app --host 0.0.0.0 --port 8000
"""

import os
import sys
import secrets
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime
import logging
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

AI_API_SECRET = os.environ.get("AI_API_SECRET")

# In production we MUST NOT fail open. If the secret is unset we refuse to start
# unless explicitly opted out (ALLOW_UNAUTHENTICATED=true for local/dev only).
# When that opt-out is set without a secret, every non-health route is 403'd.
_ENVIRONMENT = os.environ.get("ENVIRONMENT", os.environ.get("RAILWAY_ENVIRONMENT", "")).strip().lower()
_IS_PRODUCTION = _ENVIRONMENT in ("production", "prod") or os.environ.get("AI_REQUIRE_AUTH", "").strip().lower() in ("1", "true", "yes")
_ALLOW_UNAUTHENTICATED = os.environ.get("ALLOW_UNAUTHENTICATED", "").strip().lower() in ("1", "true", "yes")

if not AI_API_SECRET:
    if _IS_PRODUCTION and not _ALLOW_UNAUTHENTICATED:
        raise RuntimeError(
            "AI_API_SECRET is not set in a production environment. Refusing to "
            "start with unauthenticated endpoints. Set AI_API_SECRET, or set "
            "ALLOW_UNAUTHENTICATED=true to explicitly run without auth (NOT for production)."
        )
    logger.warning(
        "WARNING: AI_API_SECRET is not set. Non-health endpoints will be REFUSED (403) "
        "until a secret is configured."
    )

# Track pipeline initialization error for diagnostics
pipeline_init_error: Optional[str] = None

# Initialize FastAPI app
app = FastAPI(
    title="ScamDunk AI API",
    description="Full hybrid AI scam detection system with ML models",
    version="1.0.0"
)

# Configure CORS for web app access
allowed_origin = os.environ.get("ALLOWED_ORIGIN", "https://scamdunk.com")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    # Always allow CORS preflight through so the browser is not blocked by a 401
    # before CORS headers are applied (PY-L1).
    if request.method == "OPTIONS":
        return await call_next(request)
    # Health/root are always reachable so the platform health check works.
    if request.url.path in ("/", "/health"):
        return await call_next(request)

    provided = request.headers.get("X-API-Key")
    if AI_API_SECRET:
        # Constant-time comparison to avoid leaking the secret via timing.
        if not secrets.compare_digest(provided or "", AI_API_SECRET):
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    else:
        # No secret configured: fail closed on every non-health route rather
        # than leaving the service open (it only reaches here in non-production
        # because production refuses to start without a secret).
        return JSONResponse(
            status_code=403,
            content={"detail": "Service is not configured with an API key; requests are refused."},
        )
    return await call_next(request)

# Pipeline will be initialized lazily
pipeline = None

# Startup event to log when app is ready
@app.on_event("startup")
async def startup_event():
    logger.info("=== ScamDunk AI API Starting ===")
    logger.info(f"Python version: {sys.version}")
    try:
        import resource
        mem = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        logger.info(f"Memory usage at startup: {mem:.1f} MB")
    except Exception:
        pass
    logger.info("API ready to receive requests (models load on first analyze request)")

    # Start background keep-alive logging
    async def keep_alive_log():
        count = 0
        while True:
            await asyncio.sleep(60)
            count += 1
            logger.info(f"[Keep-alive] App running for {count} minute(s)")

    asyncio.create_task(keep_alive_log())

@app.on_event("shutdown")
async def shutdown_event():
    logger.warning("=== ScamDunk AI API Shutting Down ===")
    logger.warning("Received shutdown signal")

pipeline_lock = asyncio.Lock()


class AnalysisRequest(BaseModel):
    """Request model for scam analysis.

    Matches the TS↔Python contract:
    { ticker, asset_type, use_live_data, days, sec_flagged, news_flag }
    """
    ticker: str = Field(..., max_length=10, description="Stock ticker or crypto symbol")
    asset_type: Literal["stock", "crypto"] = Field(default="stock", description="Asset type: 'stock' or 'crypto'")
    days: int = Field(default=90, ge=1, le=365, description="Days of historical data to analyze (1-365)")
    use_live_data: bool = Field(default=True, description="Use live API data (real market data from yfinance)")
    sec_flagged: Optional[bool] = Field(default=None, description="SEC flag result from upstream regulatory database check. Overrides internal SEC list when provided.")
    news_flag: bool = Field(default=False, description="Whether the upstream layer found a legitimate news catalyst for recent price/volume activity (reduces false positives).")


def _severity_from_weight(weight: int) -> str:
    """Map a signal weight to a coarse severity label for the TS contract."""
    if weight >= 4:
        return "high"
    if weight >= 2:
        return "medium"
    return "low"


class SignalDetail(BaseModel):
    """Individual risk signal (contract: {code, description, weight, severity})."""
    code: str
    category: str
    description: str
    weight: int
    severity: str = "low"


class StockInfo(BaseModel):
    """Stock information from market data"""
    company_name: Optional[str] = None
    exchange: Optional[str] = None
    last_price: Optional[float] = None
    market_cap: Optional[float] = None
    avg_volume: Optional[float] = None


class NewsVerificationResult(BaseModel):
    """Result of news verification for HIGH risk stocks"""
    has_legitimate_catalyst: bool = False
    has_sec_filings: bool = False
    has_promotional_signals: bool = False
    catalyst_summary: str = ''
    should_reduce_risk: bool = False
    recommended_level: str = 'HIGH'


class AnalysisResponse(BaseModel):
    """Response model for scam analysis"""
    ticker: str
    asset_type: str
    risk_level: str
    risk_probability: float
    risk_score: int
    rf_probability: Optional[float] = None
    lstm_probability: Optional[float] = None
    anomaly_score: float = 0.0
    signals: List[SignalDetail] = []
    features: Dict[str, Any] = {}
    explanations: List[str] = []
    sec_flagged: bool = False
    is_otc: bool = False
    is_micro_cap: bool = False
    data_available: bool = True
    analysis_timestamp: str
    # Additional stock info for frontend display
    stock_info: Optional[StockInfo] = None
    # News verification result (only present for initially-HIGH risk)
    news_verification: Optional[NewsVerificationResult] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    models_loaded: bool
    rf_ready: bool
    lstm_ready: bool
    version: str


async def get_pipeline():
    """Get or initialize the pipeline (lazy loading)"""
    global pipeline

    if pipeline is not None:
        return pipeline

    async with pipeline_lock:
        # Double-check after acquiring lock
        if pipeline is not None:
            return pipeline

        logger.info("Initializing ScamDunk AI Pipeline (lazy load)...")

        try:
            from pipeline import ScamDetectionPipeline, ml_models_enabled

            loop = asyncio.get_running_loop()
            # Models are loaded ONCE here (pre-trained artifacts shipped with the
            # image). We never train in the request path or at startup — when ML
            # is enabled and an artifact is missing/mismatched the pipeline simply
            # degrades to rule-based scoring (see ScamDetectionPipeline.analyze).
            pipeline_instance = await loop.run_in_executor(
                None, lambda: ScamDetectionPipeline(load_models=True)
            )
            logger.info("Pipeline initialized successfully")
            logger.info(f"  - ML models enabled: {ml_models_enabled()}")
            logger.info(f"  - Random Forest: {'Ready' if pipeline_instance.rf_available else 'Not loaded (rule-based)'}")
            logger.info(f"  - LSTM Model: {'Ready' if pipeline_instance.lstm_available else 'Not loaded (rule-based)'}")

            # Set global pipeline
            pipeline = pipeline_instance
            return pipeline

        except Exception as e:
            global pipeline_init_error
            pipeline_init_error = f"{type(e).__name__}: {e}"
            logger.error(f"Failed to initialize pipeline: {e}")
            import traceback
            traceback.print_exc()
            return None


@app.on_event("startup")
async def startup_load_pipeline():
    """Eagerly load models at startup instead of waiting for first request"""
    logger.info("Startup: eagerly loading AI pipeline...")
    result = await get_pipeline()
    if result is not None:
        logger.info("Startup: pipeline loaded successfully")
    else:
        logger.error(f"Startup: pipeline failed to load - {pipeline_init_error}")


# Root endpoint - always works
@app.get("/")
async def root():
    """Root endpoint - always available"""
    return {
        "service": "ScamDunk AI API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "analyze": "/analyze (POST)",
            "sec_check": "/sec-check/{ticker}"
        }
    }


@app.get("/health")
async def health_check():
    """Meaningful health check used by the platform health probe.

    Reports readiness based on whether the pipeline loaded. When the pipeline
    failed to initialize we return HTTP 503 so the platform does NOT consider a
    permanently-broken instance healthy (PY-C5/PY-M2). When ML models are
    disabled (the default), a loaded rule-based pipeline is still "ready".
    """
    from pipeline import ml_models_enabled
    p = pipeline  # Get current state without initializing
    ml_enabled = ml_models_enabled()
    ready = p is not None
    body = {
        "status": "healthy" if ready else ("error" if pipeline_init_error else "initializing"),
        "ready": ready,
        "ml_models_enabled": ml_enabled,
        "models_loaded": p is not None,
        "rf_ready": p.rf_available if p else False,
        "lstm_ready": p.lstm_available if p else False,
        "scoring_mode": ("ml+rules" if (p and (p.rf_available or p.lstm_available)) else "rules_only"),
        "version": "1.0.0",
        "error": pipeline_init_error if p is None else None,
    }
    if not ready and pipeline_init_error:
        # Surface a hard failure to the health probe.
        return JSONResponse(status_code=503, content=body)
    return body


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_asset(request: AnalysisRequest):
    """Run full hybrid AI analysis on an asset"""

    # Get or initialize pipeline
    p = await get_pipeline()

    if p is None:
        raise HTTPException(
            status_code=503,
            detail="AI models are still initializing. Please try again in a moment."
        )

    try:
        # Run the full pipeline analysis in a thread pool to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        assessment = await loop.run_in_executor(
            None,
            lambda: p.analyze(
                ticker=request.ticker,
                asset_type=request.asset_type,
                use_synthetic=not request.use_live_data,
                is_scam_scenario=False,
                # Plumb the upstream news flag through so the news-aware
                # false-positive reduction can actually activate (PY-H7).
                news_flag=request.news_flag,
                sec_flagged_override=request.sec_flagged
            )
        )

        # Use pipeline-computed signals directly (no more fragile string matching)
        signals = []
        for sig in assessment.signals:
            signals.append(SignalDetail(
                code=sig.code,
                category=sig.category,
                description=sig.description,
                weight=sig.weight,
                severity=_severity_from_weight(sig.weight),
            ))

        total_score = assessment.signal_total_score

        # Build feature summary
        features = {}
        if assessment.detailed_report.get('feature_highlights'):
            features = assessment.detailed_report['feature_highlights']

        # Get explanations from key indicators and signal descriptions
        explanations = [s.description for s in assessment.signals]
        if not explanations and assessment.explanation:
            for line in assessment.explanation.split('\n'):
                line = line.strip()
                if line.startswith('-') or line.startswith('>'):
                    explanations.append(line.lstrip('->').strip())
                elif line and not line.startswith('Risk') and not line.startswith('Key'):
                    explanations.append(line)

        # Extract stock info from detailed report
        data_summary = assessment.detailed_report.get('data_summary', {})
        contextual_flags = assessment.detailed_report.get('contextual_flags', {})

        stock_info = StockInfo(
            company_name=data_summary.get('company_name') or data_summary.get('short_name'),
            exchange=data_summary.get('exchange'),
            last_price=data_summary.get('current_price') or data_summary.get('last_price'),
            market_cap=data_summary.get('market_cap'),
            avg_volume=data_summary.get('avg_daily_volume') or data_summary.get('avg_volume')
        )

        # Build news verification result if present
        news_ver = None
        if assessment.news_verification:
            nv = assessment.news_verification
            news_ver = NewsVerificationResult(
                has_legitimate_catalyst=nv.get('has_legitimate_catalyst', False),
                has_sec_filings=nv.get('has_sec_filings', False),
                has_promotional_signals=nv.get('has_promotional_signals', False),
                catalyst_summary=nv.get('catalyst_summary', ''),
                should_reduce_risk=nv.get('should_reduce_risk', False),
                recommended_level=nv.get('recommended_level', 'HIGH'),
            )

        return AnalysisResponse(
            ticker=request.ticker.upper(),
            asset_type=request.asset_type,
            risk_level=assessment.risk_level,
            risk_probability=assessment.combined_probability,
            risk_score=total_score,
            rf_probability=assessment.rf_probability,
            lstm_probability=assessment.lstm_probability,
            anomaly_score=assessment.anomaly_score,
            signals=signals,
            features=features,
            explanations=explanations if explanations else assessment.key_indicators,
            sec_flagged=assessment.sec_flagged,
            is_otc=contextual_flags.get('is_otc', False),
            is_micro_cap=(
                data_summary.get('market_cap') is not None
                and data_summary['market_cap'] < 50_000_000
            ),
            # Honour the pipeline's data-availability verdict (PY-H8) instead of
            # hardcoding True. Thin history / missing fundamentals -> False.
            data_available=assessment.data_available,
            analysis_timestamp=assessment.timestamp,
            stock_info=stock_info,
            news_verification=news_ver
        )

    except Exception as e:
        # Check if this is a DataAPIError (service unavailable)
        from data_ingestion import DataAPIError
        if isinstance(e, DataAPIError):
            logger.error(f"DATA API UNAVAILABLE for {request.ticker}: {e.api_name} - {e.original_error}")
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "service_unavailable",
                    "message": "The scanning system is currently offline. Please try again later.",
                    "api_name": e.api_name,
                    "ticker": e.ticker,
                    "asset_type": e.asset_type,
                    "original_error": e.original_error
                }
            )

        logger.error(f"Analysis failed for {request.ticker}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal analysis error")


@app.get("/sec-check/{ticker}")
async def check_sec_flagged(ticker: str):
    """NON-AUTHORITATIVE local SEC fallback check.

    The authoritative SEC flag is computed by the TypeScript layer from real
    regulatory data and passed into /analyze via the `sec_flagged` field. This
    endpoint only consults the small local demo list and MUST NOT be treated as
    a real regulatory source — it exists for diagnostics/fallback only.
    """
    from config import SEC_FLAGGED_TICKERS
    flagged = ticker.upper() in SEC_FLAGGED_TICKERS
    return {
        "ticker": ticker.upper(),
        "sec_flagged": flagged,
        "authoritative": False,
        "source": "local_demo_list_fallback",
        "message": (
            "Ticker is on the local demo fallback list (NOT an authoritative SEC source)"
            if flagged else
            "Not on local demo fallback list (authoritative SEC status is computed upstream)"
        ),
    }


@app.get("/models/status")
async def get_model_status():
    """Get detailed model status"""
    from config import ENSEMBLE_CONFIG
    from pipeline import ml_models_enabled
    p = pipeline
    if p is None:
        return {
            "status": "not_initialized",
            "message": "Models will be loaded on first /analyze request",
            "ml_models_enabled": ml_models_enabled(),
            "rf_model": None,
            "lstm_model": None
        }

    return {
        "status": "ready",
        "ml_models_enabled": ml_models_enabled(),
        "scoring_mode": "ml+rules" if (p.rf_available or p.lstm_available) else "rules_only",
        "rf_model": {
            "loaded": p.rf_available,
            "type": "RandomForestClassifier"
        },
        "lstm_model": {
            "loaded": p.lstm_available,
            "type": "LSTM Sequential"
        },
        "ensemble": {
            "method": "max" if ENSEMBLE_CONFIG.get("use_max_strategy") else "weighted_average",
            # Report the ACTUAL configured weights (previously advertised 0.6/0.4
            # while config used 0.5/0.5 — PY-M9).
            "rf_weight": ENSEMBLE_CONFIG.get("rf_weight"),
            "lstm_weight": ENSEMBLE_CONFIG.get("lstm_weight"),
        }
    }


from pre_pump_signals import scan_pre_pump_signals
from social_early_warning import scan_social_early_warning
from domain_monitor import scan_domain_infrastructure


# Cap batch sizes to bound per-request fan-out / DoS surface (PY-H6).
MAX_BATCH_TICKERS = 50


class PrePumpScanRequest(BaseModel):
    tickers: List[str] = Field(..., max_length=MAX_BATCH_TICKERS, description="List of ticker symbols to scan (max 50)")
    fundamentals: Dict[str, Dict] = Field(default_factory=dict)


class PrePumpScanResponse(BaseModel):
    results: Dict[str, Any]
    tickers_scanned: int
    tickers_with_signals: int


@app.post("/pre-pump-scan", response_model=PrePumpScanResponse)
async def pre_pump_scan(request: PrePumpScanRequest):
    """Batch scan tickers for pre-pump structural signals."""
    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(
        None, lambda: scan_pre_pump_signals(request.tickers, request.fundamentals)
    )
    return PrePumpScanResponse(
        results=results,
        tickers_scanned=len(request.tickers),
        tickers_with_signals=len(results),
    )


class SocialEarlyWarningRequest(BaseModel):
    tickers: List[str] = Field(..., max_length=MAX_BATCH_TICKERS)
    mention_baselines: Dict[str, float] = Field(default_factory=dict)


class SocialEarlyWarningResponse(BaseModel):
    watchlist: Dict[str, Any]
    tickers_scanned: int
    tickers_flagged: int


@app.post("/social-early-warning", response_model=SocialEarlyWarningResponse)
async def social_early_warning(request: SocialEarlyWarningRequest):
    """Scan tickers for social media early warning signals (Reddit + StockTwits velocity)."""
    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(
        None, lambda: scan_social_early_warning(request.tickers, request.mention_baselines)
    )
    return SocialEarlyWarningResponse(
        watchlist=results,
        tickers_scanned=len(request.tickers),
        tickers_flagged=len(results),
    )


class DomainCheckRequest(BaseModel):
    tickers: List[str] = Field(..., max_length=MAX_BATCH_TICKERS, description="List of ticker symbols to check (max 50)")
    company_names: Dict[str, str] = Field(
        default_factory=dict,
        description="Optional ticker -> company name mapping for broader search",
    )


class DomainCheckResponse(BaseModel):
    results: Dict[str, Any]
    tickers_scanned: int
    tickers_with_domains: int


@app.post("/domain-check", response_model=DomainCheckResponse)
async def domain_check(request: DomainCheckRequest):
    """Scan tickers for promotional domain infrastructure (pre-pump indicator)."""
    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(
        None,
        lambda: scan_domain_infrastructure(
            request.tickers,
            company_names=request.company_names,
        ),
    )
    return DomainCheckResponse(
        results=results,
        tickers_scanned=len(request.tickers),
        tickers_with_domains=len(results),
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
