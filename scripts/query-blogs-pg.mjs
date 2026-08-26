import pkg from "pg";
const { Client } = pkg;

// Connection string comes from the environment — never hardcode credentials.
// (A previously committed literal password has been removed; rotate that
// credential in Supabase per audit/2026-06-11/MORNING-CHECKLIST.md.)
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL (or DIRECT_URL) before running this script.");
  process.exit(1);
}

const client = new Client({ connectionString });

try {
  await client.connect();
  const result = await client.query(
    `SELECT id, title, slug, "coverImage", category, "publishedAt" FROM "BlogPost" WHERE "isPublished" = true ORDER BY "publishedAt" DESC`,
  );
  console.log(JSON.stringify(result.rows, null, 2));
} catch (error) {
  console.error("Error:", error.message);
} finally {
  await client.end();
}
