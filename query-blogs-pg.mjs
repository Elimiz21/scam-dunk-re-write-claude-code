import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres.gwzcluijtbuglznwdqqk:Scammers2232%21@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1'
});

try {
  await client.connect();
  const result = await client.query(
    `SELECT id, title, slug, "coverImage", category, "publishedAt" FROM "BlogPost" WHERE "isPublished" = true ORDER BY "publishedAt" DESC`
  );
  console.log(JSON.stringify(result.rows, null, 2));
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await client.end();
}
