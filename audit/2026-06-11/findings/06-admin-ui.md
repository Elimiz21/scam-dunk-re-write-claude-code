# Findings: Admin UI (26 pages, two review batches)

Reviewer: line-by-line audit, 2026-06-11

## CROSS-CUTTING (verified across all admin pages)

### UI-X1 [High] No fetch in ANY admin page uses AbortController (grep: zero matches under src/app/admin)
Stale responses overwrite newer ones; setState after unmount. Race triggers itemized per page below.

### UI-X2 [High] useAdminFetch hook (src/hooks/useAdminFetch.ts) is DEAD CODE — imported by zero files
All ~21 pages hand-roll the same loading/error/success+fetch pattern it was written to replace, each with slightly different bugs. The hook itself also lacks AbortController — add cancellation + success auto-clear to the hook first, then migrate.

### UI-X3 [Medium] Pages fire admin API fetches before the client session check resolves (AdminLayout checkSession runs in parallel with page mount effects) — unauthenticated visitors burn the 60/min admin rate limit on 401s; middleware only matches /api/admin/*, not /admin pages.

### UI-X4 [Medium] Stuck-error family: market-analysis, risk-alerts, scan-intelligence/stock, scheme, promoter pages never setError("") on refetch and gate the WHOLE page on `if (error)` — one transient failure bricks the page until remount (market-analysis/page.tsx:67-101; risk-alerts/page.tsx:74-123; stock/[symbol]:137-171; scheme:120-160; promoter:100-150 — promoter co-promoter navigation permanently breaks).

### UI-X5 [Medium] Silent-failure family: all five news pages (news, blog list, media list, blog editor, media editor) use `if (res.ok) refetch; catch console.error` for fetch/toggle/delete — failed deletes/publishes give ZERO feedback; failed list fetch renders as "No posts found".

### UI-X6 [Low] DataTable key={index} on rows (DataTable.tsx:77); add rowKey prop.
### UI-X7 [Low] window.confirm for destructive actions across pages; no pending/disabled state on most mutation buttons (double-submit duplicates).
### UI-X8 [Low] Labels not associated (no htmlFor/id) across all admin forms; icon-only buttons without aria-label; tr onClick rows keyboard-inaccessible; modals lack role=dialog/focus trap/Escape.

## HIGH (page-specific)

### UI-H1. Blog editor preview renders post.content with dangerouslySetInnerHTML COMPLETELY UNSANITIZED
[XSS] admin/news/blog/[id]/page.tsx:633 — content flows from raw .html file import (file.text(), line 188), mammoth docx, textToHtml whose link regex passes javascript: hrefs (line 218), and the DB (API stores raw). DOMPurify applied ONLY on public renderer (post-client.tsx:153), never admin. Admin previewing an HTML file from an untrusted source executes XSS in the authenticated admin origin.
FIX: DOMPurify.sanitize in preview + on import + server-side on POST/PUT.

### UI-H2. email-management: log search fires one fetch per keystroke, no debounce, no abort → out-of-order results routinely overwrite newest query (page.tsx:220,226-230,1283-1286)
### UI-H3. users/support: fetchUsers/fetchTickets race on fast page/filter changes (no abort, no sequence guard) (users:120, support:189)
### UI-H4. social-scan admin page: per-keystroke ticker filter with no abort — classic race, table+stats+pagination can show stale filter (page.tsx:267-301,857-866)
### UI-H5. stock-lookup: typeahead fires per keystroke, no debounce/abort; "AA" results can replace "AAPL" results (page.tsx:87-104,166-171)
### UI-H6. scan-intelligence: double fetch on mount races when arriving with ?date= (two mount effects, no-date response can win over requested date) + rapid date clicks race (page.tsx:266-312)
### UI-H7. browser-agents: "Clear 30d+" deletes sessions with ZERO confirmation, no pending state (page.tsx:656-662,292-306)
### UI-H8. market-analysis + risk-alerts: one failed fetch bricks page forever (see UI-X4)
### UI-H9. promoter page: co-promoter navigation re-runs effect with stale error/loading never reset → permanent "Promoter not found" after one failure (page.tsx:100-150,407-411)

## MEDIUM (selected, page-specific)

- UI-M1. scan-status: live AI panel swallows all errors and silently disappears (page.tsx:341,367); 30s polling never pauses when tab hidden (350); poll has no abort; PhaseRow expanded state never syncs on date change (234); post-load errors invisible (698); 1,274-line client monolith.
- UI-M2. users: debounce effect double-fetches on mount (109); plan filter doesn't reset pagination (105); stale success+error banners coexist (164); dropdown no outside-click/Escape close (273); destructive plan-downgrade/reset with no confirm (287).
- UI-M3. team: copyToClipboard setTimeout untracked → setState after unmount + erases later success messages (122); updateMember no submitting state/confirm (98); clipboard write not awaited (120); no empty state (236).
- UI-M4. support: debounce double-fetch on mount (178); filters don't reset page (174); reply draft responseText LEAKS ACROSS TICKETS (171 — close A with draft, open B, draft ready to send to wrong customer); no feedback while details load (393).
- UI-M5. scan-messages: drag-drop reorder leaves stale order values on success — number badges show wrong sequence until reload (304-321); Add/Update/Restore/Review no in-flight disabled (132,501,672,588).
- UI-M6. homepage: key={index} on AI-suggestions list that is FILTERED on accept (415 + 215-221); "Use This" no disabled → duplicate heroes on double-click (199); window.confirm deleting the ACTIVE hero with no special warning (150).
- UI-M7. integrations: Enabled toggle saves immediately and closes modal, DISCARDING unsaved budget/rate edits (537-541 + 142); parseFloat||null makes 0 unrepresentable; uncontrolled defaultValue mixed with state (568,585,564); "Clear Stored" closes credentials modal even when confirm cancelled (630); Save Changes no disabled (604).
- UI-M8. api-usage: period switch race (55); alert deletion no confirmation at all (174); threshold input can submit NaN (353).
- UI-M9. blog editor: mammoth imported statically (20 — heavyweight in bundle; lazy-load in docx branch); sidebar publish toggle bypasses publishedAt logic → published posts with publishedAt:null (659-672 vs 336-340); title edit silently rewrites slug of published posts → breaks live URLs (133-141); file import no size limit + alert() errors (153-202); effect keyed on isNew not params.id → back/forward shows wrong post (84-89, same media editor 49-53); img onError display:none never reset (751-753, media 409-411); author select can't represent stored author (691-704).
- UI-M10. scan-intelligence: keyless fragment wrapping keyed rows (805 — Fragment key needed; same social-scan 1060); post-load errors invisible (342-346,416); stock explorer search refetches per keystroke no debounce (986); schemeFilter=new sets sort value the select doesn't offer (309).
- UI-M11. scheme page: price-journey bar divides peakPrice by itself — always 100%, conveys nothing (346); downloads EVERY scheme to find one (123-127; promoter same 103); bare catch swallows reason (141).
- UI-M12. promoter page: in-place .sort() MUTATES React state during render (290-291,402-403) + key={i} on sorted output.
- UI-M13. data-ingestion: render-phase .sort().reverse() mutates state (561-563,220); ingestAll continues past failures, reports only last error, double-click can overlap runs (217-223).
- UI-M14. model-efficacy: risk filter doesn't reset pagination (95-97); three unguarded fetches race on days churn (90-141); feedback buttons no pending state → duplicate feedback rows SKEW ACCURACY METRICS (143-158); "No scans found" while still loading (509).
- UI-M15. news dashboard: stats failures swallowed → fabricates "0 Total / 0 Published" (29-41).
- UI-M16. browser-agents: saveConfig never checks res.ok, can partially save before JSON.parse throws raw SyntaxError; success banner on server 500 (308-342); pagination fetch no abort (203-224).
- UI-M17. stock-lookup: JSON.parse(signals) in render with no guard — malformed string white-screens page (430); search errors swallowed (97-103); days change doesn't refresh displayed stock (205).
- UI-M18. risk-alerts: acknowledgeAlert swallows failures, no pending state (92-105); DUMP_DETECTED missing from type filter while cards show it (161-171).
- UI-M19. settings: session fetch duplicates AdminLayout's, failures swallowed → owner-only email form silently never renders (47). [Otherwise cleanest page: proper labels, disabled states.]

## SHARED COPY-PASTE CLUSTERS (consolidation targets)
1. Hand-rolled fetch/loading/error block in 21 pages (the exact pattern useAdminFetch was written for) — most never clear error on retry, none abort.
2. Silent `if(res.ok) refetch / console.error` mutation pattern in all 5 news pages.
3. Debounced-search + pagination trio duplicated (users/support/email-mgmt) incl. same fires-on-mount double-fetch bug; email-mgmt omitted the debounce and got the worst race.
4. trigger-scan handler duplicated verbatim (social-scan 303-335 vs browser-agents 258-290).
5. Social-mention evidence card copy-pasted 3× (scan-intelligence 696-724, scheme 616-651, promoter 355-384).
6. "Fetch whole collection then .find() by id" detail-loader duplicated (scheme/promoter).
7. Success auto-clear effect duplicated correctly 2× (scan-messages 125-130, homepage 74-79) and INCORRECTLY 1× (team 122).
FIX: extend useAdminFetch with AbortController + auto-clear + debounced-list helper; one MentionCard; one useDetailFetch(id); migrate pages (removes ~300+ lines and the race/stuck-error families in one move).
