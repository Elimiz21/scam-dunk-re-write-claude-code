# Findings: AI Scoring Engine (TypeScript layer)

Reviewer: adversarial line-by-line audit, 2026-06-11
Files: src/lib/scoring.ts, src/app/api/check/route.ts, src/app/api/ai-analyze/route.ts, src/lib/narrative.ts, src/lib/marketData.ts, src/lib/otcMarkets.ts, src/lib/finra.ts, src/lib/regulatoryDatabase.ts, src/lib/circuit-breaker.ts, src/lib/config.ts, src/lib/types.ts, scripts/test-scoring-efficacy.js, evaluation/scripts/standalone-scorer.ts

## CRITICAL

### TS-C1. HIGH threshold lowered to 5 while 4–5 correlated signals stack on a single market event → systemic over-flagging
[CALIBRATION/SCORING MATH] src/lib/scoring.ts:553-555 + 256-384, 393-457
- `if (totalScore >= 5) return "HIGH"; if (totalScore >= 2) return "MEDIUM";`
- One pump simultaneously fires SPIKE_7D (3-4), SPIKE_3D (2-3), PRICE_ANOMALY (2-4), EXTREME_SURGE (3), PRICE_ACCELERATION (2); one volume event fires VOLUME_EXPLOSION (2-3), VOLUME_ANOMALY (2), VOLUME_SURGE_3D (2), VOLUME_ACCELERATION (2).
- Thresholds were lowered ("OTC + Small Cap = 5 now reach HIGH") without de-duplicating correlated signals. A NYSE stock popping 25% on earnings with 3x volume scores 5 → HIGH. Any single weight-2 signal → MEDIUM: every company under $300M cap, every sub-$5 stock, any ±2σ day is at least MEDIUM. For OTC, spike7dMedium: 10 means OTC + routine 10% weekly move = 6 → HIGH; essentially all OTC names read HIGH permanently. PRICE/VOLUME_ACCELERATION have no magnitude floor (three consecutive 0.1% up days fires). No clamp, no per-category cap.
- FIX: take max of correlated price signals and max of correlated volume signals (or cap per-category contribution), add magnitude floors to acceleration signals, re-derive cutoffs on labeled data.

### TS-C2. ServiceUnavailableError thrown inside its own try/catch and swallowed; entire 503/admin-alert path is dead code
[FAILURE-MODE] src/app/api/check/route.ts:124-237 (throw at 160 caught at 233); same bug in src/app/api/ai-analyze/route.ts:99-148 (throw 132, swallowed 145)
- The handler in POST (`error instanceof ServiceUnavailableError`, lines 541-567) and sendAPIFailureAlert can never execute from this path. When the Python backend's data APIs are down, silent fallback to TS scoring; admins never emailed.
- FIX: re-throw ServiceUnavailableError from the catch block, or move the 503 check outside the try.

### TS-C3. checkSECFeed substring-matches ticker against entire EDGAR XML feed → false auto-HIGH for short tickers, or silently dead check
[SCORING MATH/DETERMINISM] src/lib/marketData.ts:920-931
- `return text.toUpperCase().includes(ticker);` — ALERT_LIST_HIT is weight 5 and forces HIGH (scoring.ts:543-548). "GE" matches "EXCHANGE"; "ON"/"IT"/"ALL"/"A" match anything. Conversely no User-Agent header (SEC EDGAR 403s such requests) so in production the check likely always returns false — silently dead regulatory check. Queried URL (`action=getcompany&type=34-` no CIK) is malformed; results vary with live feed → nondeterministic.
- FIX: remove substring check; rely on structured regulatory DB; if kept, parse entries, whole-word match against suspension title only, compliant User-Agent.

### TS-C4. assetType:"stock" overridden by crypto map; real NYSE tickers (SOL, APT, LINK) scored against cryptocurrency data; cache key omits assetType
[SCORING MATH/DATA-INTEGRITY] src/lib/marketData.ts:630 + 78-99 + 624
- `const isCrypto = assetType === "crypto" || isCryptoTicker(normalizedTicker);` and `cache.get(normalizedTicker)`.
- SOL (Emeren Group, NYSE), APT (Alpha Pro Tech), LINK (Interlink Electronics) are in CRYPTO_ID_MAP. Explicit stock scan gets Solana data, marked isOTC:true (+3), wrong price/cap. Cache poisoning across asset types for 5 min.
- FIX: only consult CRYPTO_ID_MAP when assetType === "crypto" (or undefined); cache key `${assetType}:${ticker}`.

### TS-C5. Crypto scoring structurally broken: every major coin floors at MEDIUM; pump detection can never fire
[CALIBRATION/FAILURE-MODE] src/lib/marketData.ts:475-512, 543/559 + src/lib/scoring.ts:253, 397
- isOTC:true for all crypto → OTC_EXCHANGE +3 ("Traded on OTC markets (CRYPTO)") → BTC/ETH always ≥ MEDIUM with factually wrong description. CoinGecko OHLC days=90 returns 4-day candles (~23 points) so `priceHistory.length < 30` short-circuits ALL pattern + anomaly detection; volume hardcoded 0. Large coins score exactly 3 (MEDIUM), small coins 7 (HIGH) on size alone, regardless of pump activity.
- FIX: use /market_chart?days=90&interval=daily; dedicated CRYPTO category/thresholds; assert candle interval.

### TS-C6. Trading-suspended stocks (no quote) return INSUFFICIENT instead of HIGH; precomputed secFlagged discarded in TS fallback
[FAILURE-MODE] src/lib/scoring.ts:618-629, 561-568 + src/app/api/check/route.ts:323, 434-438
- checkAlertList gated on marketData.quote; SEC-suspended stocks typically have no quote → +5 auto-HIGH never fires; isInsufficient downgrades to INSUFFICIENT. Route already knows secFlagged===true but only passes it to the Python backend, not computeRiskScore.
- FIX: run checkAlertList unconditionally; pass secFlagged into computeRiskScore / force HIGH in route.

### TS-C7. Evaluation harness scores with a materially different engine than production → all calibration invalid
[DRIFT/CALIBRATION] evaluation/scripts/standalone-scorer.ts vs src/lib/scoring.ts
- Differences: marketCap>0 guard (standalone:229) absent in prod (scoring.ts:210); pattern gate length<7 (standalone:264) vs <30 (scoring.ts:253); Math.abs(priceChange7d) (standalone:273) vs signed (scoring.ts:258); RSI flat→50 fix vs prod returning 100; standalone has OVERBOUGHT_RSI/HIGH_VOLATILITY but NO PRICE_ANOMALY/VOLUME_ANOMALY/EXTREME_SURGE z-score signals, no behavioral, no alert-list. enhanced-daily-pipeline.ts uses standalone-scorer as "layer1_deterministic".
- Production over-flags relative to every evaluation run; short-history stocks under-flag. Root cause of "looked fine in eval, broken in prod".
- FIX: extract pure scoring functions into one dependency-free module imported by both; re-run calibration.

## HIGH

### TS-H1. Missing quote fields default to 0 and fabricate up to +6 structural risk
[SCORING MATH/FAILURE-MODE] src/lib/scoring.ts:200,210,221 + src/lib/marketData.ts:157-161,303-305
- `lastPrice: profile.price || 0, marketCap: profile.marketCap || 0` then 0 < thresholds fires MICROCAP_PRICE + SMALL_MARKET_CAP + MICRO_LIQUIDITY = +6 → instant HIGH for any stock incl. mega-caps on a data gap. (Alpha Vantage quote path hardcodes marketCap: 0.)
- FIX: treat 0/undefined as unknown → skip signal + surface "data incomplete" confidence flag.

### TS-H2. Partial data (quote OK, history empty) silently disables ALL pattern/anomaly detection, no degraded-confidence indication → false LOW on pumps
[FAILURE-MODE] src/lib/marketData.ts:737-742 + src/lib/scoring.ts:253,397,561-568
- FMP historical endpoint is plan-gated (403 on cheap plans); AV throttles 5/min. Quote succeeds, dataAvailable stays true, engine quietly degrades to structural-only: pumping stock on major exchange scores 0-2 LOW/MEDIUM; nothing tells the user 13 of 18 signal types were never evaluated.
- FIX: dataCompleteness/confidence field in ScoringResult, surface in response/narrative; consider INSUFFICIENT when history < 30.

### TS-H3. RSI returns 100 for flat series; nonstandard average → phantom "Extremely overbought" (+2) for illiquid stocks
[SCORING MATH] src/lib/marketData.ts:1112-1133
- avgGain=0, avgLoss=0 → returns 100 → OVERBOUGHT_RSI +2 for stocks that haven't traded in 14 days. mean(gains) averages up-days only (nonstandard). Standalone has the fix (return 50; divide by period).
- FIX: port standalone fix.

### TS-H4. Case-sensitive string matching drops the moderate-RSI signal; weight-1 branch can never fire
[SCORING MATH/DEAD BRANCH] src/lib/scoring.ts:439-445 vs src/lib/marketData.ts:1318-1324
- `signalDesc.includes("overbought")` vs producer "Overbought conditions (RSI: ..)" (capital O). Prose strings as inter-module contract.
- FIX: structured {code, severity, value} from runAnomalyDetection; match on codes.

### TS-H5. pitchText/behavioral context never sent to Python backend; AI path discards behavioral signals unless baseline strictly out-levels AI
[AI-BACKEND INTEGRATION] src/app/api/check/route.ts:137-147, 341-415
- Backend body = {ticker, asset_type, use_live_data, days, sec_flagged} — no pitch/context. On AI success scoringResult.signals = aiResult.signals; behavioral evidence (+7 worth) disappears unless baselinePriority > aiPriority.
- FIX: always merge TS behavioral signals into AI result (and weights); or extend backend contract.

### TS-H6. AI blending: level and score from different systems can contradict; isLegitimate redefined so unknown stocks get "well-established company" treatment
[AI-BACKEND INTEGRATION/SCORING MATH] src/app/api/check/route.ts:351-376
- riskLevel from backend ensemble; totalScore from re-summed signal weights (can disagree: HIGH w/ score 0). `isLegitimate: aiResult.riskLevel === "LOW" && signals.length === 0` — no large-cap/liquidity/major-exchange checks; obscure ticker scored LOW-with-no-signals is presented as confirmed blue-chip with reassuring narrative. False-negative messaging scam victims would screenshot.
- FIX: compute isLegitimate from marketData via checkIsLegitimate in both paths; derive displayed level from displayed score.

### TS-H7. Python backend response consumed unvalidated; missing weights → NaN totalScore; unknown risk_level strings pass via lying cast
[AI-BACKEND INTEGRATION/TYPES] src/app/api/check/route.ts:175-232, 395-396
- `await response.json()` no zod; `riskLevel: aiResult.riskLevel as ...`; `RISK_PRIORITY[...] ?? 0` so an unknown level loses to baseline MEDIUM. sum + undefined = NaN → stored in scan history.
- FIX: zod schema (enum risk_level, number weights), Number.isFinite guard, reject/fallback on mismatch.

### TS-H8. SEC suspension sync extracts "tickers" as any 2–5 letter uppercase word (7-word stoplist) → CRITICAL flags on garbage; source URL likely returns nothing
[DATA-INTEGRITY] src/lib/regulatoryDatabase.ts:203-249
- `title.match(/\b([A-Z]{2,5})\b/g)` with stoplist [THE,AND,FOR,INC,LLC,LTD,SEC]. "ORDER OF SUSPENSION ... CORP" inserts ORDER/FIRST/ARENA/CORP as CRITICAL tickers → permanent false ALERT_LIST_HIT (+5 auto-HIGH) for colliding real symbols. Fetch URL malformed + no User-Agent → probably ingests nothing. Broken in both directions, silently.
- FIX: use SEC structured suspension data; match only explicit "(Ticker: XYZ)"; alert when sync parses zero entries.

### TS-H9. Stock can be simultaneously riskLevel=HIGH and isLegitimate=true → contradictory LLM instructions
[LLM-USAGE/CALIBRATION] src/lib/scoring.ts:574-597 + src/lib/narrative.ts:181-192, 261-262
- checkIsLegitimate ignores PATTERN signals. $50B stock in hot earnings week: HIGH + isLegitimate → UI shows HIGH; narrative says "well-established company, tone reassuring".
- FIX: force isLegitimate=false whenever riskLevel !== LOW; assert invariant before prompt.

## MEDIUM

### TS-M1. Volume-explosion baseline includes the spike days themselves (also in standalone + 3-day variant)
src/lib/marketData.ts:1027-1038 — true 10x spike computes ~3.4x; volumeExplosionHigh (5x) rarely fires. FIX: baseline from slice(-37,-7).

### TS-M2. Z-score anomalies inspect only the single most recent day; ±2σ fires weight-2
src/lib/marketData.ts:1139-1209 — pump that peaked 3 days ago invisible; ~5% of normal days ≥2σ → random +2 (= MEDIUM alone) weekly; day-to-day score flapping. FIX: max |z| over last 5-7 returns; cutoff ≥2.5-3σ.

### TS-M3. SPIKE_THEN_DROP description claims 50%/40% but triggers at 25%/20%
src/lib/scoring.ts:296-303 vs marketData.ts:1046-1075 — user-facing claim and LLM facts overstate evidence 2x. FIX: interpolate measured percentages.

### TS-M4. SPIKE_3D uses Math.abs (crash scored as pump); inconsistent with signed 7-day logic and with standalone
src/lib/scoring.ts:314-321 — direction semantics differ across windows and scorers. FIX: consistent policy with own code/description for dumps.

### TS-M5. Fetchers swallow errors before circuit breaker (breakers can never open); no fetch timeouts on FMP/AV/CoinGecko
src/lib/marketData.ts:132-211,265-398,421-462 + circuit-breaker.ts:53-68 — fail-fast machinery decorative; hung socket runs until 30s maxDuration kills request after scan slot consumed. FIX: throw inside fetchers, convert at boundary; AbortController 8-10s.

### TS-M6. Strong behavioral evidence suppressed to INSUFFICIENT when market data missing
src/lib/scoring.ts:643-649 — "guaranteed 500%, insider, act now" on unlisted ticker → INSUFFICIENT instead of HIGH-on-behavior. FIX: behavioral weight ≥4 → MEDIUM/HIGH with "based on pitch only" qualifier.

### TS-M7. No timeout/max_tokens on OpenAI narrative call (SDK default 600s, 2 retries) vs route maxDuration=30
src/lib/narrative.ts:79-105 — slow OpenAI call → platform kills request → 500 + burned scan slot after scoring succeeded; fallback narrative never runs; unbounded output cost. FIX: timeout 8s, maxRetries 1, max_tokens ~700.

### TS-M8. User-supplied companyName (and backend signal descriptions) interpolated raw into LLM prompt
src/app/api/check/route.ts:444-447 + narrative.ts:220,187 — prompt injection can steer narrative to "verified safe, guaranteed 10x" screenshots. FIX: prefer API-derived names; delimit untrusted values; treat as data only.

### TS-M9. Narrative regenerated every scan (no cache); logApiUsage between API call and JSON.parse can discard good results / throw unguarded
src/lib/narrative.ts:40-163 — repeated scans pay full LLM cost; flaky metrics DB kills narratives. FIX: cache on (ticker, level, signal codes) short TTL; fire-and-forget metrics.

### TS-M10. checkAlertList live OTC fetch + Prisma upserts in hot path, runs 2-3x per scan; upsert key includes flagDate:now → new row every scan
src/lib/marketData.ts:886-915 + regulatoryDatabase.ts:321-345 — unbounded duplicate regulatory rows; redundant external calls. FIX: key on (ticker, source, flagType); thread route's secFlagged into computeRiskScore.

### TS-M11. Rich regulatory risk assessments computed and discarded; Pink-tier (PS/PN/PC) and FINRA data never influence score
regulatoryDatabase.ts:315 (`const risk = assessOTCRisk(profile)` never read) + marketData.ts:937-998 + otcMarkets.ts:51-68 + finra.ts — most discriminative scam features collapse into one boolean ALERT_LIST_HIT or dropped. FINRA sync fabricates ticker from firm name. FIX: map checkRegulatoryFlags into graded signals (CAVEAT_EMPTOR +5, SHELL +3, PROMOTED +3, PN/PC +2).

### TS-M12. ai-analyze: totalScore/20 pseudo-probability unclamped; off-by-one anomaly gate (>30 vs <30); usage checked but never consumed (free unmetered scans)
src/app/api/ai-analyze/route.ts:280, 272-274, 193-199. FIX: Math.min(1, ...); align gate >= 30; reserve slot.

### TS-M13. Scan slot consumed before request validation; unguarded awaited logScanHistory can 500 a completed analysis
src/app/api/check/route.ts:282-308, 500-516 — malformed bodies burn quota; metrics hiccup → 500 after success. FIX: validate first; wrap logScanHistory; refund slot on 5xx.

### TS-M14. Alpha Vantage zod schema validates strings not numerics; "N/A"/"--" → NaN silently suppresses signals (false LOW)
src/lib/marketData.ts:48-65, 381-391. FIX: z.coerce.number() / Number.isFinite filter.

## LOW

### TS-L1. WATCHLIST_THRESHOLDS_TS unreachable in production; `(marketData as any).onWatchlist` type lie (scoring.ts:86-99, 251)
### TS-L2. Unused imports/params/regexes: calculateRSI/calculateSurgeMetrics in scoring.ts; calculateRiskLevel ignores marketData; runAnomalyDetection unused in check route; unused regex trio in regulatoryDatabase.ts:179-181
### TS-L3. EXTREME_SURGE reports wrong percentage when 30-day threshold triggered (marketData.ts:1309-1313, truthiness on surge7d)
### TS-L4. Behavioral keyword list over-triggers on benign language ("100%", "exclusive", "expires", "immediately"); partial double-count with SPECIFIC_RETURN_CLAIM (scoring.ts:105-154)
### TS-L5. avgDollarVolume falls back to share volume ×1 when price missing (check/route.ts:451-453)
### TS-L6. Flat-rate LLM cost estimate; `as Narrative` cast without element validation; instructions embedded as JSON schema values (narrative.ts:109-111,128-141,227-241)
### TS-L7. newsVerification attached even when no-downgrade guard replaced AI result with baseline (check/route.ts:527-529)
### TS-L8. SPIKE_3D/VOLUME_SURGE_3D/PRICE_ACCELERATION/VOLUME_ACCELERATION codes not in SIGNAL_CODES; "7d" is 7 trading days (~9-10 calendar)
### TS-L9. scripts/test-scoring-efficacy.js encodes previous calibration (HIGH≥7) and re-implements engine; passes against itself, masking regression

## DIAGNOSIS (ranked)
1. Over-flagging from miscalibrated thresholds + signal stacking (HIGH≥5/MEDIUM≥2 with 4-5 correlated signals; OTC spike threshold 10%/week; z-score/acceleration fire on noise).
2. Eval/prod engine fork (standalone-scorer vs scoring.ts) — production behavior never actually validated.
3. Silent degradation manufactures false HIGHs (missing fields → 0 → +6) and false LOWs (history missing → pattern detection off, dataAvailable still true).
4. Alert pipeline unreliable at both ends (dead/false-positive SEC feed check, garbage-ticker suspension sync, suspended stocks → INSUFFICIENT).
5. AI-backend integration flaws (swallowed 503s, unvalidated payloads, level/score mixing, dropped behavioral signals, isLegitimate redefinition).
6. Crypto effectively unscored (all "OTC", 4-day candles disable patterns).
7. Incoherent outputs erode trust (HIGH+legitimate narratives, 2x overstated descriptions, day-to-day flapping).
8. Compounding: OpenAI no-timeout 500s with burned quota; rich OTC/FINRA data never reaches score; duplicate regulatory checks/upserts.
