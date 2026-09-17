-- Private operational evidence, deliberately outside the Prisma/public API schema.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA IF NOT EXISTS identity_quarantine;
REVOKE ALL ON SCHEMA identity_quarantine FROM PUBLIC;
CREATE TABLE identity_quarantine."IssuerRecovery" (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE identity_quarantine."IssuerRecovery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_quarantine."IssuerRecovery" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE identity_quarantine."IssuerRecovery" FROM PUBLIC;
DO $restrict_identity_quarantine$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA identity_quarantine FROM anon;
    REVOKE ALL ON TABLE identity_quarantine."IssuerRecovery" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA identity_quarantine FROM authenticated;
    REVOKE ALL ON TABLE identity_quarantine."IssuerRecovery" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA identity_quarantine TO service_role;
    REVOKE ALL ON TABLE identity_quarantine."IssuerRecovery" FROM service_role;
    GRANT SELECT, INSERT ON TABLE identity_quarantine."IssuerRecovery" TO service_role;
    CREATE POLICY service_evidence_read ON identity_quarantine."IssuerRecovery"
      FOR SELECT TO service_role USING (true);
    CREATE POLICY service_evidence_archive ON identity_quarantine."IssuerRecovery"
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END
$restrict_identity_quarantine$;
