import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import path from "path";

const url = process.env.DATABASE_ACCESS_TEST_URL;
if (url && (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !["/scamdunk_test", "/scamdunk_migration_test"].includes(new URL(url).pathname))) throw new Error("Disposable local database required");
const suite = url ? describe : describe.skip;
suite("server-only database boundary", () => {
  const client = new PrismaClient({ datasourceUrl: url ?? "postgresql://skip:skip@127.0.0.1:1/skip" });
  beforeAll(async () => {
    await client.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$`);
    await client.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role');
    await client.$executeRawUnsafe('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role');
    await client.$executeRawUnsafe(readFileSync(path.join(process.cwd(), "prisma/migrations/20261025194500_server_only_database_access/migration.sql"), "utf8"));
  });
  afterAll(() => client.$disconnect());
  test("all effective table privileges are denied to both client roles, including TRUNCATE", async () => {
    const allowed = await client.$queryRawUnsafe<Array<{ table_name: string }>>(`SELECT c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('anon'),('authenticated')) AS roles(name) CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS permissions(name) WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege(roles.name,c.oid,permissions.name)`);
    expect(allowed).toEqual([]);
  });
  test.each(["anon", "authenticated"])("%s is rejected rather than receiving empty protected rows", async (role) => {
    await expect(client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      return tx.$queryRawUnsafe('SELECT 1 FROM "User" LIMIT 0');
    })).rejects.toMatchObject({ meta: expect.objectContaining({ code: "42501" }) });
  });
  test("privileged service reads and write plans still work", async () => {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE service_role');
      expect(await tx.$queryRawUnsafe('SELECT 1 FROM "User" LIMIT 0')).toEqual([]);
      expect(await tx.$queryRawUnsafe('EXPLAIN UPDATE "User" SET name=name WHERE false')).toBeTruthy();
    });
  });
});
