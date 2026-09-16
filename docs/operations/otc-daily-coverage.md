# Daily OTC coverage

## Scope and limits

The weekday enhanced daily evaluation refreshes FMP's paginated OTC company screener on every run. It scans active USD equity candidates with an ISIN: common/ordinary shares and ADRs, including foreign issuers quoted OTC. It is **provider coverage, not comprehensive OTC market coverage**. FMP does not identify reliable OTCQX/OTCQB/Pink/Expert/grey tiers in these responses. Every evaluated row records `marketTier: UNKNOWN`; no tier-wide coverage, eligibility, liquidity, tradability, or fraud claim follows from inclusion.

Inactive issues, invalid identities, funds/ETFs, named trusts, preferreds, warrants, rights, units, debt, and certain ambiguous fifth-letter instruments are excluded. Classification combines explicit provider flags with conservative name/suffix rules; it is not a verified common-stock security master. Absence of explicit classifications is a data limitation, not evidence of common-share status. New paid subscriptions are not required for the verified directory/profile/history/splits endpoints; authoritative tier/security-class completeness remains unverified.

Current directory membership and profile identity must agree. There is no automatic old/new ticker aliasing or history splicing. Former listings, changed symbols/names, conflicting directory rows and duplicate ISINs are quarantined; an old tracked row is not evidence of current coverage. Existing exchange metadata is refreshed only when the scan date is later than the latest stored scan date and the evaluation timestamp is at least as recent as the latest stored evaluation. Same-day reruns leave exchange metadata unchanged because existing successful daily snapshots are immutable; an observation whose timestamp will not be persisted cannot change metadata.

## Ingestion identity quarantine

The database still identifies tracked securities by symbol and does not store a permanent ISIN. Before attaching a new evaluation, ingestion compares every incoming issuer name with the existing tracked issuer when either side is OTC. Case, Unicode presentation, whitespace and punctuation differences are ignored; issuer words and share-class words are retained. A conflict quarantines **all incoming rows for that symbol**, including earlier conflicting duplicates. The stored issuer, exchange metadata, snapshots, risk alerts and promoted-stock records are not changed for that symbol. Unaffected listed and OTC rows continue ingesting.

The response is `success: false`, `partial: true`, with `identityQuarantines` containing the symbol, stored/incoming names, incoming security identifier and `OTC_ISSUER_NAME_CONFLICT` reason. `totalProcessed` and summary evaluated/risk counts include accepted rows only; `skipped` includes quarantined rows. Source-universe totals remain visible. Quarantine is not counted as missing price data. Details persist in `DailyScanSummary.byExchange.OTC.identityQuarantines`, alongside the normal numeric exchange counts. The source artifact preserves the original ISIN and evaluation provenance.

Dates with unresolved quarantines remain pending and retry on the normal ingestion schedule. A corrected source artifact that matches the stored issuer can clear the quarantine on retry without duplicating existing snapshots. A genuine issuer replacement or unresolved legal rename requires identity reconciliation; never resolve it by relabeling historical records or treating a name match as proof of ISIN continuity. This conservative gate can quarantine legitimate renames. It does not detect a changed ISIN when the issuer name remains identical. No database migration or claim of complete security-master identity coverage is introduced.

## Data and scoring safety

A successful OTC evaluation requires a same-price-date, positive-volume terminal bar, at least 30 valid unique OHLCV observations, at least 20 positive-volume observations within 45 calendar days, and the last 30 observations spanning no more than 50 calendar days with no gap over seven days. All prices must be positive and internally consistent. Missing market cap, identity, currency, prices, or action data prevents scoring. This deliberately excludes many illiquid OTC securities; they remain visible in coverage failures, never LOW.

Split records must have valid dates, matching symbols if supplied, and positive numeric factors. A split anywhere in the scoring window, or an unexplained greater-than-fivefold price discontinuity, blocks scoring until adjustment/identity review. We do not guess corporate-action adjustment factors. This conservative rule can exclude genuine extreme moves too; it must not be described as a clean bill of health.

OTC runs the existing deterministic scorer, including OTC structural risk. Python model outputs are not requested for this new OTC path. Valid HIGH results enter the existing bounded news/social pipeline. An older listed-path result cannot survive a conflicting refreshed OTC directory record, even when OTC evaluation fails. Missing/insufficient data never becomes a successful LOW result.

## Scheduling, cost and artifacts

- Main schedule: weekdays at 23:00 UTC; existing market holiday gate remains.
- Ingestion: daily at 07:00 UTC, including Saturday so Friday scans do not wait until Monday.
- Eight OTC acquisition workers share a 250 ms minimum request-start interval; up to three attempts per request, 20-second request timeout. Authentication/entitlement failure opens a circuit.
- OTC acquisition stops new requests at 45,000 calls or 150 minutes, whichever comes first. Remaining outcomes explicitly report budget exhaustion. Candidate order rotates by price date to avoid permanent alphabetical starvation when the budget is exhausted. Directory pagination is bounded to 20 pages and rejects repeated pages; it never calls a single 10,000-row page comprehensive.
- No additional AI budget is introduced. Existing downstream candidate/token budgets apply to the combined results.
- `otc-coverage-YYYY-MM-DD.json`: actual start/creation/completion times, directory retrieval time, raw/eligible counts, per-symbol evaluated/excluded/failed outcomes, security identifiers, price dates and actual evaluation times when available, source, request count and explicit scope limitations. Checkpointed each 100 attempted candidates and at completion.
- Successful rows retain actual `evaluatedAt`, source, security identifier and price date in the evaluation artifact. Database snapshots retain `scanDate`, actual `evaluatedAt` and database `createdAt`. A historical price date never rewrites evaluation time into the past.
- OTC coverage accompanies scan status and summary artifacts in Supabase Storage and GitHub artifacts/data repository. An OTC outage preserves listed scans and marks phase one degraded. Partial results do not establish full OTC coverage.
- Test mode cannot publish result artifacts to Supabase or the data repository. The separate **OTC Coverage Validation** workflow runs the same acquisition/scoring without publication, news/social processing, or database writes.

## Verification and operations

Inspect coverage denominators and reasons, not only workflow success. Verify the artifact uploaded successfully, actual OTC snapshots exist under the intended production project (`gwzcluijtbuglznwdqqk`), timestamps are real, and the nightly workflow is active. Dated result-artifact upload failures now fail the publication step; legacy scheme/promoter database uploads still use their existing best-effort behavior. Existing ingestion/publication is not a transactional generation system; unrelated release work remains separate.

Production verification must distinguish implemented, deployed, acquisition-validated, and persisted daily results. A limited validation run or a historical reconstruction is not a contemporaneous alert. Historical-price validation uses the current provider directory/profile at actual evaluation time; it is not a point-in-time historical universe or market-cap reconstruction. The 29-symbol September SEC filing-delinquency cohort is a diagnostic only: missing names are not LOW and inclusion does not establish fraud or current tradability.

Provider reference: [FMP Available Exchanges](https://intelligence.financialmodelingprep.com/developer/docs/stable/available-exchanges). Entitlements and response shapes were checked using existing production credentials on September 16, 2026; keys are never written into reports or client code.
