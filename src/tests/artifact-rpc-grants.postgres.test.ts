import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const databaseUrl = process.env.ARTIFACT_INTEGRATION_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
  ) {
    throw new Error("RPC grant fixtures require a loopback PostgreSQL database");
  }
}
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("artifact publication RPC grants", () => {
  it("revokes explicit anonymous grants while preserving service execution", () => {
    const base = new URL(databaseUrl!);
    base.searchParams.delete("schema");
    const fixtureDatabase = `artifact_rpc_grants_${randomUUID().replace(/-/g, "")}`;
    const fixture = new URL(base);
    fixture.pathname = `/${fixtureDatabase}`;
    const psql = (url: string, input: string) =>
      execFileSync("psql", [url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
        input,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const signature =
      "public.claim_evaluation_artifact_publication(timestamp,integer,text,text)";
    const privileges = (stage: string) => `
      SELECT json_build_object(
        'stage', '${stage}',
        'anon', has_function_privilege('anon', '${signature}', 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', '${signature}', 'EXECUTE'),
        'service', has_function_privilege('service_role', '${signature}', 'EXECUTE')
      );
    `;
    // Reproduce the original cutover before checking the corrective migration.
    const publicOnlyRevoke = `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`;
    const migration = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../prisma/migrations/20260917000500_restrict_artifact_publication_rpc/migration.sql",
      ),
      "utf8",
    );
    let created = false;
    try {
      psql(base.toString(), `CREATE DATABASE "${fixtureDatabase}";`);
      created = true;
      const output = psql(fixture.toString(), `
        BEGIN;
        DO $roles$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role;
          END IF;
        END
        $roles$;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
        CREATE FUNCTION ${signature} RETURNS boolean
          LANGUAGE sql SECURITY DEFINER AS 'SELECT true';
        ${publicOnlyRevoke}
        ${privileges("public_only")}
        ${migration}
        ${privileges("fixed")}
        ROLLBACK;
      `);
      const observed = output.trim().split("\n").map((line) => JSON.parse(line));
      expect(observed).toEqual([
        { stage: "public_only", anon: true, authenticated: true, service: true },
        { stage: "fixed", anon: false, authenticated: false, service: true },
      ]);
    } finally {
      // The fixture transaction also rolls back any roles it created and its
      // default ACLs, including when psql exits on a failed statement.
      if (created) psql(base.toString(), `DROP DATABASE "${fixtureDatabase}";`);
    }
  });
});
