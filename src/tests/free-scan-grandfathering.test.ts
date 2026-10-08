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

describe("free scan grandfathering migration", () => {
  test("gives future users one stored free credit by default", () => {
    expect(schema).toContain("freeMonthlyScanCredits     Int       @default(1)");
  });

  test("preserves five stored free credits for every account that already exists", () => {
    expect(migration).toMatch(
      /UPDATE "User"\s+SET "freeMonthlyScanCredits" = 5;/,
    );
  });
});
