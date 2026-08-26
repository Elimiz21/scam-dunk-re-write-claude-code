# Findings: Python AI/ML Service (python_ai)

Reviewer: adversarial line-by-line audit, 2026-06-11
Score semantics: /analyze returns risk_level (LOW/MEDIUM/HIGH), risk_probability (0–1 from combine_predictions), risk_score (uncapped int = sum of signal weights). TS caller uses risk_level + recomputed totals; field names and X-API-Key header match. The contract is intact — the failures are deeper.

## CRITICAL

### PY-C1. RF serving features (49) never match training features (35); RF probability is ALWAYS 0.0 and the model retrains on every request
[ML correctness] feature_engineering.py:444-506 vs ml_model.py:84-95, pipeline.py:730-751
- Verified empirically: training list = 35 names; create_feature_vector emits 49 (adds max_return_zscore_7d … pump_pattern_days_30d), order diverges at index 13, names case-mismatch (Price_Change_3d vs price_change_3d). scaler.transform raises ValueError (49 vs 35). pipeline.py:737-748 catches, retrains on synthetic 35-feature data, retries, fails again, sets rf_prob = 0.0.
- Impact: half the advertised ensemble contributes exactly 0.0 to every production score while burning a full RF train + joblib.dump to disk PER REQUEST (latency/CPU/disk; eats the 10s TS budget). Retry loop structurally cannot converge.
- FIX: emit exactly ScamDetectorRF.feature_names in order (shared constant) or align by name at predict time; startup assertion; never retrain in request path.

### PY-C2. LSTM consumes raw Close/Volume scaled by MinMaxScaler fit on synthetic ranges; outputs meaningless on real data
[ML correctness] lstm_model.py:101,104-107,393-397,499-505
- Training sequences: absolute prices $1–$300, volumes 10k–5M (synthetic). Shipped scaler applied with no clipping; real $0.40/80M-share stock or $900 NVDA saturates network. lstm_probability is noise; with RF=0.0 the "ML ensemble" is entirely noise — only rule-based anomaly score does real work.
- FIX: scale-invariant features only (returns, z-scores, ratios), retrain on real labeled sequences, clip/validate scaler output at inference.

### PY-C3. yfinance fundamentals failure silently substitutes RANDOM synthetic fundamentals shaped like a healthy large-cap
[ML correctness/data integrity] data_ingestion.py:463-465 (with 375-401)
- On .info exception → get_stock_fundamentals(use_synthetic=True, is_scam_scenario=False) → market_cap = np.random.uniform(500M, 50B), exchange = random NYSE/NASDAQ/AMEX, seeded by salted hash(ticker) (different per restart).
- Impact: .info is the most rate-limited yfinance call; on failure a real OTC penny scam is scored with fabricated $0.5–50B cap on a major exchange — zeroing is_otc, is_micro_cap, liquidity signals, structural floors — while real price data flows. Nondeterministic across restarts.
- FIX: never fabricate in live mode — raise DataAPIError or proceed with market_cap=None + suppress structural signals + data_available=false.

### PY-C4. yfinance exchange codes (PNK, OQX, OQB) never match OTC detection sets; real OTC stocks classified non-OTC
[ML correctness] data_ingestion.py:417-421 + config.py:194-196 + pipeline.py:701
- is_otc checks for 'OTC','PINK','GREY' substrings or membership in OTC_EXCHANGES; Yahoo reports PNK/OQX/OQB. Weight-3 OTC_EXCHANGE never fires, OTC threshold tier never selected, every OTC probability floor (0.45/0.50/0.75/0.80) dead. Systematic under-flagging of exactly the target stocks.
- FIX: add PNK/OQX/OQB/GREY variants; map quoteType/fullExchangeName "Other OTC"; regression test with real yfinance strings.

### PY-C5. 10s TS client abort vs pipeline that routinely exceeds 10s; AI results silently discarded
[Integration/reliability] src/app/api/check/route.ts:126 vs api_server.py + pipeline
- Per request: yfinance history + .info (2 round-trips), feature engineering, full RF retrain + save (PY-C1), LSTM predict, and for HIGH results verify_legitimate_catalysts (yfinance news + SEC EDGAR, live_data.py:671-766). Cold start adds TF import + RF/LSTM training (api_server.py:197-220).
- Impact: large fraction of calls (and ~all HIGH-risk calls) exceed 10s → success:false → silent TS fallback. "AI not working" partly = AI answer rarely arrives in time.
- FIX: cache yfinance, remove per-request retrain, move news verification out of sync path, pre-warm models, raise TS timeout to ~20s within maxDuration=30.

### PY-C6. yfinance==0.2.30 (Oct 2023) broken/heavily throttled vs today's Yahoo; failures become user-facing 503s WITHOUT TS fallback
[Reliability/deployment] requirements.txt:10
- Pin predates Yahoo's 2024-25 cookie/crumb + anti-bot changes; datacenter IPs get 429/empty. load_stock_data → DataAPIError → 503 → check/route.ts converts to ServiceUnavailableError which SKIPS the TS fallback and returns "scanning system is currently offline" (route.ts:541-566).
- Impact: when Yahoo throttles, every scan hard-fails even though TS scorer with FMP/AV works fine. With PY-C3, partial failures produce fabricated-fundamentals scores instead.
- FIX: upgrade/maintain yfinance or switch to keyed API; cache/retry; TS fallback on backend 503 with async admin alert.

## HIGH

### PY-H1. Fail-open authentication; non-constant-time secret comparison
[Security] api_server.py:33-35, 57-65 — missing AI_API_SECRET → all endpoints unprotected (warning only); `api_key != AI_API_SECRET` timing-unsafe. FIX: refuse to start/403 in production; secrets.compare_digest.

### PY-H2. Shared mutable model state retrained inside concurrent request threads
[Reliability/race] pipeline.py:734-748 — concurrent requests refit scaler/model and write same joblib files; torn reads, corrupted files. FIX: immutable after startup; atomic swap under lock if ever retrained.

### PY-H3. Signal thresholds make MEDIUM/HIGH nearly unavoidable for small caps while ML contributes nothing
[Score semantics] pipeline.py:780-788 + compute_signals 171-423 — price<$5 (2) + small cap (2) + micro liquidity (2) = 6 → HIGH with zero price/volume evidence; PRICE_ANOMALY at |z|≥1.5 (~13% of normal days) → instant MEDIUM; HIGH_VOLATILITY at ATR>5%; final level = max(signal, ml) and TS no-downgrade guard → AI can only raise. combine_predictions floor lattice (0.45–0.85) makes risk_probability a step function.
- FIX: require ≥1 PATTERN/ALERT signal for HIGH; recalibrate on labeled set; report Brier/reliability.

### PY-H4. The "SEC integration" is fake in both layers
[Correctness] config.py:153-162 (SEC_FLAGGED_TICKERS = demo placeholders SCAM/PUMP/DUMP/...) + live_data.py:293-341 (check_sec_enforcement = substring match on symbol, no network) + api_server.py:401-410; fetch_sec_trading_suspensions returns [].
- /api/check saved only because TS passes real sec_flagged; ai-analyze sends NO sec_flagged → relies on fake list; real suspended tickers come back "Not on SEC alert list".
- FIX: real SEC suspension feed or proxy TS checkAlertList; pass sec_flagged from ai-analyze; delete stub.

### PY-H5. Model integrity verification is a complete no-op
[Deployment/integrity] model_hashes.json keys ≠ actual filenames; all values null; verify_model_file returns True when no hash configured (model_integrity.py:59-62); np.load(allow_pickle=True) (lstm_model.py:574). Pickle-RCE defense is security theater. FIX: align keys with MODEL_PATHS, populate SHA-256 in CI, fail-closed in production.

### PY-H6. Batch endpoints: unbounded input, extreme per-ticker fan-out, unbounded cache
[Reliability/DoS] api_server.py:459-527 + pre_pump_signals.py:209-222,495-552 + domain_monitor.py:77-105 + social_early_warning.py:219-220
- No cap on tickers. Per ticker: full company_tickers.json re-download (no cache), FTD zip (decompressed CSV cached FOREVER in _ftd_cache), 2 RegSHO fetches, yfinance, sleep(0.2)×4; domain-check = 60 synchronous DNS lookups/ticker; social scan sleeps 2s/ticker. Starves /analyze; unbounded RAM; unauthenticated cost amplifier if secret unset.
- FIX: Field(max_length=50), TTL-cache CIK map, bound FTD cache, parallelize with timeouts, background jobs.

### PY-H7. news_flag=False hardcoded in /analyze; news-aware false-positive reduction dead
[ML correctness] api_server.py:295-302 — 40% reduction (anomaly_detection.py:350-353) and has_news feature can never activate; earnings jumps score like unexplained pumps. FIX: plumb upstream news flag or fast cached check pre-scoring.

### PY-H8. data_available=True hardcoded; no minimum-data guard — thin tickers get confident LOW that MASKS TS "INSUFFICIENT"
[Correctness] api_server.py:372 — 3 rows of history → all-zero features → LOW; AI LOW (priority 0) outranks TS INSUFFICIENT (−1) in no-downgrade guard. FIX: require ≥30 rows else data_available=false/INSUFFICIENT.

### PY-H9. Crypto: 15 hardcoded coins; others → 503 "scanning system offline"; CoinGecko 4-day candles break every window feature
[Crypto correctness] live_data.py:348-364, 390-445 — Price_Change_7d ≈ 28 calendar days; 30-row windows ≈ 4 months; volume merged per 4-day candle or 0. Long-tail meme coins (the actual scam vector) unscannable. FIX: /market_chart daily, resample explicitly, "unsupported asset" not 503.

## MEDIUM

### PY-M1. Known-vulnerable pins: gunicorn==21.0.0 (CVE-2024-1135), requests==2.31.0 (CVE-2024-35195), fastapi==0.109.0/python-multipart (CVE-2024-24762), tensorflow==2.15.0 (multiple, near EOL); yfinance transitive deps unpinned. FIX: bump, pip-audit in CI.
### PY-M2. Startup blocks on model load/training while Railway health-checks "/" which returns 200 even when pipeline permanently failed (api_server.py:235-243 + railway.toml:7). RF artifact not shipped (only LSTM) → trains at boot. FIX: healthcheck /health with model readiness; ship RF artifact.
### PY-M3. LSTM scaler fit on train+val before split (leakage); validation on re-derived tail; unseeded shuffle (lstm_model.py:393-401,448-453). RF test_accuracy from same synthetic distribution → "~100% accuracy" claims meaningless (ml_model.py:311-317).
### PY-M4. prepare_sequence_from_df mutates caller's DataFrame; silently zero-fills missing feature columns (lstm_model.py:336-343). FIX: raise on missing; copy.
### PY-M5. np.random.seed(hash(ticker) % 2**32) — hash() salted per process; "reproducible per ticker" false; affects PY-C3 fallback fundamentals (data_ingestion.py:122,376). FIX: zlib.crc32.
### PY-M6. Form 4/144 parsing stubbed (transaction_type:'', shares:0, insider:'Unknown') → NO_INSIDER_BUYING fires for every stock up ≥20%; INSIDER_SELLING_SETUP reports "Unknown, 0 shares" (pre_pump_signals.py:317-333,185-201).
### PY-M7. ApeWisdom upvotes mapped to unique_authors; mentions_24h_ago mapped to "7-day baseline" — bot-detection semantics wrong (social_early_warning.py:121-127).
### PY-M8. Generic promotional-domain patterns flag legit domains ({ticker}news.com → foxnews.com, weight 3); 60 blocking DNS lookups/ticker (domain_monitor.py:28-43,77-105).
### PY-M9. Ensemble weights advertised 0.6/0.4 in /models/status but configured 0.5/0.5; three uncoordinated threshold systems (config 0.25/0.55 vs pipeline 2/5 vs anomaly 0.4) (config.py:141-145 vs api_server.py:435-439).
### PY-M10. ml_model.load() only catches FileNotFoundError — corrupt joblib → pipeline None → every request 503 until manual intervention (ml_model.py:438-475).
### PY-M11. News verification downgrades risk_level but leaves probability/signals unchanged → MEDIUM with probability 0.82 payloads (pipeline.py:819-843).
### PY-M12. Dockerfile COPY . . ships tests/training data/.env; live_data.py load_env OVERRIDES real env vars with stale file values (live_data.py:26-37). FIX: .dockerignore; os.environ.setdefault.
### PY-M13. ai-analyze route: client-controllable useLiveData:false returns synthetic "analysis" of real tickers; health gate requires rf_ready && lstm_ready (inconsistent with check route) (src/app/api/ai-analyze/route.ts:51-65,154-173).

## LOW

### PY-L1. Auth middleware outermost: CORS preflight OPTIONS gets 401; error responses lack CORS headers (api_server.py:49-55).
### PY-L2. Infinite keep-alive logger task; two separate startup hooks; print()-based pipeline tracing on hot path (api_server.py:84-91; pipeline.py:657+).
### PY-L3. rate_limit() global dict unlocked (thread race); time.sleep up to 12s inside executor threads (live_data.py:44-60).
### PY-L4. RegSHO "consecutive_days" counts duplicate lines in a single-day file; FTD "consecutive settlement days" is really breach-day count (pre_pump_signals.py:365-377,584-599).
### PY-L5. Anomaly score normalization comment disagrees with formula; volatility detector ignores tiered thresholds (anomaly_detection.py:83-84).
### PY-L6. is_micro_cap <$300M in data_ingestion vs <$50M in pipeline/api_server; float_turnover has three different semantics (data_ingestion.py:452; ml_model.py:623).
### PY-L7. Procfile (uvicorn) vs Dockerfile CMD (gunicorn) drift; docker-compose passes no AI_API_SECRET; README suggests --allow-unauthenticated.

## RANKED DIAGNOSIS
1. ML layer functionally absent while claiming to run: RF feature mismatch → rf_prob hard-zero + per-request retrain; LSTM synthetic-trained → noise. "AI score" = rule-based heuristics + floor constants.
2. Data layer poisons inputs: yfinance 0.2.30 obsolete/throttled; .info failures → random large-cap fundamentals; OTC exchange codes never match → OTC signals/thresholds/floors dead (under-flags target stocks) while ≥2/≥5 cutoffs + z≥1.5 over-flag ordinary small caps.
3. Integration budget broken: TS aborts at 10s; Python does retrain + uncached fetches + news verification → AI answers discarded; yfinance hard-fail 503 BYPASSES TS fallback → "scanning system offline".
4. Regulatory layer decorative: 8 demo tickers, substring matching; ai-analyze never passes sec_flagged.
5. Operational hardening illusory: fail-open auth, no-op model integrity, unbounded batch endpoints, Railway healthcheck on "/".
Fix order: (1) RF feature contract + stop in-request retraining, (2) OTC mapping + remove synthetic-fundamentals fallback, (3) modernize/cache market data + rebalance timeout + TS fallback on 503, (4) recalibrate weights on labeled set, (5) retrain or disable LSTM until real training data exists.
