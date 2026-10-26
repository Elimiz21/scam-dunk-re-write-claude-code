# Validated risk release candidate

This release repairs software and evidence contracts. It does not establish real-world precision, recall, a guaranteed response time, confirmed manipulation, or broker commercial readiness.

## Frozen rules candidate

`python_ai/scoring-policy.json` defines `rules-2026-10-25-v2`. Points are deduplicated by signal code and by correlated price/volume family (maximum contribution per family). MEDIUM begins at 2 points. HIGH begins at 5 points with an explicit material-activity code or independent alert/behavioral/social evidence; regulatory alert-list hits remain HIGH. Structural weakness or RSI/overbought observations alone cannot imply an active warning. Raw points are not calibrated probabilities.

The TypeScript engine determines published categories and points for daily listed/OTC, customer web/mobile, the legacy AI endpoint and messaging. Python model layers are diagnostic and cannot raise or lower those published categories. The Python rules policy shares the same decision fixtures. RF/LSTM remain disabled; numerical efficacy needs independent, sealed, time/issuer-separated labels.

## Data and review contracts

Freshness uses the declared 2026–2028 exchange calendar. Interactive EOD data is due after 17:00 America/New_York; earlier requests use the preceding completed session. Missing/invalid/sparse bars and unresolved corporate actions remain unavailable or explicitly partial. A current vendor identifier does not prove point-in-time historical issuer identity; independent identity conflicts remain quarantined.

News retrieval plans every eligible scored instrument, including LOW/MEDIUM. The default window is the scan date through seven preceding calendar days. All three source outcomes are distinct: found, successful empty, error, unavailable. Retained source records include date window, retrieval time and raw evidence; future, undated, out-of-window or wrong-symbol records cannot clear a result. Model clearance selects a schema-constrained event/source pair and attaches the literal retained excerpt. One bounded retry addresses invalid decisions; automatic SDK retries are disabled. Ambiguous calls retain a conservative budget reservation. The total configured model budget is capped at $25. Production reruns restore the dated cost ledger and validated decisions with the source cache; cancellation stops and waits for the worker before saving that state. Isolated validation has its own retained cache lineage and its measured spend is reported separately. Source billing is unavailable unless independently reconciled. Full-cohort completion requires accounted coverage and no deferred/failed/unavailable review.

Reviewed triage is separate from raw rule risk. Cleared candidates cannot reappear as reviewed suspicious alerts solely because their raw category remains HIGH. Independent regulatory/behavioral warnings survive clearance. Public radar displays review status and raw-observation language. It ranks only the current scoring version and displays original signal points. History orders by category and recency; incompatible older scores are unavailable rather than compared as current points. Scheduled history preserves the source scoring version. Tracker declines/delistings are not labelled confirmed fraud.

## Durable completion

The user/request-key ledger serializes duplicate requests, requires a matching input fingerprint, reserves one credit and stores the exact result before success. A failed commit cannot acknowledge an unsaved result. Lease recovery refunds the original month once; stale workers cannot overwrite a new lease. History links use the immutable result ID. Payloads retain results/signals/narrative/version/date/usage, not raw pitch text or uploaded chat contents. Existing account deletion cascades the operation ledger and removes histories.

## Release controls

`npm run build` does not migrate a database. Vercel's release wrapper applies the manifest only with `SCAMDUNK_RELEASE_MIGRATIONS=true`. It verifies deployment project and database/storage identity, checks exact migration hashes, executes an atomic additive transaction with lock/statement timeouts, and supports safe retries. Production has no Prisma migration history; do not blindly run `prisma migrate deploy` or apply generated destructive schema-diff SQL to it. Existing legacy columns/indexes remain preserved.

The manifest repairs missing tables/columns, adds durable scan completion and news triage, and restricts direct database client roles. Staging access restrictions have been independently reviewed and applied. Its original ACLs and an emergency restore script are retained through Codex Security artifact storage. Verify existing service privileges remain unchanged.

Stage an exact committed candidate in an isolated environment, run positive/negative user flows, then stage production without domain promotion. Promote the exact tested build after live verification. Keep the prior working production deployment for rollback. Do not reset issuer identity fences or clear incomplete reviews to force a desired stock count.

## Server HTML compatibility

Keep DOMPurify on its current security release. The sanitizer scopes jsdom to 26.1.0 because the newer CommonJS entry loads ESM-only transitive modules that fail in Vercel's loader. This follows the [upstream isomorphic-dompurify compatibility approach](https://github.com/kkomelin/isomorphic-dompurify/issues/394). The Node24 regression disables require(ESM), loads the actual sanitizer, and checks executable input plus safe formatting, links and tables. Recheck the dependency audit and actual server logs after deployment; client hydration can mask the server error. Remove the compatibility pin only after the replacement passes this same runtime check.

## Remaining external gates

Independent labels, outcome/horizon definitions and approved acceptance criteria are needed for F07/F13 efficacy. Point-in-time security/action evidence is needed for historical identity claims. Broker service/tenant contracts, data redistribution rights and commercial/privacy agreements require qualified owner approval. The category evaluator always reports NOT_APPROVED; fixture tests cannot satisfy these gates. User-designated messaging destinations are provided privately in the conversation and must not appear in artifacts or public logs.
