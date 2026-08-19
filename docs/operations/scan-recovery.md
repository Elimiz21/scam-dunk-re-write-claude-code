# Scan recovery and replay

When the enhanced daily scan is degraded, its results are deliberately retained
at `evaluation-data/quarantine/<date>/<generation>/` in Supabase quarantine storage and the workflow artifact, but are not copied to
the data repository. The status file is `evaluation/results/scan-status-<date>.json`
and the per-generation journal is named
`evaluation/results/news-analysis-journal-<date>-<generation>.json`.

Publication is committed by the generation manifest and the final
`scan-current-generation-<date>.json` pointer. The manifest must name the
enhanced evaluation, matching status, and journal; pipeline validation must be
healthy; and the quarantine upload receipt must confirm those exact files under
the same generation prefix. Missing or mismatched files block both Supabase
root promotion and the data-repository push, including `upload_only` runs.

Use **Actions → Enhanced Daily Stock Evaluation → Run workflow** and supply:

- `replay_symbols`: comma-separated unresolved symbols, for example `ABC,DEF`.
- `replay_of_generation`: the prior journal generation ID, for provenance.

Replay symbols are prioritized inside the existing normal candidate cap. Every
replay creates a new journal and generation timestamp; it is not a bit-for-bit
historical reconstruction. Do not clear remediation merely because a workflow
ran: inspect the new status and journal, and clear it only when all journal
tasks are resolved, Phase 3 is completed, and the publication check reports
publishable. The ingestion service follows the current-generation pointer and
reads one coherent generation; it does not combine mutable root aliases from
different runs.
