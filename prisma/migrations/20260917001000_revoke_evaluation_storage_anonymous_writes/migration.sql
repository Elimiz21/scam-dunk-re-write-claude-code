-- Apply only after every evaluation-data uploader is verified using the
-- server-side SUPABASE_SERVICE_ROLE_KEY. Public read policies are retained.
-- This removes anonymous/public INSERT, UPDATE, or ALL policies scoped to the
-- evaluation-data bucket without changing policies for unrelated buckets.

DO $policy_cutover$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND roles && ARRAY['anon'::name, 'public'::name]
      AND (
        COALESCE(qual, '') ILIKE '%evaluation-data%'
        OR COALESCE(with_check, '') ILIKE '%evaluation-data%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      policy_record.policyname
    );
  END LOOP;
END
$policy_cutover$;

DO $verify_cutover$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND roles && ARRAY['anon'::name, 'public'::name]
      AND (
        COALESCE(qual, '') ILIKE '%evaluation-data%'
        OR COALESCE(with_check, '') ILIKE '%evaluation-data%'
      )
  ) THEN
    RAISE EXCEPTION 'evaluation-data anonymous/public write policy remains';
  END IF;
END
$verify_cutover$;
