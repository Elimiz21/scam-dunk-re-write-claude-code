# ScamDunk Scoring Methodology

This document explains how ScamDunk analyzes stocks for potential scam indicators and the reasoning behind each check.

## Philosophy

ScamDunk uses **deterministic scoring** - the AI (LLM) is **not** involved in calculating risk scores. The LLM is only used to generate human-readable narrative text from the results. This ensures consistent, predictable, and auditable risk assessments.

The scoring system is designed to detect patterns commonly associated with pump-and-dump schemes and stock manipulation, while avoiding false positives on legitimate investments.

---

## Signal Categories

Signals are organized into four categories:

| Category | Purpose | Examples |
|----------|---------|----------|
| **STRUCTURAL** | Stock characteristics that make it vulnerable to manipulation | Penny stock price, small market cap, low liquidity |
| **PATTERN** | Suspicious price/volume movements | Sudden spikes, volume explosions, pump-and-dump patterns |
| **ALERT** | Regulatory warnings | SEC suspension list matches |
| **BEHAVIORAL** | Red flags in how the stock was pitched to you | Urgency tactics, guaranteed returns, insider info claims |

---

## Structural Signals

These signals identify stocks that are inherently more vulnerable to manipulation due to their market characteristics.

### MICROCAP_PRICE (Weight: 2)
**Trigger:** Stock price < $5

**Reasoning:** Penny stocks (under $5) are a favorite target for manipulation because:
- Low prices mean small dollar amounts can cause large percentage swings
- Less institutional ownership and analyst coverage
- Often excluded from major indices and institutional portfolios
- SEC penny stock rules exist specifically because of manipulation concerns

### SMALL_MARKET_CAP (Weight: 2)
**Trigger:** Market cap < $300 million

**Reasoning:** Small-cap companies are more susceptible to manipulation because:
- Fewer shares to accumulate for control
- Less liquidity makes price easier to move
- Less media and analyst attention
- Scammers can "pump" with relatively small capital

### MICRO_LIQUIDITY (Weight: 2)
**Trigger:** 30-day average daily dollar volume < $150,000

**Reasoning:** Low liquidity creates vulnerability because:
- Small trades can significantly impact price
- Difficult to exit positions without moving the market
- Scammers can create artificial price movements with minimal capital
- Victims may be unable to sell when they realize the scam

### OTC_EXCHANGE (Weight: 3)
**Trigger:** Stock trades on OTC markets (OTC, OTCQX, OTCQB, Pink Sheets)

**Reasoning:** OTC stocks have higher risk because:
- Less regulatory oversight than major exchanges (NYSE, NASDAQ)
- Lower listing requirements
- Less transparency in company reporting
- Historically the venue for most pump-and-dump schemes
- SEC has specifically warned about OTC stock fraud

---

## Pattern Signals

These signals detect suspicious price and volume movements that may indicate manipulation in progress.

### SPIKE_7D (Weight: 3-4)
**Trigger:**
- 50-100% price increase in 7 days = Weight 3
- 100%+ price increase in 7 days = Weight 4

**Reasoning:** Rapid price spikes are a hallmark of pump schemes:
- Legitimate stocks rarely double in a week without major news
- Coordinated buying by promoters creates artificial demand
- The "pump" phase of pump-and-dump creates these patterns
- Higher weights for more extreme spikes indicate higher manipulation probability

### VOLUME_EXPLOSION (Weight: 2-3)
**Trigger:**
- Recent 7-day volume is 5-10x the 30-day average = Weight 2
- Recent 7-day volume is 10x+ the 30-day average = Weight 3

**Reasoning:** Abnormal volume often precedes or accompanies manipulation:
- Promoters generate artificial trading activity
- "Wash trading" creates appearance of interest
- Social media pump campaigns drive retail volume spikes
- Legitimate volume increases are usually gradual, not explosive

### SPIKE_THEN_DROP (Weight: 3)
**Trigger:** Price spiked 50%+ then dropped 40%+ from the local maximum within 15 days

**Reasoning:** This is the classic pump-and-dump signature:
- Promoters pump the stock (50%+ spike)
- Insiders sell at the top
- Price collapses as artificial demand disappears (40%+ drop)
- This pattern strongly suggests completed manipulation
- Victims bought during the pump and lost money in the dump

---

## Alert Signals

### ALERT_LIST_HIT (Weight: 5)
**Trigger:** Stock appears on SEC trading suspension list

**Reasoning:** Regulatory alerts are the strongest indicator:
- SEC suspends trading specifically for fraud concerns
- Automatic HIGH risk classification regardless of score
- These stocks have already been identified as problems by regulators
- May include stocks suspended for failure to file, suspected fraud, or market manipulation

---

## Behavioral Signals

These signals analyze how the stock was presented to you, not the stock itself. Scammers follow predictable psychological manipulation patterns.

### UNSOLICITED (Weight: 1)
**Trigger:** User indicates they received the tip without asking

**Reasoning:** Unsolicited tips are a classic scam delivery method:
- Legitimate investment advisors don't cold-call strangers
- Mass email/text campaigns are used to pump stocks
- "Hot tips" from strangers should always raise suspicion
- Lower weight because unsolicited tips can occasionally be legitimate

### PROMISED_RETURNS (Weight: 2)
**Trigger:** User toggle OR pitch text contains keywords like "guaranteed", "risk-free", "100%", "double your money", "can't lose"

**Reasoning:** No legitimate investment can guarantee returns:
- Markets are inherently unpredictable
- Guaranteed returns claims are often illegal
- This language is a textbook red flag for fraud
- SEC specifically warns about "guaranteed" return promises

**Keywords detected:**
- guaranteed, guaranteed return, guaranteed profit
- 100%, double your money, triple your money
- 10x, 100x, 1000%
- can't lose, risk-free, sure thing
- easy money, get rich, millionaire

### URGENCY (Weight: 2)
**Trigger:** User toggle OR pitch text contains urgency language

**Reasoning:** Scammers create false urgency to prevent due diligence:
- Legitimate investments don't require immediate action
- Urgency prevents victims from researching or consulting advisors
- "Fear of missing out" (FOMO) is deliberately manufactured
- Time pressure is a standard psychological manipulation tactic

**Keywords detected:**
- act now, act fast, limited time
- expires, today only, last chance
- don't miss, hurry, urgent, immediately
- before it's too late, running out
- few hours, few days

### SECRECY (Weight: 2)
**Trigger:** User toggle OR pitch text suggests insider/secret information

**Reasoning:** Claims of secret information are almost always fraudulent:
- Trading on actual insider info is illegal
- If they had real insider info, why share it with strangers?
- "Exclusive" tips are mass-distributed to thousands
- This creates false sense of privileged access

**Keywords detected:**
- insider, insider info, confidential, secret
- don't tell, keep quiet, exclusive
- private tip, behind closed doors
- not public, before announcement

### SPECIFIC_RETURN_CLAIM (Weight: 1)
**Trigger:** Pitch text matches pattern like "X% in Y days/weeks/months"

**Reasoning:** Specific return predictions are a red flag:
- No one can reliably predict specific percentage gains
- These claims create false expectations
- Often used in pump schemes: "This will 10x in 2 weeks"
- Lower weight because sometimes used in legitimate (if overly optimistic) analysis

---

## Risk Level Calculation

### Score Thresholds

| Risk Level | Condition |
|------------|-----------|
| **HIGH** | Total score ≥ 7 OR Alert list hit |
| **MEDIUM** | Total score 3-6 |
| **LOW** | Total score < 3 |
| **INSUFFICIENT** | No market data available |

### Legitimate Company Detection

Stocks meeting ALL of these criteria are flagged as "legitimate" with a positive narrative:
- Market cap > $10 billion
- Daily volume > $10 million
- Listed on major exchange (not OTC)
- Zero risk signals triggered

This prevents well-known companies like AAPL, MSFT, etc. from showing negative messaging when they have no red flags.

---

## Data Sources

### Market Data
- **Provider:** Alpha Vantage API
- **Data points:** Current price, market cap, trading volume, 30-day price history
- **Coverage:** US stocks only (NYSE, NASDAQ, OTC markets)
- **Caching:** 5-minute cache to reduce API calls

### Alert Lists
- **Source:** SEC EDGAR trading suspension database
- **Updated:** Real-time check on each scan
- **Scope:** Currently SEC suspensions only

---

## Limitations & Disclaimers

1. **Not financial advice** - ScamDunk provides informational analysis only
2. **US markets only** - International stocks are not currently supported
3. **Cannot detect all scams** - Sophisticated fraud may evade detection
4. **False positives possible** - Legitimate volatile stocks may trigger pattern signals
5. **Data delays** - Market data may be delayed up to 15 minutes
6. **Historical patterns** - Past manipulation patterns don't guarantee future detection

---

## Example Scenarios

### Scenario 1: Clear Pump-and-Dump
```
Stock: SCAM (fictional)
- Price: $0.02 (MICROCAP_PRICE: +2)
- Market Cap: $5M (SMALL_MARKET_CAP: +2)
- Volume: $20K/day (MICRO_LIQUIDITY: +2)
- Exchange: Pink Sheets (OTC_EXCHANGE: +3)
- 7-day price spike: +150% (SPIKE_7D: +4)
- Unsolicited tip (UNSOLICITED: +1)
- "This will 10x in 2 weeks" (SPECIFIC_RETURN_CLAIM: +1)

Total Score: 15 → HIGH RISK
```

### Scenario 2: Legitimate Blue Chip
```
Stock: AAPL
- Price: $180
- Market Cap: $2.8T
- Volume: $8B/day
- Exchange: NASDAQ
- No unusual price/volume patterns
- No behavioral red flags

Total Score: 0 → LOW RISK (flagged as legitimate)
```

### Scenario 3: Speculative Small Cap
```
Stock: NEWCO (fictional)
- Price: $3.50 (MICROCAP_PRICE: +2)
- Market Cap: $150M (SMALL_MARKET_CAP: +2)
- Volume: $500K/day
- Exchange: NASDAQ
- No unusual patterns

Total Score: 4 → MEDIUM RISK
```

---

## Updates & Versioning

This methodology may be updated as new manipulation tactics emerge. The current version reflects patterns documented in SEC enforcement actions and academic research on market manipulation.

Last updated: December 2024
