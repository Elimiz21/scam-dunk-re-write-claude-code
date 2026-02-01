# Pump Signal Analysis & Social Media Scanning Plan

## January 16, 2026

---

## Signal Distribution Summary

From 1,454 HIGH risk stocks, filtering for pump signals:

| Signal | Count | Description |
|--------|-------|-------------|
| SPIKE_7D | 321 | Price moved >25% in 7 days |
| SPIKE_THEN_DROP | 305 | Pump-and-dump pattern detected |
| VOLUME_EXPLOSION | 101 | Volume 3x+ above normal |
| **Any pump signal** | 583 | Has at least one pump indicator |
| **SPIKE_7D + VOLUME** | 52 | Price spike WITH volume surge |
| **All 3 signals** | 18 | Maximum pump indicators |

---

## Priority Tier Structure

### Tier 1: EXTREME PUMPS (>100% in 7 days) - 12 stocks
Must scan ALL of these

| Symbol | Score | 7-Day Spike | Volume | Priority |
|--------|-------|-------------|--------|----------|
| EVTV | 16 | +609% | 3.1x | 🔴 CRITICAL - SCHEME-001 |
| ROLR | 13 | +549% | 4.2x | 🔴 CRITICAL |
| VERO | 11 | +426% | 3.7x | 🔴 CRITICAL |
| AHMA | 8 | +332% | 3.9x | 🔴 CRITICAL |
| ANPA | 7 | +311% | 4.0x | 🔴 CRITICAL |
| BCARW | 16 | +270% | 3.9x | 🔴 CRITICAL |
| SPHL | 9 | +238% | 4.2x | 🔴 CRITICAL |
| CJMB | 13 | +233% | 4.3x | 🔴 CRITICAL |
| LVLU | 11 | +143% | 4.2x | 🔴 CRITICAL |
| SEGG | 11 | +109% | 4.3x | 🔴 CRITICAL |
| XAIR | 15 | +105% | 4.3x | 🔴 CRITICAL |
| PELIR | 15 | +100% | 3.5x | 🔴 CRITICAL |

### Tier 2: HIGH PUMPS (50-100% in 7 days) - 13 stocks

| Symbol | Score | 7-Day Spike | Volume |
|--------|-------|-------------|--------|
| DRTSW | 14 | +98% | 3.0x |
| YI | 11 | +95% | 3.1x |
| OMH | 13 | +88% | 4.1x |
| RVMDW | 13 | +87% | 3.4x |
| PTHL | 15 | +85% | 4.2x |
| ROMA | 13 | +72% | 3.2x |
| JFBR | 11 | +69% | 3.2x |
| BIYA | 9 | +63% | 3.5x |
| JDZG | 14 | +61% | 3.6x |
| RFIL | 11 | +56% | 3.3x |
| PRFX | 11 | +55% | 4.1x |
| XTLB | 13 | +50% | 4.1x |
| SLRX | 13 | +48% | 4.0x |

### Tier 3: POST-DUMP ANALYSIS (-30% or worse) - 15 stocks
Already crashed - check for scheme attribution

| Symbol | Score | 7-Day Spike | Status |
|--------|-------|-------------|--------|
| MTEN | 14 | -97% | CRASHED |
| THH | 14 | -95% | CRASHED |
| SXTC | 14 | -95% | CRASHED - SCHEME-003? |
| SGN | 13 | -70% | CRASHED |
| ATRA | 11 | -70% | CRASHED |
| PASW | 11 | -61% | CRASHED |
| LYRA | 12 | -45% | CRASHED |
| FEED | 10 | -42% | CRASHED |
| BCTX | 13 | -40% | CRASHED |
| ZJYL | 10 | -37% | CRASHED |
| ACON | 13 | -34% | CRASHED |
| ACRV | 13 | -33% | CRASHED |
| SAFX | 10 | -31% | CRASHED |
| JTAI | 13 | -30% | CRASHED |
| ATON | 13 | -28% | CRASHED |

---

## Social Media Scanning Plan

### Method 1: Batch Web Search (Recommended for 52 stocks)
**Time estimate: 2-3 hours**

Group stocks into batches of 3-4 for combined searches:

```
Batch 1: "EVTV OR ROLR OR VERO stock pump Discord Reddit 2026"
Batch 2: "AHMA OR ANPA OR BCARW stock promoted January 2026"
Batch 3: "SPHL OR CJMB OR LVLU stock alert social media"
...
```

**Advantages:**
- Covers more stocks per search
- Finds cross-promotions (same group promoting multiple stocks)
- ~15-20 searches covers all 52 stocks

### Method 2: Platform-Specific Searches

#### Stocktwits Scan
```
Search each ticker on: https://stocktwits.com/symbol/{TICKER}
Check:
- Message volume (normal vs spike)
- Sentiment (bullish/bearish)
- User patterns (new accounts, coordinated posting)
```

#### Reddit Scan
```
Search: site:reddit.com "{TICKER}" OR "${TICKER}"
Subreddits: r/wallstreetbets, r/pennystocks, r/Shortsqueeze, r/stocks
Check:
- DD posts (due diligence - often pump setup)
- "Moon" or "rocket" mentions
- Coordinated posting times
```

#### Discord Discovery
```
Search: "{TICKER}" Discord stock alert
Look for:
- Grandmaster-Obi / Making Easy Money
- Stock picking groups with paid alerts
- Telegram cross-links
```

#### Twitter/X Scan
```
Search: ${TICKER} OR #{TICKER} stock
Check:
- Cashtag volume
- Influencer mentions
- Bot patterns
```

### Method 3: Automated Pipeline (Future Implementation)

```python
# Conceptual script structure
for ticker in pump_candidates:
    stocktwits_data = scrape_stocktwits(ticker)
    reddit_mentions = search_reddit(ticker)
    twitter_volume = get_cashtag_volume(ticker)

    if stocktwits_data.message_volume > 10x_normal:
        flag_for_review(ticker, "STOCKTWITS_SPIKE")

    if reddit_mentions.count > threshold:
        flag_for_review(ticker, "REDDIT_PUMP")
```

---

## Execution Plan

### Phase 1: Immediate (Today)
**Target: 12 Tier 1 EXTREME pumps**

| Batch | Symbols | Search Query |
|-------|---------|--------------|
| 1 | EVTV, ROLR, VERO | "EVTV OR ROLR OR VERO stock pump Discord 2026" |
| 2 | AHMA, ANPA, BCARW | "AHMA OR ANPA OR BCARW stock alert promoted 2026" |
| 3 | SPHL, CJMB, LVLU | "SPHL OR CJMB OR LVLU stock pump social media" |
| 4 | SEGG, XAIR, PELIR | "SEGG OR XAIR OR PELIR stock alert Discord Reddit" |

### Phase 2: Extended (Next Session)
**Target: 13 Tier 2 HIGH pumps**

| Batch | Symbols | Search Query |
|-------|---------|--------------|
| 5 | DRTSW, YI, OMH | "DRTSW OR YI OR OMH stock pump 2026" |
| 6 | RVMDW, PTHL, ROMA | "RVMDW OR PTHL OR ROMA stock promoted alert" |
| 7 | JFBR, BIYA, JDZG | "JFBR OR BIYA OR JDZG stock pump Discord" |
| 8 | RFIL, PRFX, XTLB, SLRX | "RFIL OR PRFX OR XTLB OR SLRX stock alert" |

### Phase 3: Attribution (Following)
**Target: 15 Tier 3 CRASHED stocks**
- Match crashed stocks to known schemes
- Identify promotion timeline
- Document for pattern library

---

## Efficiency Metrics

| Approach | Stocks/Hour | Coverage | Depth |
|----------|-------------|----------|-------|
| Individual searches | 5-8 | Complete | High |
| Batch searches (3-4) | 15-20 | Good | Medium |
| Platform-specific | 10-15 | Focused | High |
| Automated (future) | 100+ | Complete | Variable |

**Recommended approach for 52 stocks:**
- Use batch searches for initial sweep (2 hours)
- Deep-dive individual searches on flagged stocks (1-2 hours)
- Total: 3-4 hours for comprehensive coverage

---

## All 52 Pump Candidate Symbols

```
EVTV, ROLR, VERO, AHMA, ANPA, BCARW, SPHL, CJMB, LVLU, SEGG,
XAIR, PELIR, DRTSW, YI, OMH, RVMDW, PTHL, ROMA, JFBR, BIYA,
JDZG, RFIL, PRFX, XTLB, SLRX, MLECW, GP, VLN, LCFY, BDSX,
KELYB, PMAX, AUID, JAGX, CNSP, MTEN, THH, SXTC, SGN, ATRA,
PASW, LYRA, FEED, BCTX, ZJYL, ACON, ACRV, SAFX, JTAI, ATON,
RAYA, ICON
```

---

## Machine-Readable Data

```json
{
  "analysisDate": "2026-01-16",
  "totalHighRisk": 1454,
  "pumpCandidates": 52,
  "tiers": {
    "tier1_extreme": {
      "count": 12,
      "criteria": ">100% spike in 7 days",
      "symbols": ["EVTV", "ROLR", "VERO", "AHMA", "ANPA", "BCARW", "SPHL", "CJMB", "LVLU", "SEGG", "XAIR", "PELIR"]
    },
    "tier2_high": {
      "count": 13,
      "criteria": "50-100% spike in 7 days",
      "symbols": ["DRTSW", "YI", "OMH", "RVMDW", "PTHL", "ROMA", "JFBR", "BIYA", "JDZG", "RFIL", "PRFX", "XTLB", "SLRX"]
    },
    "tier3_crashed": {
      "count": 15,
      "criteria": "-30% or worse in 7 days (already dumped)",
      "symbols": ["MTEN", "THH", "SXTC", "SGN", "ATRA", "PASW", "LYRA", "FEED", "BCTX", "ZJYL", "ACON", "ACRV", "SAFX", "JTAI", "ATON"]
    }
  },
  "scanPlan": {
    "batchCount": 8,
    "estimatedHours": 3,
    "method": "batch_web_search"
  }
}
```

---

*Report generated: January 16, 2026*
