# HIGH Risk Stock Social Media Scan Report: January 16, 2026

---

## Scan Metadata

| Field | Value |
|-------|-------|
| **Scan Date** | January 16, 2026 |
| **Scan Type** | Targeted (HIGH Risk Stocks from FMP Evaluation) |
| **Data Source** | FMP Evaluation 2026-01-17 |
| **Total HIGH Risk Stocks** | 1,454 |
| **Purpose** | Cross-reference HIGH risk stocks with social media activity |

---

## Executive Summary

The January 17 FMP evaluation identified **1,454 HIGH risk stocks** across US exchanges. This targeted scan cross-references these stocks with known social media pump schemes and discovers overlap between quantitative risk signals and social media promotion.

### Key Cross-Reference Findings

| Stock | FMP Score | Social Media Status | Scheme |
|-------|-----------|---------------------|--------|
| **EVTV** | 16 | CONFIRMED PROMOTED | SCHEME-001 (Grandmaster-Obi) |
| BCARW | 16 | Not detected | - |
| PTHL | 15 | Not detected | - |
| XAIR | 15 | Not detected | - |

---

## SCHEME-001 Stocks Found in HIGH Risk List

### EVTV (Envirotech Vehicles) - CRITICAL

| Metric | Value |
|--------|-------|
| **FMP Risk Score** | 16 (Highest tier) |
| **Exchange** | NASDAQ |
| **Market Cap** | $12.5 million |
| **Last Price** | $3.55 |
| **Discord Alert Price** | $0.78 (Jan 13) |
| **Return from Alert** | +355% |

#### Risk Signals Detected
1. **SPIKE_7D**: +609% in 7 days
2. **SPIKE_THEN_DROP**: Pump-and-dump pattern confirmed
3. **VOLUME_EXPLOSION**: 3.1x normal volume
4. **OVERBOUGHT_RSI**: RSI at 86
5. **HIGH_VOLATILITY**: 114.1% daily volatility
6. **MICROCAP_PRICE**: Below $5
7. **SMALL_MARKET_CAP**: $13M

#### Social Media Activity
- **Discord**: Promoted by Grandmaster-Obi (Making Easy Money) on January 13
- **Stocktwits**: HIGH activity
- **Assessment**: CONFIRMED PUMP - FMP signals perfectly align with social media promotion

---

## Stocks From Social Media Scan NOT in FMP Universe

The following stocks were identified in the general social media scan but were not found in the FMP US stocks universe (likely OTC/micro-cap not covered by FMP):

| Symbol | Social Media Status | Likely Reason Not in FMP |
|--------|---------------------|--------------------------|
| SPHL | Grandmaster-Obi (+1,057%) | Too small/OTC |
| VERO | +700% delisting play | Too small/OTC |
| JFBR | +230% defense deal | Too small/OTC |
| ANPA | Grandmaster-Obi (+640%) | Too small/OTC |
| MRNO | Grandmaster-Obi (+233%) | Too small/OTC |
| MLGO | Reddit trending | Too small/OTC |
| JTAI | +350% acquisition news | Too small/OTC |
| RGTI | Quantum pump then dump | Ticker may differ |
| SMX | Extreme volatility | Too small/OTC |
| SIDU | Space theme (+82%) | Too small/OTC |
| SXTC | SCHEME-003 | Too small/OTC |
| VLN | SCHEME-003 | Too small/OTC |
| AQST | SCHEME-001 | May be in list |

**Note**: Many pump-and-dump targets are deliberately chosen as micro-cap/OTC stocks that fall outside standard market data coverage. This makes FMP detection more valuable for finding additional manipulation candidates.

---

## Top HIGH Risk Stocks by Signal Severity

### Score 16 (Maximum Detected)

| Symbol | Name | Key Signals | Assessment |
|--------|------|-------------|------------|
| **EVTV** | Envirotech Vehicles | All 7 signals | SCHEME-001 CONFIRMED |
| **BCARW** | D. Boral ARC Warrant | All 7 signals | Shell company warrant |

### Score 15

| Symbol | Name | Key Signals | Assessment |
|--------|------|-------------|------------|
| PTHL | Pheton Holdings | 6 signals + MICRO_LIQUIDITY | IPO manipulation risk |
| XAIR | Beyond Air | 6 signals | Healthcare micro-cap |

---

## Social Media Platform Analysis

### Discord Activity on HIGH Risk Stocks

| Server | Known Promoted Stocks | FMP Overlap |
|--------|----------------------|-------------|
| Making Easy Money (17,258 members) | EVTV, ANPA, SPHL, MRNO | EVTV confirmed |
| Other trading servers | Various | Under investigation |

### Reddit Activity on HIGH Risk Stocks

| Subreddit | Activity Level | Notable Stocks |
|-----------|----------------|----------------|
| r/WallStreetBets | HIGH | Quantum stocks post-crash |
| r/pennystocks | HIGH | Multiple HIGH risk matches |
| r/stocks | MODERATE | Some overlap |

### Stocktwits Trending Analysis

Cross-referencing Stocktwits trending with FMP HIGH risk list revealed elevated activity on:
- EVTV (confirmed SCHEME-001)
- Multiple biotech micro-caps
- Recent IPOs with pump signals

---

## New Potential Scheme Candidates

### From FMP HIGH Risk Analysis (Not Previously Tracked)

Stocks with maximum risk scores (15-16) warranting social media investigation:

| Symbol | Score | Signals | Sector |
|--------|-------|---------|--------|
| BCARW | 16 | Full pattern | SPAC Warrant |
| PTHL | 15 | Micro-cap IPO | Healthcare |
| XAIR | 15 | Full pattern | Medical Devices |

**Status**: Queued for social media monitoring

---

## Cross-Reference Statistics

### FMP HIGH Risk Distribution

| Exchange | HIGH Risk Count | % of Total |
|----------|-----------------|------------|
| NASDAQ | 1,287 | 88.5% |
| AMEX | 87 | 6.0% |
| NYSE | 75 | 5.2% |
| OTC | 5 | 0.3% |

### Signal Frequency in HIGH Risk Stocks

| Signal | Frequency | Description |
|--------|-----------|-------------|
| MICROCAP_PRICE | Very High | Most HIGH risk stocks are penny stocks |
| SMALL_MARKET_CAP | Very High | Small cap enables manipulation |
| SPIKE_7D | High | Recent price explosions |
| VOLUME_EXPLOSION | Moderate | Unusual trading activity |
| SPIKE_THEN_DROP | Moderate | Pump-and-dump pattern |
| OVERBOUGHT_RSI | Moderate | Technical overbought |

---

## Recommendations

### Immediate Actions

1. **Monitor EVTV** - Confirmed SCHEME-001 stock in HIGH risk list
2. **Track BCARW** - Maximum score, SPAC warrant (high manipulation risk)
3. **Investigate PTHL** - Recent IPO with pump signals

### Investigation Items

- [ ] Cross-reference BCARW with social media for promotion activity
- [ ] Monitor PTHL for emerging promotion campaigns
- [ ] Expand FMP coverage to include more OTC stocks if possible
- [ ] Track EVTV for dump phase entry

### Data Quality Notes

- 420 stocks skipped due to no data available
- Many social media promoted stocks are OTC/micro-cap not in FMP universe
- Consider supplementary data sources for OTC coverage

---

## Machine-Readable Data

```json
{
  "scanMetadata": {
    "scanDate": "2026-01-16",
    "scanType": "targeted_high_risk",
    "fmpEvaluationDate": "2026-01-17",
    "totalHighRiskStocks": 1454
  },
  "schemeOverlap": {
    "scheme001": {
      "evtv": {
        "fmpScore": 16,
        "alertPrice": 0.78,
        "currentPrice": 3.55,
        "return": "+355%",
        "signals": ["SPIKE_7D", "SPIKE_THEN_DROP", "VOLUME_EXPLOSION", "OVERBOUGHT_RSI", "HIGH_VOLATILITY", "MICROCAP_PRICE", "SMALL_MARKET_CAP"]
      }
    },
    "notInFmpUniverse": ["SPHL", "VERO", "JFBR", "ANPA", "MRNO", "MLGO", "JTAI", "SMX", "SIDU", "SXTC", "VLN"]
  },
  "topRiskStocks": [
    {"symbol": "EVTV", "score": 16, "socialMediaConfirmed": true},
    {"symbol": "BCARW", "score": 16, "socialMediaConfirmed": false},
    {"symbol": "PTHL", "score": 15, "socialMediaConfirmed": false},
    {"symbol": "XAIR", "score": 15, "socialMediaConfirmed": false}
  ],
  "exchangeDistribution": {
    "NASDAQ": 1287,
    "AMEX": 87,
    "NYSE": 75,
    "OTC": 5
  }
}
```

---

*Report generated: January 16, 2026*
*ScamDunk Targeted HIGH Risk Social Media Scan v1.0*
*Cross-referenced with FMP Evaluation dated 2026-01-17*

