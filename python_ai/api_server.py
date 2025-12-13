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
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
except ImportError:
    print("FastAPI not installed. Run: pip install fastapi uvicorn")
    sys.exit(1)

# Import our AI modules
from config import SEC_FLAGGED_TICKERS
from pipeline import ScamDetectionPipeline

# Initialize FastAPI app
app = FastAPI(
    title="ScamDunk AI API",
    description="Full hybrid AI scam detection system with ML models",
    version="1.0.0"
)

# Configure CORS for web app access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the pipeline (loads ML models)
pipeline: Optional[ScamDetectionPipeline] = None


class AnalysisRequest(BaseModel):
    """Request model for scam analysis"""
    ticker: str = Field(..., description="Stock ticker or crypto symbol")
    asset_type: str = Field(default="stock", description="Asset type: 'stock' or 'crypto'")
    days: int = Field(default=90, description="Days of historical data to analyze")
    use_live_data: bool = Field(default=False, description="Use live API data if available")

    # Optional behavioral context
    unsolicited: bool = Field(default=False, description="Was this tip unsolicited?")
    promises_high_returns: bool = Field(default=False, description="Does it promise high returns?")
    urgency_pressure: bool = Field(default=False, description="Is there urgency/pressure?")
    secrecy_inside_info: bool = Field(default=False, description="Claims insider info?")
    pitch_text: Optional[str] = Field(default=None, description="Optional pitch text to analyze")


class SignalDetail(BaseModel):
    """Individual risk signal"""
    code: str
    category: str
    description: str
    weight: int


class AnalysisResponse(BaseModel):
    """Response model for scam analysis"""
    ticker: str
    asset_type: str
    risk_level: str  # LOW, MEDIUM, HIGH
    risk_probability: float  # 0.0 to 1.0
    risk_score: int  # Weighted signal score

    # Model outputs
    rf_probability: Optional[float] = None
    lstm_probability: Optional[float] = None
    anomaly_score: float = 0.0

    # Signals detected
    signals: List[SignalDetail] = []

    # Feature summary
    features: Dict[str, Any] = {}

    # Explanations
    explanations: List[str] = []

    # Metadata
    sec_flagged: bool = False
    is_otc: bool = False
    is_micro_cap: bool = False
    data_available: bool = True
    analysis_timestamp: str


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    models_loaded: bool
    rf_ready: bool
    lstm_ready: bool
    version: str


@app.on_event("startup")
async def startup_event():
    """Initialize ML models on startup"""
    global pipeline
    logger.info("Initializing ScamDunk AI Pipeline...")

    try:
        pipeline = ScamDetectionPipeline(load_models=True)
        logger.info("Pipeline initialized successfully")
        logger.info(f"  - Random Forest: {'Ready' if pipeline.rf_available else 'Not loaded'}")
        logger.info(f"  - LSTM Model: {'Ready' if pipeline.lstm_available else 'Not loaded'}")
        logger.info(f"  - Anomaly Detector: Ready")

        # Train models if not available
        if not pipeline.rf_available or not pipeline.lstm_available:
            logger.info("Training missing models...")
            pipeline.train_models(
                train_rf=not pipeline.rf_available,
                train_lstm=not pipeline.lstm_available,
                lstm_epochs=10,
                save_models=True
            )
            logger.info("Model training complete")

    except Exception as e:
        logger.error(f"Failed to initialize pipeline: {e}")
        pipeline = None


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check API health and model status"""
    return HealthResponse(
        status="healthy" if pipeline else "degraded",
        models_loaded=pipeline is not None,
        rf_ready=pipeline.rf_available if pipeline else False,
        lstm_ready=pipeline.lstm_available if pipeline else False,
        version="1.0.0"
    )


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_asset(request: AnalysisRequest):
    """
    Run full hybrid AI analysis on an asset

    This uses:
    - Random Forest classifier
    - LSTM deep learning model
    - Statistical anomaly detection
    - Feature engineering (Z-scores, ATR, Keltner Channels)
    - Model ensemble with calibration
    """
    global pipeline

    if pipeline is None:
        raise HTTPException(status_code=503, detail="AI models not initialized")

    try:
        # Run the full pipeline analysis
        # The pipeline.analyze method handles data loading, feature engineering,
        # anomaly detection, ML predictions, and result combination
        assessment = pipeline.analyze(
            ticker=request.ticker,
            asset_type=request.asset_type,
            use_synthetic=not request.use_live_data,
            is_scam_scenario=False,
            news_flag=False
        )

        # Build signal details from key indicators
        signals = []
        for indicator in assessment.key_indicators:
            # Map indicators to signal format
            if "SEC" in indicator:
                signals.append(SignalDetail(
                    code="SEC_FLAGGED",
                    category="ALERT",
                    description=indicator,
                    weight=5
                ))
            elif "OTC" in indicator or "Pink" in indicator:
                signals.append(SignalDetail(
                    code="OTC_EXCHANGE",
                    category="STRUCTURAL",
                    description=indicator,
                    weight=3
                ))
            elif "pump" in indicator.lower() or "dump" in indicator.lower():
                signals.append(SignalDetail(
                    code="PUMP_DUMP_PATTERN",
                    category="PATTERN",
                    description=indicator,
                    weight=4
                ))
            elif "volume" in indicator.lower():
                signals.append(SignalDetail(
                    code="VOLUME_ANOMALY",
                    category="PATTERN",
                    description=indicator,
                    weight=3
                ))
            elif "price" in indicator.lower() or "%" in indicator:
                signals.append(SignalDetail(
                    code="PRICE_ANOMALY",
                    category="PATTERN",
                    description=indicator,
                    weight=3
                ))
            elif "RSI" in indicator or "overbought" in indicator.lower():
                signals.append(SignalDetail(
                    code="OVERBOUGHT_RSI",
                    category="PATTERN",
                    description=indicator,
                    weight=2
                ))
            elif "cap" in indicator.lower():
                signals.append(SignalDetail(
                    code="MICRO_CAP",
                    category="STRUCTURAL",
                    description=indicator,
                    weight=2
                ))
            else:
                signals.append(SignalDetail(
                    code="OTHER",
                    category="PATTERN",
                    description=indicator,
                    weight=1
                ))

        # Add anomaly types as signals
        for anomaly_type in assessment.anomaly_types:
            signals.append(SignalDetail(
                code=anomaly_type.upper().replace(" ", "_"),
                category="PATTERN",
                description=f"Anomaly: {anomaly_type.replace('_', ' ')}",
                weight=2
            ))

        # Build feature summary from detailed report
        features = {}
        if assessment.detailed_report.get('feature_highlights'):
            features = assessment.detailed_report['feature_highlights']

        # Get explanations from the assessment
        explanations = []
        if assessment.explanation:
            # Parse explanation into list of points
            for line in assessment.explanation.split('\n'):
                line = line.strip()
                if line.startswith('-') or line.startswith('>'):
                    explanations.append(line.lstrip('->').strip())
                elif line and not line.startswith('Risk') and not line.startswith('Key'):
                    explanations.append(line)

        # Calculate total score from signals
        total_score = sum(s.weight for s in signals)

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
            is_otc=assessment.detailed_report.get('contextual_flags', {}).get('is_otc', False),
            is_micro_cap=assessment.detailed_report.get('data_summary', {}).get('market_cap', float('inf')) < 50_000_000,
            data_available=True,
            analysis_timestamp=assessment.timestamp
        )

    except Exception as e:
        logger.error(f"Analysis failed for {request.ticker}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sec-check/{ticker}")
async def check_sec_flagged(ticker: str):
    """Check if a ticker is on the SEC flagged list"""
    flagged = ticker.upper() in SEC_FLAGGED_TICKERS
    return {
        "ticker": ticker.upper(),
        "sec_flagged": flagged,
        "message": "This ticker appears on SEC regulatory alerts" if flagged else "Not on SEC alert list"
    }


@app.get("/models/status")
async def get_model_status():
    """Get detailed model status"""
    if pipeline is None:
        return {
            "status": "not_initialized",
            "rf_model": None,
            "lstm_model": None,
            "anomaly_detector": None
        }

    return {
        "status": "ready",
        "rf_model": {
            "loaded": pipeline.rf_available,
            "type": "RandomForestClassifier",
            "features": "price_zscore, volume_zscore, surge metrics, ATR, Keltner bands"
        },
        "lstm_model": {
            "loaded": pipeline.lstm_available,
            "type": "LSTM Sequential",
            "sequence_length": 30
        },
        "anomaly_detector": {
            "loaded": True,
            "methods": ["zscore", "isolation_forest", "mahalanobis"]
        },
        "ensemble": {
            "method": "weighted_average",
            "rf_weight": 0.4,
            "lstm_weight": 0.3,
            "anomaly_weight": 0.3
        }
    }


# Run with: python api_server.py
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           ScamDunk AI API Server                             ║
║                                                              ║
║  Full Hybrid AI Scam Detection:                              ║
║  • Random Forest ML Classifier                               ║
║  • LSTM Deep Learning Model                                  ║
║  • Statistical Anomaly Detection                             ║
║  • Z-scores, ATR, Keltner Channels                           ║
║                                                              ║
║  Starting on http://{host}:{port}                             ║
╚══════════════════════════════════════════════════════════════╝
    """)

    uvicorn.run(app, host=host, port=port)
