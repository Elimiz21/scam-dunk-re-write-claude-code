# Canonical daily-price dataset runbook

## Purpose and boundary

The weekday enhanced scan reads a versioned 100-bar OHLCV dataset from
Supabase Storage before Phase 1 begins. It does not mount an iMac volume and
does not call `historical-price-eod/full`. The iMac worker is a separate,
local process that reads a configured local export, validates it, and can
publish it to the configured Supabase bucket.

The existing bounded FMP calls in Phase 3 remain only for candidate news,
SEC filings, and press releases. No price-vendor credential is added to
GitHub Actions. `FMP_API_KEY` remains the existing secret for those Phase-3
calls only.

## Immutable layout and promotion

For run `RUN_ID`, the worker writes:

```text
v1/runs/RUN_ID/scan-window.json
v1/runs/RUN_ID/manifest.json
v1/current.json
```

`scan-window.json` holds exactly 100 date-ascending bars for each expected
instrument. Every bar has OHLCV plus `adjustmentBasis`, `sourceVendor`,
`vendorAsOf`, and `ingestionRunId`. The manifest records schema version,
freshness, exact coverage and symbol resolution, object byte length, and
SHA-256 checksum.

Promotion uploads immutable objects without overwrite, downloads and hashes
them again, then atomically replaces only `v1/current.json`. Consumers accept
only a pointer whose manifest checksum matches and whose assets stay under
that run's immutable path.

## Required configuration

Create a **private, dedicated** Supabase Storage bucket and configure a
read-only policy for the existing application anon role to download only the
dataset objects. Do not use a public bucket until vendor licence rights have
been confirmed. Configure these without committing values:

| Where | Required setting | Purpose |
| --- | --- | --- |
| iMac only | `SCAMDUNK_PRICE_INPUT_PATH` | File or directory containing the local JSON export. |
| iMac only | `SCAMDUNK_PRICE_EXPECTED_SYMBOLS_PATH` | JSON array of symbols or objects with `symbol`; normally a copied, reviewed scan universe. |
| iMac only | `SCAMDUNK_PRICE_SOURCE_VENDOR` | Licensed source identifier. |
| iMac only | `SCAMDUNK_PRICE_VENDOR_AS_OF` | ISO-8601 vendor timestamp for this extraction. |
| iMac only | `SCAMDUNK_PRICE_ADJUSTMENT_BASIS` | `split_adjusted`, `unadjusted`, or `total_return`. |
| iMac only | `SCAMDUNK_PRICE_OUTPUT_DIR` | Optional local artifact inspection directory. |
| iMac only | `SCAMDUNK_PRICE_PUBLISH=true` | Enables promotion after validation; default is validate-only. |
| iMac only | `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL. |
| iMac only | `SUPABASE_SERVICE_ROLE_KEY` | Publish credential; keep only in the local protected env file/keychain. |
| iMac and Actions | `SCAMDUNK_PRICE_DATASET_BUCKET` | Dedicated Storage bucket name. |
| Actions reader | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Read-only dataset access under bucket policy. |
| Actions variable | `SCAMDUNK_PRICE_DATASET_MAX_AGE_HOURS` | Freshness gate, default 36. |

Do not set `SUPABASE_SERVICE_ROLE_KEY`, a local volume path, or a local
dataset credential in GitHub Actions. The iMac worker has no HTTP endpoint.

## iMac input contract and execution

Input is one JSON file (array or `{ "bars": [...] }`) or a directory of
those files. Each bar must include:

```json
{
  "symbol": "ABC",
  "date": "2026-08-16",
  "open": 10.0,
  "high": 11.0,
  "low": 9.0,
  "close": 10.5,
  "volume": 1000,
  "adjustmentBasis": "split_adjusted",
  "sourceVendor": "licensed-local-feed",
  "vendorAsOf": "2026-08-16T20:30:00.000Z",
  "ingestionRunId": "2026-08-16T21-00-00Z-imac"
}
```

First run in validation-only mode and inspect `SCAMDUNK_PRICE_OUTPUT_DIR`:

```bash
npx ts-node evaluation/scripts/imac-daily-price-ingestion.ts
```

After the deployment checklist passes, set `SCAMDUNK_PRICE_PUBLISH=true` in
the iMac-only environment and run the same command. A failed validation or
publish must leave `v1/current.json` unchanged.

## Cutover, rollback, and reconciliation

1. Confirm the SSD path, export coverage, source as-of time, and vendor
   redistribution rights independently. This repository does not assume any
   of them are available.
2. Create the dedicated bucket and least-privilege read/write policies; store
   the service-role key only on the iMac.
3. Run validation-only using a fixture/export and verify exact symbol coverage,
   100 bars per instrument, checksum, adjustment basis, and freshness.
4. Promote one run. Confirm `v1/current.json` points to it and run a manual
   `TEST_MODE=true` scan with the Actions reader credentials.
5. Enable the workflow only after its scan-status reports the new run ID and
   `fmpHistoryCalls: 0`.

To roll back, repoint `v1/current.json` to a previously verified immutable
manifest and its checksum. Never overwrite a run object. If a split, dividend
adjustment, symbol change, or vendor correction occurs, create a new run from
the corrected source and promote it; do not mutate the old run.

## Operational gates and call budget

The scan fails closed when the pointer or manifest is invalid, the manifest is
older than the configured gate, coverage is partial, a symbol cannot resolve,
or a checksum/100-bar/provenance invariant fails. Every instrument's terminal
bar must equal `latestTradingDate`, which may be no more than one weekday
behind the scan date. Its Phase-1 status records
the run ID, vendor timestamp, Storage reads, and `fmpHistoryCalls: 0`.

Expected routine price budget: exactly three Storage objects per run
(`current`, `manifest`, `scan-window`) and zero FMP full-history requests.
Phase-3 FMP evidence requests remain bounded by the existing candidate cap
and batch configuration (at most three FMP evidence calls per selected
candidate, currently 600 at the default cap of 200); investigate any new
Phase-1 FMP price call as a release-blocking regression.

## Deployment blockers at handoff

- The iMac SSD layout, completeness/freshness, and licence/redistribution
  rights have not been verified here.
- No dedicated Supabase bucket, RLS policy, reader credentials, or iMac
  service-role configuration was available in this worktree.
- The worker is therefore delivered as a validated, fixture-testable scaffold;
  no dataset has been published and no claim is made that the iMac is attached.
