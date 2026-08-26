# Findings: Social Network Scanning Subsystem

Reviewer: adversarial line-by-line audit, 2026-06-11

## ARCHITECTURE (what actually runs)
- Production: GH Actions cron (enhanced-daily-evaluation.yml, Mon–Fri 23:00 UTC) → enhanced-daily-pipeline.ts:1795 POSTs up to 50 HIGH-risk tickers to {SOCIAL_SCAN_APP_URL}/api/admin/social-scan (5-min client timeout) → Vercel route (maxDuration=300) synchronously runs runSocialScanAndStore() → 6 scanners in parallel (Serper, Perplexity, Reddit-public, YouTube, StockTwits, Discord-bot) → GPT-4o-mini screening → one batch DB write at the very end.
- CLI fallback: duplicated scanner suite in evaluation/scripts/social-scan/ (no AI screening).
- Legacy third copy: real-social-scanner.ts (used by run-post-scan-phases, scan-specific-stocks/real-social-scan.yml, run-social-scan-standalone, run-social-scan-regular-stocks) + real-time-social-scanner.ts (dead).
- Browser agents: coded but CANNOT RUN (playwright/playwright-extra/otplib not in any package.json/lockfile). Admin "queued" browser scans are processed by NOTHING.

## APIFY: NOT USED — CONFIRMED
No apify in any source file, package.json, package-lock.json, env example, workflows, or git history (git log -S apify hits only an unrelated marketing-skill doc). If paying for Apify, it is orphaned spend outside this repo — cancelable.

## PROVIDERS ACTUALLY USED
| Provider | Key | Paid? |
|---|---|---|
| Serper.dev (Google SERP) | SERPER_API_KEY | YES (credits) |
| Perplexity (sonar) | PERPLEXITY_API_KEY | YES ($/req + tokens) |
| OpenAI gpt-4o-mini | OPENAI_API_KEY | YES (small for screening; news analysis elsewhere is bigger) |
| YouTube Data API v3 | YOUTUBE_API_KEY | Free (10k units/day) |
| Reddit public JSON | none | Free (blocked from DC IPs) |
| StockTwits public | none | Free |
| Discord Bot API | DISCORD_BOT_TOKEN | Free |
| thum.io screenshots | none | Free tier |

## PER-SCAN COST MODEL (50 tickers)
- Serper: 50×2 queries × 2 credits (num:15) = 200 credits ≈ $0.06–$0.20
- Perplexity: 10 sonar calls ≈ $0.08
- OpenAI screening: ≈ $0.01; YouTube $0 (but 5,050 units = 50% of daily quota); Vercel ≈ $0.01
- ≈ $0.15–$0.30 per clean scan → ~$3–$7/month at one run/day. Real bills exceed via: fallback DOUBLE-SPEND on timeout days (×2), manual re-triggers (no concurrency guard), abandoned-scanner spend, cross-ticker duplication. If actual spend ≫ $20/month, check OpenAI news-analysis/deep-analysis in the pipeline and orphaned external subscriptions (e.g. Apify).

## STABILITY — CRITICAL

### SOC-C1. Scanner sleep budgets mathematically exceed the 120s per-scanner timeout at 50 tickers
scanners.ts:28,186,546 + orchestrate.ts:289 — REDDIT_DELAY_MS=2500 × 50 = 125s of sleep alone vs SCANNER_TIMEOUT=120_000; StockTwits sleep(2000) → ~115–140s. Scanners return results only at END of scan(); Promise.race discards 100% of partial results. Reddit ALWAYS times out at 50 tickers; StockTwits usually. Every full scan is PARTIAL.
FIX: stream results per ticker; chunk targets (10/invocation); compute delay budget from targets.length; return accumulated mentions on timeout.

### SOC-C2. Multi-minute synchronous scan inside serverless handler; worst case exceeds maxDuration; results only written at the end
route.ts:19,364 + orchestrate.ts:289,359 — 120s scanners + 180s AI screen + query + write > 300s worst case; pipeline client aborts at exactly 5 min. When killed: ALL results lost, money already spent, SocialScanRun stuck RUNNING until GET's 10-min cleanup flips TIMED_OUT. Commit history shows this failure "fixed" twice by shrinking timeouts. #1 instability source.
FIX: return 202 + run async (queue/cron/GH Actions + ingest route); write mentions incrementally.

### SOC-C3 (browser agents). playwright/playwright-extra/puppeteer-extra-plugin-stealth/otplib are NOT dependencies anywhere — entire browser-agent subsystem crashes on import; has never run from this repo. Admin trigger_scan creates PENDING browserAgentSession rows that NOTHING processes ("Browser scan queued" is a lie). runningSessions counts PENDING forever.
FIX: delete subsystem or add deps + real executor; remove the admin button until it works.

## STABILITY — HIGH
- SOC-H1. Timed-out scanners abandoned, not cancelled; clearTimeout skipped on rejection; no AbortController → paid calls continue, results discarded (orchestrate.ts:293-311).
- SOC-H2. Every fetch in scanners.ts lacks timeout/AbortController (lines 47,336,355,476,662,853,1109) — one hung socket eats the 120s budget.
- SOC-H3. Reddit public JSON blocked from Vercel datacenter IPs (code documents it: spoofed Chrome UA + HTML-block detection); burns ~125s for nothing nearly every serverless run. FIX: Reddit OAuth (60 req/min) or rely on Serper site:reddit.com.
- SOC-H4. ingest route: row-by-row inserts in loop, NO maxDuration export (default 10-15s), no idempotency → partial ingests; CLI retry re-inserts everything; status force-overwritten to COMPLETED (ingest/route.ts:90-113,121). FIX: createMany + unique key + maxDuration + zod.
- SOC-H5. SocialMention has NO unique constraint → skipDuplicates:true is a NO-OP (schema.prisma:789-815 + orchestrate.ts:473-476). Same post re-inserted every run AND once per substring-matching ticker. Stats inflated; DB unbounded. FIX: @@unique([ticker,url,scanRunId]) + content hash; cross-run seen-set.

## STABILITY — MEDIUM
- SOC-M1. 429 handling: single fixed 10s retry on Reddit only; Serper/Perplexity/YouTube/StockTwits/Discord treat 429 as generic error (scanners.ts:49-52 etc.).
- SOC-M2. AI screener: no per-request timeout, no response_format, max_tokens:1500 truncation → JSON.parse fails → return [] → whole 25-mention batch lost silently (ai-screener.ts:183-216,241-246). FIX: json_object format, batches of 10, client timeout, retry truncated.
- SOC-M3. No concurrency guard on POST — double-click/cron+manual = two concurrent full scans, double spend (route.ts:281-342).
- SOC-M4. Index-based re-alignment of screened mentions fragile; 180s AI race timer never cleared; OpenAI batches keep running after timeout (orchestrate.ts:368-399).
- SOC-M5. Stale-run cleanup (any GET marks RUNNING >10min as TIMED_OUT) races live scans (route.ts:51-68). FIX: heartbeat.

## STABILITY — LOW
- SOC-L1. Admin trigger = 5-minute blocking browser fetch; failures surface as "Failed to trigger" while scan continues → retries → duplicates (admin/social-scan/page.tsx:303-333).
- SOC-L2. Manual tickers interpolated into RegExp unescaped — "(" throws, whole Discord scanner fails (scanners.ts:1146-1149; same in eval discord-bot-scanner.ts:80). Validate ^[A-Z.\-]{1,6}$.
- SOC-L3. ingest upsert({where:{id: scanId || "new"}}) placeholder (ingest/route.ts:60-61).
- SOC-L4 (browser agents). All persistence paths resolve to nonexistent evaluation/evaluation/browser-sessions (cost-tracker.ts:21-29, rate-limiter, session-manager, base-browser-agent) — budgets/cookies silently never persist; saveCookies throw after successful login fails the scan. Evidence file saved from a fresh empty collector (run-browser-scan.ts:127-129); uploadToSupabase is a TODO. Discord selectors target hashed CSS classes; mention URL is the search page; fabricated "Manual review recommended" mentions.

## COST
- SOC-CO1 [High]. Serper: 2 queries/ticker × 50 × 2 credits (num:15) = ~200 credits/scan. FIX: num:10 + merged query + top-20 tickers → 75-85% savings.
- SOC-CO2 [High]. Double-spend on every unstable day: 5-min client abort → local fallback re-spends Serper+Perplexity on the same 50 tickers while deployed scan may still be running (enhanced-daily-pipeline.ts:1795-1910). FIX: poll GET for results instead of re-scanning.
- SOC-CO3 [High]. Cross-ticker mention duplication multiplies AI screening and rows: substring attribution pushes the same post into every matching ticker (orchestrate.ts:26-39,360-376); 1.5-3× realistic. FIX: dedup by URL/hash globally; word-boundary attribution.
- SOC-CO4 [High]. Perplexity: 10 serial sonar calls (5-15s each + 1s sleeps ≈ 60-160s) frequently lose the 120s race — all paid calls discarded. FIX: tier (only pattern-flagged tickers), parallelize 2-3 batches, partial results on timeout.
- SOC-CO5 [Medium]. Over-broad/double-counting patterns ("to the moon"+"moon" both count; LOW patterns include "subscribe","watchlist","breaking","price target","technical analysis"; PROMOTION_SUBREDDITS includes r/stocks, r/investing) → isPromotional ≥20 flags nearly everything → more AI screening + noise. FIX: longest-match-wins, demote generics, remove mainstream subs, raise threshold.
- SOC-CO6 [Medium]. No caching/dedup across runs: same HIGH-risk stocks re-selected daily; no seen-URL store; same posts re-screened daily. Most steady-state spend re-discovers yesterday's posts.
- SOC-CO7 [Medium]. YouTube ~5,050 units per 50-ticker scan = 50% of free daily quota; two scans/day exhausts it → YouTube silently disappears. Legacy scanner had a quota guard; production doesn't.
- SOC-CO8 [Low]. ai-screener doc says threshold 30, code says 40.

## DUPLICATION / DRIFT
- SOC-D1 [High]. THREE parallel scanner stacks all live (src/lib, evaluation/scripts/social-scan, real-social-scanner.ts) + dead real-time-social-scanner.ts (890 lines with own GPT calls + execSync curl).
- SOC-D2 [High]. platform-patterns.ts byte-identical in both trees; types.ts BEHAVIORALLY drifted: flag cap 10 vs 15; isPromotional 20 vs 25/30; src keeps no-URL mentions, eval DROPS them; high-risk platform threshold avg ≥25 vs ≥40; riskLevel MEDIUM at ≥30 vs ≥50. Same ticker, same day → different riskLevel depending on which path ran.
- SOC-D3 [Medium]. Eval StockTwits collapses all mentions to one URL per ticker → CLI dedup keeps only 1 mention/ticker.
- SOC-D4 [Medium]. Perplexity prompts diverge: src hunts scams (+suspicion bonus), eval hunts neutral mentions — same spend, different signal.
- SOC-D5 [Low]. Eval perplexity-researcher duplicates citation mentions per batch ticker (1 URL → up to 5 mentions).
- SOC-D6 [Low]. persuasion-phrases.ts (1,236 lines) exported but never called — dead weight.
- SOC-D7 [Low]. Two divergent browser-credential stores (env BROWSER_* via admin UI vs credentials.enc.json via BROWSER_AGENT_CREDENTIALS_PATH — env set never consumed by agents).

## CORRECTNESS (risk attribution)
- SOC-R1 [High]. Substring ticker matching misattributes mentions; first clause makes $-check redundant; 2-3 letter tickers (YJ, LSH in live default list) match arbitrary text (orchestrate.ts:31-38). FIX: \b\$?TICKER\b; require cashtag for ≤3 chars.
- SOC-R2 [Medium]. Social results NEVER feed back into any risk score: /api/check has zero social references; pipeline only annotates output files/scheme DB. The expensive social layer affects only admin dashboards. If owner believes social scans change user-facing risk ratings — they don't.
- SOC-R3 [Medium]. Headline stats ignore active filters (aggregate/groupBy without mentionWhere) while response claims "across filtered mentions" (route.ts:141-156).
- SOC-R4 [Medium]. isNewAccount heuristic dead: author_created_utc not present in Reddit search listings → +20 bonus never fires (scanners.ts:152-155).
- SOC-R5 [Medium]. Top-promoter dedup keyed author@platform where Serper hardcodes author:"unknown" → "unknown@Reddit" becomes #1 promoter; promoter pages chase a phantom (orchestrate.ts:84-111, scanners.ts:745).
- SOC-R6 [Low]. Perplexity citations fabricated into mentions with synthetic text/engagement.
- SOC-R7 [Low]. Fake-engagement heuristics thin (no posting-frequency/copy-paste/coordination detection despite prompt asking).
- SOC-R8 [Low]. No TIMED_OUT badge case in admin UI — timed-out runs render as plain text, unnoticed.

## SECURITY
- SOC-S1 [High]. Automated password+TOTP login to OWNER'S PERSONAL Discord/Reddit/Twitter/Instagram/Facebook accounts (session-manager.ts:190-331; authenticator.generate). Discord self-botting = permanent ban; CFAA/ToS exposure; personal TOTP seeds are collateral. Credentials being collected via env/admin UI TODAY even though code can't run. FIX: remove; burner research accounts/official APIs/compliant vendor.
- SOC-S2 [Medium]. Cookies/credentials stored UNENCRYPTED when BROWSER_AGENT_ENCRYPTION_KEY unset; aes-256-cbc without integrity; hex key silently truncates (session-manager.ts:382-396,32). FIX: require key, aes-256-gcm.
- SOC-S3 [Medium]. Platform passwords + 2FA seeds as env vars surfaced in admin integrations screen; email sensitive:false (config.ts:124-141, integrations.ts:789-832).
- SOC-S4 [Low]. capture route relays arbitrary admin URL to thum.io (no validation; internal URLs leak); fabricates COMPLETED browser session (capture/route.ts:34-50).
- SOC-S5 [Low]. execSync(curl "${url}") shell interpolation in legacy scanners (CI-only). Replace with fetch.
- SOC-S6 [Low]. real-social-scan.yml uploads to Supabase Storage with ANON key + x-upsert:true → bucket must be public-writable → anyone with the public anon key can overwrite scan artifacts. Use service-role in CI; lock bucket policy.

## RANKED DIAGNOSIS (instability)
1. Synchronous 2–5-min scan inside Vercel request; killed function = total loss + stuck RUNNING.
2. Scanner sleep math broken at 50 tickers (Reddit ≥125s vs 120s cap; StockTwits ~100s+; Perplexity 60–160s); Promise.race discards partials.
3. Reddit/StockTwits block datacenter IPs.
4. No fetch timeouts/retry policy anywhere; 429 mishandled.
5. No idempotency (no unique key; per-row ingest; duplicates).
6. Phantom features (browser-agent queue to nowhere, broken persistence, missing TIMED_OUT badge) amplify perceived instability.

## TOP 5 COST REDUCTIONS
1. Kill double-spend + go async (poll instead of re-scan) — up to ~50% on failure days, fixes #1 instability.
2. Serper num:10 + merged query + top-20 tickers — 75–85% Serper savings.
3. Tier paid scanners (Perplexity only for ≥2 pattern-flagged mentions) — 60–80% Perplexity savings.
4. Global dedup before screening + cross-run seen-URL cache (unique index) — 30–60% screening/storage savings.
5. Pattern quality fixes (longest-match, drop generic LOW patterns, mainstream subs, word-boundary tickers) — 30–50% fewer screened mentions; biggest signal-quality win.
Bonus: delete real-time-social-scanner.ts; consolidate 3 stacks onto src/lib/social-scan; remove or ship browser agents.
