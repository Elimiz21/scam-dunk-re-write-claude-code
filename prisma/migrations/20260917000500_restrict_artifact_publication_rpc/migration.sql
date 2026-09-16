-- Supabase default privileges can grant these roles EXECUTE explicitly.
-- Revoking PUBLIC alone does not remove those independent grants.
REVOKE ALL ON FUNCTION public.claim_evaluation_artifact_publication(TIMESTAMP, INTEGER, TEXT, TEXT) FROM PUBLIC;
DO $restrict_publication_rpc$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.claim_evaluation_artifact_publication(TIMESTAMP, INTEGER, TEXT, TEXT) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.claim_evaluation_artifact_publication(TIMESTAMP, INTEGER, TEXT, TEXT) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_evaluation_artifact_publication(TIMESTAMP, INTEGER, TEXT, TEXT) TO service_role;
  END IF;
END
$restrict_publication_rpc$;
