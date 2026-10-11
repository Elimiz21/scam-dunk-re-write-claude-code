import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(__dirname, "../..");
const schema = fs.readFileSync(
  path.join(repositoryRoot, "prisma/schema.prisma"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    repositoryRoot,
    "prisma/migrations/20261008000000_grandfather_free_scan_credits/migration.sql",
  ),
  "utf8",
);
const recoveryMigration = fs.readFileSync(
  path.join(
    repositoryRoot,
    "prisma/migrations/20261011000000_recover_free_scan_credit_column/migration.sql",
  ),
  "utf8",
);

describe("free scan grandfathering migration", () => {
  test("gives future users one stored free credit by default", () => {
    expect(schema).toContain("freeMonthlyScanCredits     Int       @default(1)");
  });

  test("preserves five stored free credits for every account that already exists", () => {
    expect(migration).toMatch(
      /UPDATE "User"\s+SET "freeMonthlyScanCredits" = 5;/,
    );
  });

  test("repairs a delayed production migration without granting five scans to later signups", () => {
    expect(recoveryMigration).toMatch(
      /ADD COLUMN IF NOT EXISTS "freeMonthlyScanCredits" INTEGER NOT NULL DEFAULT 1;/,
    );
    expect(recoveryMigration).toMatch(
      /WHERE "createdAt" < TIMESTAMPTZ '2026-10-08T18:43:44Z';/,
    );
    expect(recoveryMigration).toMatch(
      /SET "freeMonthlyScanCredits" = 5\s+WHERE "createdAt" < TIMESTAMPTZ '2026-10-08T18:43:44Z';/,
    );
  });
});
