# Scan recovery and replay

When the enhanced daily scan is degraded, its results are deliberately retained
at `evaluation-data/quarantine/<date>/<generation>/` in Supabase quarantine storage and the workflow artifact, but are not copied to
the data repository. The status file is `evaluation/results/scan-status-<date>.json`
and the per-generation journal is named
`evaluation/results/news-analysis-journal-<date>-<generation>.json`.

Use **Actions → Enhanced Daily Stock Evaluation → Run workflow** and supply:

- `replay_symbols`: comma-separated unresolved symbols, for example `ABC,DEF`.
- `replay_of_generation`: the prior journal generation ID, for provenance.

Replay symbols are prioritized inside the existing normal candidate cap. Every
replay creates a new journal and generation timestamp; it is not a bit-for-bit
historical reconstruction. Do not clear remediation merely because a workflow
ran: inspect the new status and journal, and clear it only when all journal
tasks are resolved, Phase 3 is completed, and the publication check reports
publishable.
