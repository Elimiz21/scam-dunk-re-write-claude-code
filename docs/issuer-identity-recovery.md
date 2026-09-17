# September 2026 issuer identity recovery

This one-incident tool corrects the current LGMK and SNTX metadata. It archives
one unsupported LGMK observation from December 15, 2025 before removing that
observation from the normal price timeline. It never changes a price or claims
that the old observation belongs to LogicMark.

The proof manifest inside the tool pins the retained September 16 evaluation
hash and producer commit, current issuer identifiers, and official SEC/issuer
filings. Sector and industry are provider classifications from that retained
artifact; the official filings establish issuer identity and CUSIP.

## Prerequisites

- Apply `20260917020000_private_issuer_identity_quarantine` through the migration
  system. The archive is in the private `identity_quarantine` schema, outside the
  Prisma/public API schema. RLS is enabled and forced; anonymous/authenticated
  roles have no schema/table access. The service role has only SELECT/INSERT.
- Run with a privileged operational database connection supplied privately in
  `IDENTITY_RECOVERY_DATABASE_URL`. Never put its value in a command, report or
  shell history. Target validation binds the exact Supabase project via host/user
  and requires TLS; local fixtures require a loopback address.
- Pin both the reviewed tool hash and the captured manifest hash in the operator
  wrapper. Keep the manifest private. Capture uses exclusive creation and mode
  0600, so it does not overwrite an existing evidence file.

## Commands

```sh
node scripts/issuer-identity-recovery.cjs --target PROJECT_REF --capture /private/path/manifest.json
node scripts/issuer-identity-recovery.cjs --target PROJECT_REF --manifest /private/path/manifest.json
node scripts/issuer-identity-recovery.cjs --target PROJECT_REF --manifest /private/path/manifest.json --apply
node scripts/issuer-identity-recovery.cjs --target PROJECT_REF --manifest /private/path/manifest.json --restore
```

Capture and the default dry-run use read-only transactions. Apply/restore use a
SERIALIZABLE transaction and briefly lock the four relevant canonical tables
plus the archive. This also fences symbol-only promoted rows, which have no
foreign key to TrackedStock. Lock waits are bounded to five seconds, statements
to thirty seconds, and the client process to forty-five seconds. A busy publisher
causes failure rather than an unbounded wait. Failed commands have no successful
commit receipt; inspect state with dry-run before deciding whether to retry.

Apply requires exactly the reviewed two complete metadata rows, exactly the
reviewed snapshot, and zero related alerts/promoted rows or additional snapshots.
All before-images include PostgreSQL `record_send` bytes. Snapshot float columns
also have PostgreSQL's own roundtrip text representation, preserving signed zero,
null and exact binary values without JavaScript numeric serialization. Archive
creation, snapshot removal, metadata correction and postcondition verification
commit together. No original artifact bytes change. Unknown metadata fields and
timestamps outside the correction remain unchanged. The archive persists after
restoration and is not updated or deleted by this tool.

Repeated apply returns `ALREADY_APPLIED` only when the corrected metadata still
matches the archive and the unsupported snapshot remains absent. New normal
history does not cause another deletion. Restore is stricter: no new history,
alerts, promoted rows or changed corrected metadata may exist. It reconstructs
the original rows and requires exact original `record_send` equality before
commit. A second restore returns `ALREADY_RESTORED`. Apply after restore requires
fresh review; it does not automatically repeat the correction. A schema change
that prevents original binary equality also fails closed.

## Verification

```sh
IDENTITY_TEST_DATABASE_URL=postgresql://LOCAL_USER@127.0.0.1:LOCAL_PORT/LOCAL_DB \
  node --test scripts/issuer-identity-recovery.test.cjs
```

The test target is checked for loopback before hooks or cleanup can run. Tests
create and remove owned databases and temporary roles. They exercise full-row
archive/restore, IEEE float preservation, future fields, hostile delimiter text,
dry-run, idempotence, concurrent writes, stale fingerprints, related evidence,
late rollback and actual API/service role grants.

Production use requires a prior hosted staging rehearsal with owned fixtures and
a pinned tool/manifest. The operational rehearsal wraps fixture insertion,
apply, byte-verified restore and cleanup in an outer transaction that rolls back.
Never seed those fixtures into production; production already contains the exact
reviewed rows.
