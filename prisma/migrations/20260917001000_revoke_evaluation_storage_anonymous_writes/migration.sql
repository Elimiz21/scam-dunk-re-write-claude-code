-- Apply only after every evaluation-data uploader is verified using the
-- server-side SUPABASE_SERVICE_ROLE_KEY. Public read policies are retained.
--
-- Safety model: only simple, single-bucket policies can be classified here.
-- Exact evaluation-data writes are removed. Exact writes for another single
-- bucket are preserved. Any broad, mixed-bucket, function-based, or otherwise
-- unrecognized anon/public write policy aborts the migration before mutation.

BEGIN;

DO $preflight$
DECLARE
  policy_record record;
  predicate text;
  simple_bucket text;
BEGIN
  FOR policy_record IN
    SELECT policyname, cmd, permissive, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND roles && ARRAY['anon'::name, 'public'::name]
  LOOP
    IF policy_record.permissive <> 'PERMISSIVE' THEN
      RAISE EXCEPTION
        'Restrictive storage write policy % requires manual review; refusing evaluation-data cutover',
        policy_record.policyname;
    END IF;
    predicate := CASE
      WHEN policy_record.cmd = 'INSERT' THEN policy_record.with_check
      WHEN policy_record.cmd = 'UPDATE' THEN
        CASE WHEN policy_record.qual = policy_record.with_check
          THEN policy_record.qual ELSE NULL END
      ELSE
        CASE WHEN policy_record.qual = policy_record.with_check
          THEN policy_record.qual ELSE NULL END
    END;
    simple_bucket := substring(
      COALESCE(predicate, '')
      FROM '^\(?bucket_id = ''([A-Za-z0-9_-]+)''::text\)?$'
    );
    IF simple_bucket IS NULL THEN
      RAISE EXCEPTION
        'Unrecognized anon/public storage write policy %.% (%); refusing evaluation-data cutover',
        'storage.objects', policy_record.policyname, policy_record.cmd;
    END IF;
  END LOOP;
END
$preflight$;

DO $policy_cutover$
DECLARE
  policy_record record;
  role_list text;
  replacement_name text;
BEGIN
  FOR policy_record IN
    SELECT policyname, cmd, qual, roles
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND roles && ARRAY['anon'::name, 'public'::name]
      AND (
        (cmd = 'INSERT' AND with_check = '(bucket_id = ''evaluation-data''::text)')
        OR
        (cmd IN ('UPDATE', 'ALL')
          AND qual = '(bucket_id = ''evaluation-data''::text)'
          AND with_check = '(bucket_id = ''evaluation-data''::text)')
      )
  LOOP
    IF policy_record.cmd = 'ALL' THEN
      replacement_name := policy_record.policyname || ' read only';
      IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = replacement_name
      ) THEN
        RAISE EXCEPTION 'Read-policy replacement % already exists', replacement_name;
      END IF;
      SELECT string_agg(quote_ident(role_name), ', ')
      INTO role_list
      FROM unnest(policy_record.roles) AS role_name;
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO %s USING (%s)',
        replacement_name,
        role_list,
        policy_record.qual
      );
    END IF;
    EXECUTE format('DROP POLICY %I ON storage.objects', policy_record.policyname);
  END LOOP;
END
$policy_cutover$;

DO $verify_cutover$
DECLARE
  policy_record record;
  predicate text;
  simple_bucket text;
BEGIN
  FOR policy_record IN
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND roles && ARRAY['anon'::name, 'public'::name]
  LOOP
    predicate := CASE
      WHEN policy_record.cmd = 'INSERT' THEN policy_record.with_check
      WHEN policy_record.qual = policy_record.with_check THEN policy_record.qual
      ELSE NULL
    END;
    simple_bucket := substring(
      COALESCE(predicate, '')
      FROM '^\(?bucket_id = ''([A-Za-z0-9_-]+)''::text\)?$'
    );
    IF simple_bucket IS NULL OR simple_bucket = 'evaluation-data' THEN
      RAISE EXCEPTION
        'Anonymous/public evaluation-data write access may remain through policy %',
        policy_record.policyname;
    END IF;
  END LOOP;
END
$verify_cutover$;

COMMIT;
