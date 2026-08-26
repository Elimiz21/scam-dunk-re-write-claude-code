# ScamDunk History Database

A standalone database module for tracking historical stock risk analysis data from ScamDunk daily scans.

## Features

- **Historical Tracking**: Track how risk scores change over time for each stock
- **Daily Snapshots**: Store daily risk assessments with full price/volume data
- **Social Media Integration**: Track stocks being promoted on social media platforms
- **Risk Change Detection**: Automatic detection of risk level transitions
- **Promoted Stock Watchlist**: Monitor actively promoted stocks and their outcomes
- **Admin Dashboard**: Web-based dashboard for viewing trends and analysis
- **Query Utilities**: Command-line tools for researching historical data

## Quick Start

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Create/update database schema
npm run db:push

# Ingest latest daily evaluation
npm run ingest:daily

# Ingest social media scan results
npm run ingest:social -- --file ../evaluation/results/PRESS_REPORT_*.md

# Start the dashboard
npm run dashboard
```

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `Stock` | Master stock data (symbol, name, exchange, sector, industry) |
| `StockDailySnapshot` | Daily risk scores, prices, volumes, and signals |
| `DailyScanSummary` | Aggregate statistics for each daily scan |
| `SocialMediaScan` | Social media promotion activity records |
| `RiskAlert` | Alerts when stocks cross risk thresholds |
| `PromotedStockWatchlist` | Curated list of actively promoted stocks |
| `StockRiskChange` | Historical record of risk level changes |

### Key Fields in StockDailySnapshot

- **Risk Data**: `riskLevel`, `totalScore`, `isLegitimate`, `signals`, `signalSummary`
- **Price Data**: `openPrice`, `closePrice`, `highPrice`, `lowPrice`, `lastPrice`, `previousClose`
- **Volume Data**: `volume`, `avgVolume`, `volumeRatio`, `dollarVolume`
- **Technical**: `rsi`, `volatility`, `marketCap`

## Commands

### Ingestion

```bash
# Ingest latest daily evaluation
npm run ingest:daily

# Ingest specific date
npm run ingest:daily -- --date 2026-01-11

# Ingest specific file
npm run ingest:daily -- --file path/to/evaluation.json

# Dry run (no changes)
npm run ingest:daily -- --dry-run

# Ingest all (daily + social media)
npm run ingest:all
```

### Queries

```bash
# Get stock history
npm run query:history -- LVRO
npm run query:history -- SIDU --days 90
npm run query:history -- NVDA --format json

# Find risk changes
npm run query:changes
npm run query:changes -- --days 30
npm run query:changes -- --from LOW --to HIGH
npm run query:changes -- --type PUMP_DETECTED

# View market trends
npm run query:trends
npm run query:trends -- --days 90
npm run query:trends -- --exchange NASDAQ
npm run query:trends -- --sector Healthcare
```

### Dashboard

```bash
# Start web dashboard (default: http://localhost:3001)
npm run dashboard

# Use custom port
DASHBOARD_PORT=3002 npm run dashboard
```

## Dashboard API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/summary` | Summary statistics and daily data |
| `GET /api/alerts` | Recent risk alerts |
| `GET /api/risk-changes` | Risk level changes |
| `GET /api/stock/:symbol` | Stock history and details |
| `GET /api/promoted` | Promoted stocks watchlist |
| `GET /api/search?q=` | Search stocks by symbol/name |
| `GET /api/stats` | Database statistics |

## Configuration

Create a `.env` file (copy from `.env.example`):

```env
# PostgreSQL (production)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

# SQLite (development)
DATABASE_URL="file:./dev.db"

# Paths
EVALUATION_RESULTS_PATH="../evaluation/results"
SOCIAL_MEDIA_RESULTS_PATH="../evaluation/reports"

# Dashboard
DASHBOARD_PORT=3001
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Daily Evaluation (run-evaluation-fmp.ts)                        │
│  → Creates: fmp-evaluation-YYYY-MM-DD.json                      │
│  → Creates: fmp-summary-YYYY-MM-DD.json                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  npm run ingest:daily                                           │
│  → Reads JSON files                                             │
│  → Creates/updates Stock records                                │
│  → Creates StockDailySnapshot for each stock                    │
│  → Creates DailyScanSummary                                     │
│  → Detects risk changes from previous day                       │
│  → Creates RiskAlert and StockRiskChange records                │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Social Media Analysis (manual/automated)                        │
│  → Creates: PRESS_REPORT_*.md or similar                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  npm run ingest:social                                          │
│  → Parses markdown reports                                      │
│  → Creates SocialMediaScan records                              │
│  → Updates PromotedStockWatchlist                               │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Query & Dashboard                                              │
│  → npm run query:history SYMBOL                                 │
│  → npm run query:changes                                        │
│  → npm run query:trends                                         │
│  → npm run dashboard                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Automation

Add to your daily evaluation script or cron job:

```bash
#!/bin/bash
# After running daily evaluation...

cd scamdunk-history-db

# Ingest the new data
npm run ingest:daily

# Optionally ingest any new social media reports
npm run ingest:social

echo "Historical database updated!"
```

## Switching to PostgreSQL (Production)

1. Update `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/scamdunk_history"
   ```

2. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. Re-run migrations:
   ```bash
   npm run db:generate
   npm run db:push
   ```

## Example Queries (Direct SQL)

```sql
-- Stocks that went from LOW to HIGH in the last week
SELECT symbol, fromDate, toDate, scoreChange, priceChangePct
FROM StockRiskChange
WHERE fromRiskLevel = 'LOW' AND toRiskLevel = 'HIGH'
AND toDate >= date('now', '-7 days')
ORDER BY toDate DESC;

-- Daily high-risk count trend
SELECT date(scanDate), highRiskCount,
       (highRiskCount * 100.0 / evaluated) as highRiskPct
FROM DailyScanSummary
ORDER BY scanDate DESC
LIMIT 30;

-- Most volatile high-risk stocks
SELECT s.symbol, sds.riskLevel, sds.totalScore, sds.volatility, sds.lastPrice
FROM StockDailySnapshot sds
JOIN Stock s ON s.id = sds.stockId
WHERE sds.riskLevel = 'HIGH' AND sds.volatility IS NOT NULL
ORDER BY sds.volatility DESC
LIMIT 20;

-- Stocks promoted on social media with confirmed dumps
SELECT s.symbol, sms.promoterName, sms.gainFromPromotion, sms.scanDate
FROM SocialMediaScan sms
JOIN Stock s ON s.id = sms.stockId
WHERE sms.pumpAndDumpConfirmed = true
ORDER BY sms.scanDate DESC;
```

## License

Internal use only - Part of ScamDunk project
