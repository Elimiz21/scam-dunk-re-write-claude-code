# ScamDunk AI Backend

Full hybrid AI scam detection system with ML models.

## Features

- **Random Forest Classifier** - Trained on synthetic scam patterns
- **LSTM Deep Learning** - Sequence analysis for temporal patterns
- **Statistical Anomaly Detection** - Z-score, Isolation Forest, Mahalanobis distance
- **Feature Engineering** - Rolling Z-scores, ATR, Keltner Channels, RSI, surge metrics
- **Model Ensemble** - Weighted combination with probability calibration
- **SEC Integration** - Regulatory flagged tickers list

## Quick Start

### Local Development

```bash
# Install dependencies
cd python_ai
pip install -r requirements.txt

# Run the API server
python api_server.py

# Or with uvicorn directly
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
```

### Docker

```bash
# Build and run
docker-compose up

# Or build manually
docker build -t scamdunk-ai .
docker run -p 8000:8000 scamdunk-ai
```

## API Endpoints

### Health Check
```
GET /health
```

Returns model status and availability.

### Analyze Asset
```
POST /analyze
Content-Type: application/json

{
  "ticker": "SVRE",
  "asset_type": "stock",
  "use_live_data": false,
  "days": 90
}
```

Returns full analysis with:
- Risk level (LOW/MEDIUM/HIGH)
- Risk probability (0.0 - 1.0)
- RF and LSTM probabilities
- Anomaly score
- Signals detected
- Feature highlights
- Explanations

### SEC Check
```
GET /sec-check/{ticker}
```

Checks if a ticker is on the SEC flagged list.

### Model Status
```
GET /models/status
```

Returns detailed model status.

## Deployment Options

### Railway
1. Create new project from GitHub
2. Set root directory to `python_ai`
3. Add environment variables if needed
4. Deploy

### Render
1. Create new Web Service
2. Connect GitHub repo
3. Set root directory: `python_ai`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn api_server:app --host 0.0.0.0 --port $PORT`

### Google Cloud Run
```bash
# Build and push
gcloud builds submit --tag gcr.io/YOUR_PROJECT/scamdunk-ai

# Deploy
gcloud run deploy scamdunk-ai \
  --image gcr.io/YOUR_PROJECT/scamdunk-ai \
  --platform managed \
  --allow-unauthenticated
```

### Heroku
```bash
# Create Procfile
echo "web: uvicorn api_server:app --host 0.0.0.0 --port \$PORT" > Procfile

# Deploy
heroku create scamdunk-ai
heroku config:set PYTHON_VERSION=3.11
git push heroku main
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8000 |
| `HOST` | Server host | 0.0.0.0 |
| `ALPHA_VANTAGE_API_KEY` | For live market data | None |

## Integration with Next.js Web App

Set the `AI_BACKEND_URL` environment variable in your Next.js app:

```env
AI_BACKEND_URL=https://your-deployed-ai-backend.com
```

The web app will automatically use the Python AI backend when available, falling back to TypeScript scoring if not.

## Model Training

Models are automatically trained on first run if not found. To manually retrain:

```python
from pipeline import ScamDetectionPipeline

pipeline = ScamDetectionPipeline(load_models=False)
pipeline.train_models(
    train_rf=True,
    train_lstm=True,
    lstm_epochs=50,
    save_models=True
)
```

## Testing

```bash
# Run pipeline tests
python -m pytest

# Test the main pipeline
python pipeline.py

# Test with live data (requires API key)
python main.py --live --ticker SVRE
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Server (FastAPI)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │  Data       │  │  Feature    │  │  Anomaly             │  │
│  │  Ingestion  │──│  Engineering│──│  Detection           │  │
│  └─────────────┘  └─────────────┘  └──────────────────────┘  │
│         │                                    │               │
│         ▼                                    ▼               │
│  ┌─────────────┐                    ┌──────────────────────┐ │
│  │  Random     │                    │  LSTM Deep Learning  │ │
│  │  Forest     │                    │  Model               │ │
│  └─────────────┘                    └──────────────────────┘ │
│         │                                    │               │
│         └──────────────┬─────────────────────┘               │
│                        ▼                                     │
│               ┌──────────────────┐                           │
│               │  Model Ensemble  │                           │
│               │  & Calibration   │                           │
│               └──────────────────┘                           │
│                        │                                     │
│                        ▼                                     │
│               ┌──────────────────┐                           │
│               │  Risk Assessment │                           │
│               │  LOW/MEDIUM/HIGH │                           │
│               └──────────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
