# Daily Summary Documents

This folder contains daily comparison summaries of our risk evaluation scans. Each document tracks changes between consecutive days to help identify trends, monitor specific companies, and improve our detection capabilities over time.

## Naming Convention

Files are named using the format: `YYYY-MM-DD_daily_summary.md`

Example: `2026-01-12_daily_summary.md`

## Document Structure

Each daily summary contains the following sections:

### 1. Metadata
- Date of analysis
- Comparison period (current vs previous day)
- Data sources used
- Scan completion status

### 2. Executive Summary
- Quick overview of key changes
- Net HIGH risk stock changes
- Most significant findings

### 3. Risk Distribution Changes
- Total counts by risk level (HIGH, MEDIUM, LOW)
- Changes from previous day
- Breakdown by exchange

### 4. Signal Analysis
- Signal distribution across HIGH risk stocks
- Signal count changes from previous day
- Interpretation of signal trends

### 5. New HIGH Risk Stocks
- Complete list of stocks that entered HIGH risk
- Signal breakdown for each stock
- Classification by signal type (pattern vs structural)

### 6. Dropped HIGH Risk Stocks
- Complete list of stocks that exited HIGH risk
- Reason for drop (spike normalized, dump completed, etc.)
- Previous signals when at HIGH risk

### 7. Promoted Stocks Tracking
- Status of known promoted stocks (Grandmaster-Obi ecosystem)
- Current signals and risk level
- Price performance tracking
- Lifecycle stage (pump vs dump phase)

### 8. Social Media Findings
- New promotional articles discovered
- Platform-specific activity
- Sentiment analysis
- New promotion announcements

### 9. Potential New Targets
- Stocks with extreme signals not yet promoted
- Micro-cap stocks with volume anomalies
- Watch list for potential future promotions

### 10. Trend Analysis
- Multi-day trends if data available
- Pattern observations
- Scan performance metrics

### 11. Machine-Readable Data
- JSON block at the end of each document
- Contains structured data for programmatic analysis
- Enables trend tracking across multiple days

## Usage for Research

### Finding Specific Companies
Use grep to search across all summaries:
```bash
grep -r "SYMBOL" daily-summaries/
```

### Tracking Trends
The JSON data blocks can be extracted and analyzed:
```bash
grep -A 1000 "```json" daily-summaries/*.md | grep -B 1000 "```"
```

### Understanding Scan Performance
Look for the "Scan Metrics" section in each document to compare:
- Total stocks evaluated
- API calls made
- Processing time
- Success rate

## Contributing

When creating new daily summaries:
1. Use the established template format
2. Include all required sections
3. Add machine-readable JSON data
4. Cross-reference with previous day's findings
5. Note any new promoted stocks or social media activity

## Related Files

- `../fmp-evaluation-YYYY-MM-DD.json` - Full evaluation data
- `../fmp-high-risk-YYYY-MM-DD.json` - HIGH risk stocks
- `../fmp-summary-YYYY-MM-DD.json` - Summary statistics
- `../COMPREHENSIVE_REPORT_*.md` - Detailed reports
