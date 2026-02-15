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
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime
import logging
import threading

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
if not AI_API_SECRET:
    logger.warning("WARNING: AI_API_SECRET is not set. API endpoints are unprotected!")

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
    if request.url.path in ("/", "/health"):
        return await call_next(request)
    if AI_API_SECRET:
        api_key = request.headers.get("X-API-Key")
        if api_key != AI_API_SECRET:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)

# Pipeline will be initialized lazily
pipeline = None
pipeline_initializing = False

# Startup event to log when app is ready
@app.on_event("startup")
async def startup_event():
    import asyncio
    logger.info("=== ScamDunk AI API Starting ===")
    logger.info(f"Python version: {sys.version}")
    try:
        import resource
        mem = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        logger.info(f"Memory usage at startup: {mem:.1f} MB")
    except:
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

pipeline_lock = threading.Lock()


class AnalysisRequest(BaseModel):
    """Request model for scam analysis"""
    ticker: str = Field(..., max_length=10, description="Stock ticker or crypto symbol")
    asset_type: Literal["stock", "crypto"] = Field(default="stock", description="Asset type: 'stock' or 'crypto'")
    days: int = Field(default=90, ge=1, le=365, description="Days of historical data to analyze (1-365)")
    use_live_data: bool = Field(default=True, description="Use live API data (real market data from yfinance)")
    sec_flagged: Optional[bool] = Field(default=None, description="SEC flag result from upstream regulatory database check. Overrides internal SEC list when provided.")


class SignalDetail(BaseModel):
    """Individual risk signal"""
    code: str
    category: str
    description: str
    weight: int


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


def get_pipeline():
    """Get or initialize the pipeline (lazy loading)"""
    global pipeline, pipeline_initializing

    if pipeline is not None:
        return pipeline

    with pipeline_lock:
        # Double-check after acquiring lock
        if pipeline is not None:
            return pipeline

        if pipeline_initializing:
            return None

        pipeline_initializing = True
        logger.info("Initializing ScamDunk AI Pipeline (lazy load)...")

        try:
            from config import SEC_FLAGGED_TICKERS
            from pipeline import ScamDetectionPipeline

            pipeline_instance = ScamDetectionPipeline(load_models=True)
            logger.info("Pipeline initialized successfully")
            logger.info(f"  - Random Forest: {'Ready' if pipeline_instance.rf_available else 'Not loaded'}")
            logger.info(f"  - LSTM Model: {'Ready' if pipeline_instance.lstm_available else 'Not loaded'}")

            # Train models if not available
            if not pipeline_instance.rf_available:
                logger.info("Training Random Forest model...")
                pipeline_instance.train_models(
                    train_rf=True,
                    train_lstm=False,
                    save_models=True
                )
                logger.info("RF training complete")

            # Train LSTM if RF is ready but LSTM is not
            if pipeline_instance.rf_available and not pipeline_instance.lstm_available:
                logger.info("Training LSTM model...")
                try:
                    pipeline_instance.train_models(
                        train_rf=False,
                        train_lstm=True,
                        lstm_epochs=10,  # Reduced epochs for faster startup
                        save_models=True
                    )
                    logger.info("LSTM training complete")
                except Exception as e:
                    logger.warning(f"LSTM training failed: {e}")

            # Set global pipeline
            pipeline = pipeline_instance
            return pipeline

        except Exception as e:
            logger.error(f"Failed to initialize pipeline: {e}")
            import traceback
            traceback.print_exc()
            return None
        finally:
            pipeline_initializing = False


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


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check API health and model status"""
    p = pipeline  # Get current state without initializing
    return HealthResponse(
        status="healthy",
        models_loaded=p is not None,
        rf_ready=p.rf_available if p else False,
        lstm_ready=p.lstm_available if p else False,
        version="1.0.0"
    )


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_asset(request: AnalysisRequest):
    """Run full hybrid AI analysis on an asset"""

    # Get or initialize pipeline
    p = get_pipeline()

    if p is None:
        raise HTTPException(
            status_code=503,
            detail="AI models are still initializing. Please try again in a moment."
        )

    try:
        # Run the full pipeline analysis
        assessment = p.analyze(
            ticker=request.ticker,
            asset_type=request.asset_type,
            use_synthetic=not request.use_live_data,
            is_scam_scenario=False,
            news_flag=False,
            sec_flagged_override=request.sec_flagged
        )

        # Build signal details from key indicators
        signals = []
        for indicator in assessment.key_indicators:
            if "SEC" in indicator:
                signals.append(SignalDetail(code="SEC_FLAGGED", category="ALERT", description=indicator, weight=5))
            elif "OTC" in indicator or "Pink" in indicator:
                signals.append(SignalDetail(code="OTC_EXCHANGE", category="STRUCTURAL", description=indicator, weight=3))
            elif "pump" in indicator.lower() or "dump" in indicator.lower():
                signals.append(SignalDetail(code="PUMP_DUMP_PATTERN", category="PATTERN", description=indicator, weight=4))
            elif "volume" in indicator.lower():
                signals.append(SignalDetail(code="VOLUME_ANOMALY", category="PATTERN", description=indicator, weight=3))
            elif "price" in indicator.lower() or "%" in indicator:
                signals.append(SignalDetail(code="PRICE_ANOMALY", category="PATTERN", description=indicator, weight=3))
            elif "RSI" in indicator or "overbought" in indicator.lower():
                signals.append(SignalDetail(code="OVERBOUGHT_RSI", category="PATTERN", description=indicator, weight=2))
            elif "cap" in indicator.lower():
                signals.append(SignalDetail(code="MICRO_CAP", category="STRUCTURAL", description=indicator, weight=2))
            else:
                signals.append(SignalDetail(code="OTHER", category="PATTERN", description=indicator, weight=1))

        # Add anomaly types as signals
        for anomaly_type in assessment.anomaly_types:
            signals.append(SignalDetail(
                code=anomaly_type.upper().replace(" ", "_"),
                category="PATTERN",
                description=f"Anomaly: {anomaly_type.replace('_', ' ')}",
                weight=2
            ))

        # Build feature summary
        features = {}
        if assessment.detailed_report.get('feature_highlights'):
            features = assessment.detailed_report['feature_highlights']

        # Get explanations
        explanations = []
        if assessment.explanation:
            for line in assessment.explanation.split('\n'):
                line = line.strip()
                if line.startswith('-') or line.startswith('>'):
                    explanations.append(line.lstrip('->').strip())
                elif line and not line.startswith('Risk') and not line.startswith('Key'):
                    explanations.append(line)

        total_score = sum(s.weight for s in signals)

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
            is_micro_cap=data_summary.get('market_cap', float('inf')) < 50_000_000 if data_summary.get('market_cap') else False,
            data_available=True,
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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sec-check/{ticker}")
async def check_sec_flagged(ticker: str):
    """Check if a ticker is on the SEC flagged list"""
    from config import SEC_FLAGGED_TICKERS
    flagged = ticker.upper() in SEC_FLAGGED_TICKERS
    return {
        "ticker": ticker.upper(),
        "sec_flagged": flagged,
        "message": "This ticker appears on SEC regulatory alerts" if flagged else "Not on SEC alert list"
    }


@app.get("/models/status")
async def get_model_status():
    """Get detailed model status"""
    p = pipeline
    if p is None:
        return {
            "status": "not_initialized",
            "message": "Models will be loaded on first /analyze request",
            "rf_model": None,
            "lstm_model": None
        }

    return {
        "status": "ready",
        "rf_model": {
            "loaded": p.rf_available,
            "type": "RandomForestClassifier"
        },
        "lstm_model": {
            "loaded": p.lstm_available,
            "type": "LSTM Sequential"
        },
        "ensemble": {
            "method": "weighted_average",
            "rf_weight": 0.6,
            "lstm_weight": 0.4
        }
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
