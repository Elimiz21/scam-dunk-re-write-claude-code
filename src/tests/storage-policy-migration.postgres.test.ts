import { execFileSync } from "child_process";
import * as path from "path";

const databaseUrl = process.env.ARTIFACT_INTEGRATION_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("evaluation storage write-policy cutover", () => {
  const repo = path.resolve(__dirname, "../..");
  const migration = path.join(
    repo,
    "prisma/migrations/20260917001000_revoke_evaluation_storage_anonymous_writes/migration.sql",
  );
  const psql = (args: string[], input?: string) => execFileSync(
    "psql", [databaseUrl!, "-v", "ON_ERROR_STOP=1", ...args],
    { cwd: repo, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const reset = (extraPolicies: string) => psql([], `
    DROP SCHEMA IF EXISTS storage CASCADE;
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (id text, bucket_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    ${extraPolicies}
  `);

  afterAll(() => { psql([], "DROP SCHEMA IF EXISTS storage CASCADE;"); });

  it("removes exact writes, preserves reads and unrelated buckets, and converts ALL to SELECT", () => {
    reset(`
      CREATE POLICY "eval insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'evaluation-data'::text);
      CREATE POLICY "eval update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'evaluation-data'::text) WITH CHECK (bucket_id = 'evaluation-data'::text);
      CREATE POLICY "eval all" ON storage.objects FOR ALL TO public USING (bucket_id = 'evaluation-data'::text) WITH CHECK (bucket_id = 'evaluation-data'::text);
      CREATE POLICY "eval read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'evaluation-data'::text);
      CREATE POLICY "avatars insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'avatars'::text);
    `);
    psql(["-f", migration]);
    const policies = psql(["-Atc", "SELECT policyname || ':' || cmd || ':' || permissive FROM pg_policies WHERE schemaname='storage' ORDER BY 1"]);
    expect(policies.trim().split("\n")).toEqual([
      "avatars insert:INSERT:PERMISSIVE",
      "eval all read only:SELECT:PERMISSIVE",
      "eval read:SELECT:PERMISSIVE",
    ]);
  });

  it.each([
    ["mixed", "CREATE POLICY mixed ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id IN ('evaluation-data','avatars'));"],
    ["broad", "CREATE POLICY broad ON storage.objects FOR ALL TO public USING (true) WITH CHECK (true);"],
    ["restrictive", "CREATE POLICY restrictive ON storage.objects AS RESTRICTIVE FOR ALL TO public USING (bucket_id = 'evaluation-data'::text) WITH CHECK (bucket_id = 'evaluation-data'::text);"],
  ])("fails closed before changing an unrecognized %s policy", (_label, policy) => {
    reset(policy);
    expect(() => psql(["-f", migration])).toThrow();
    const policies = psql(["-Atc", "SELECT policyname || ':' || cmd FROM pg_policies WHERE schemaname='storage'"]);
    expect(policies.trim()).toMatch(/^(mixed:INSERT|broad:ALL|restrictive:ALL)$/);
  });
});
