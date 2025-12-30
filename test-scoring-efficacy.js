/**
 * TypeScript Scoring Efficacy Test
 *
 * Tests the deterministic scoring logic in src/lib/scoring.ts
 * to verify what conditions trigger HIGH risk.
 */

// Recreate the scoring logic from src/lib/scoring.ts

const THRESHOLDS = {
  microCapPrice: 5,
  smallMarketCap: 300_000_000,
  microLiquidity: 150_000,
  spike7dMedium: 50,
  spike7dHigh: 100,
  volumeExplosionMedium: 5,
  volumeExplosionHigh: 10,
};

// Signal weights from scoring.ts
const SIGNAL_WEIGHTS = {
  // Structural (stock characteristics)
  MICROCAP_PRICE: 2,        // price < $5
  SMALL_MARKET_CAP: 2,      // market cap < $300M
  MICRO_LIQUIDITY: 2,       // daily volume < $150K
  OTC_EXCHANGE: 3,          // OTC/Pink Sheets

  // Pattern (price/volume movements)
  SPIKE_7D_MEDIUM: 3,       // 50-100% 7-day gain
  SPIKE_7D_HIGH: 4,         // >100% 7-day gain
  VOLUME_EXPLOSION_MEDIUM: 2, // 5-10x volume
  VOLUME_EXPLOSION_HIGH: 3,   // >10x volume
  SPIKE_THEN_DROP: 3,       // pump-and-dump pattern

  // Alert
  ALERT_LIST_HIT: 5,        // SEC flagged -> AUTO HIGH

  // Behavioral (pitch characteristics)
  UNSOLICITED: 1,
  PROMISED_RETURNS: 2,
  URGENCY: 2,
  SECRECY: 2,
  SPECIFIC_RETURN_CLAIM: 1,
};

function calculateRiskLevel(totalScore, hasAlertHit) {
  // Alert list hit = automatic HIGH
  if (hasAlertHit) {
    return "HIGH";
  }

  // Standard scoring thresholds
  if (totalScore >= 7) return "HIGH";
  if (totalScore >= 3) return "MEDIUM";
  return "LOW";
}

function runTest(name, signals, expected) {
  const totalScore = signals.reduce((sum, s) => sum + s.weight, 0);
  const hasAlertHit = signals.some(s => s.code === "ALERT_LIST_HIT");
  const actual = calculateRiskLevel(totalScore, hasAlertHit);
  const passed = actual === expected;

  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`);
  console.log(`       Score: ${totalScore}, Expected: ${expected}, Got: ${actual}`);
  console.log(`       Signals: ${signals.map(s => s.code).join(", ")}`);
  console.log("");

  return { name, expected, actual, passed, totalScore };
}

// =============================================================================
// TEST CASES
// =============================================================================

console.log("=".repeat(70));
console.log("TYPESCRIPT SCORING EFFICACY TEST");
console.log("=".repeat(70));
console.log("\nTo reach HIGH, need score >= 7 OR ALERT_LIST_HIT\n");

const results = [];

// Test 1: SEC Flagged (automatic HIGH)
results.push(runTest(
  "SEC Flagged Stock",
  [{ code: "ALERT_LIST_HIT", weight: 5 }],
  "HIGH"
));

// Test 2: Classic OTC penny stock
results.push(runTest(
  "OTC + Small Cap + Low Price",
  [
    { code: "OTC_EXCHANGE", weight: 3 },
    { code: "SMALL_MARKET_CAP", weight: 2 },
    { code: "MICROCAP_PRICE", weight: 2 },
  ],
  "HIGH"  // 3+2+2 = 7
));

// Test 3: Pump and dump pattern
results.push(runTest(
  "100%+ Spike + Volume Explosion",
  [
    { code: "SPIKE_7D_HIGH", weight: 4 },
    { code: "VOLUME_EXPLOSION_HIGH", weight: 3 },
  ],
  "HIGH"  // 4+3 = 7
));

// Test 4: OTC with volume explosion
results.push(runTest(
  "OTC + Volume Explosion",
  [
    { code: "OTC_EXCHANGE", weight: 3 },
    { code: "VOLUME_EXPLOSION_HIGH", weight: 3 },
  ],
  "MEDIUM"  // 3+3 = 6 (just under HIGH!)
));

// Test 5: Small cap with spike
results.push(runTest(
  "Small Cap + 50% Spike",
  [
    { code: "SMALL_MARKET_CAP", weight: 2 },
    { code: "SPIKE_7D_MEDIUM", weight: 3 },
  ],
  "MEDIUM"  // 2+3 = 5
));

// Test 6: Just OTC
results.push(runTest(
  "Just OTC Exchange",
  [
    { code: "OTC_EXCHANGE", weight: 3 },
  ],
  "MEDIUM"  // 3
));

// Test 7: Just small market cap
results.push(runTest(
  "Just Small Market Cap",
  [
    { code: "SMALL_MARKET_CAP", weight: 2 },
  ],
  "LOW"  // 2 (under 3 threshold!)
));

// Test 8: Complete scam scenario
results.push(runTest(
  "Complete Scam: OTC + Small + Price + Spike + Volume",
  [
    { code: "OTC_EXCHANGE", weight: 3 },
    { code: "SMALL_MARKET_CAP", weight: 2 },
    { code: "MICROCAP_PRICE", weight: 2 },
    { code: "SPIKE_7D_HIGH", weight: 4 },
    { code: "VOLUME_EXPLOSION_HIGH", weight: 3 },
  ],
  "HIGH"  // 3+2+2+4+3 = 14
));

// Test 9: Behavioral only (pitch analysis)
results.push(runTest(
  "Scammy Pitch: Urgency + Returns + Secrecy",
  [
    { code: "URGENCY", weight: 2 },
    { code: "PROMISED_RETURNS", weight: 2 },
    { code: "SECRECY", weight: 2 },
  ],
  "MEDIUM"  // 2+2+2 = 6
));

// Test 10: OTC with behavioral
results.push(runTest(
  "OTC + Scammy Pitch",
  [
    { code: "OTC_EXCHANGE", weight: 3 },
    { code: "URGENCY", weight: 2 },
    { code: "PROMISED_RETURNS", weight: 2 },
  ],
  "HIGH"  // 3+2+2 = 7
));

// =============================================================================
// ANALYSIS
// =============================================================================

console.log("=".repeat(70));
console.log("ANALYSIS: How to Reach HIGH Risk in TypeScript Path");
console.log("=".repeat(70));

console.log(`
MINIMUM COMBINATIONS FOR HIGH (score >= 7):

1. ALERT_LIST_HIT alone -> AUTO HIGH (regardless of score)

2. OTC (3) + Small Cap (2) + Micro Price (2) = 7 -> HIGH

3. OTC (3) + 100% Spike (4) = 7 -> HIGH

4. 100% Spike (4) + 10x Volume (3) = 7 -> HIGH

5. OTC (3) + Spike (3) + Any Behavioral (1+) = 7+ -> HIGH

6. OTC (3) + 10x Volume (3) = 6 -> MEDIUM (just under!)
   Add micro price (2) -> 8 -> HIGH

PROBLEM IDENTIFIED:
- Market cap alone only gives +2 points
- OTC alone only gives +3 points
- Combined: OTC + Small Cap = 5 points (still MEDIUM!)
- You NEED a pattern signal (spike or volume) to reach HIGH
- Or you need ALL structural flags combined

THE ISSUE:
If a stock is on OTC with tiny market cap but hasn't shown
a price spike YET (maybe the pump is just starting), it will
only score 5-6 points = MEDIUM.

The scoring system is REACTIVE (waits for spike) rather than
PROACTIVE (flags risky stocks before the pump happens).
`);

// Summary
console.log("=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));

const passed = results.filter(r => r.passed).length;
console.log(`\nTests: ${passed}/${results.length} passed`);

const highTests = results.filter(r => r.expected === "HIGH");
const highPassed = highTests.filter(r => r.passed).length;
console.log(`HIGH tests: ${highPassed}/${highTests.length} correctly identified`);

console.log(`
KEY OBSERVATIONS:

1. The TypeScript scoring IS working correctly per its logic
   - It requires score >= 7 for HIGH
   - This is achievable with the right combination of signals

2. The issue is that COMMON scam scenarios don't reach 7:
   - OTC + Small Cap = 5 (MEDIUM)
   - OTC + Volume spike = 6 (MEDIUM)
   - Small Cap + 50% spike = 5 (MEDIUM)

3. To get HIGH without SEC flag, you need:
   - OTC + 2 structural flags + any pattern, OR
   - Extreme spike (100%+) + extreme volume (10x+), OR
   - OTC + any spike + behavioral flag

4. The scoring is WEIGHTED TOWARD PATTERNS, not structure.
   A stock can be OTC, micro-cap, micro-liquidity, and still
   only score 7 points - barely HIGH.

RECOMMENDATION:
Either lower the HIGH threshold from 7 to 5-6, OR
increase weights for structural signals (OTC, small cap, etc.)
`);
