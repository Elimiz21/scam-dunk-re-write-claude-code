const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

// Reject remote fixtures before registering hooks or creating any clients.
const databaseUrl = process.env.IDENTITY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(url.search, '');
}
const modulePath = path.join(__dirname, 'issuer-identity-recovery.cjs');
test('bounded recovery implementation exists', () => assert.ok(fs.existsSync(modulePath)));
const recovery = fs.existsSync(modulePath) ? require(modulePath) : null;
const pgTest = databaseUrl && recovery ? test : test.skip;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG')));
env.PGOPTIONS = '-c statement_timeout=30000 -c lock_timeout=5000';
function psql(url, sql) {
  return execFileSync('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, env, encoding: 'utf8', timeout: 40000, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
async function fixture(fn) {
  const db = `issuer_recovery_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(databaseUrl); url.pathname = `/${db}`;
  let created = false;
  const roles = Object.fromEntries(['anon', 'authenticated', 'service_role'].map(role => [role, `${role}_${db}`]));
  const createdRoles = [];
  try {
    psql(databaseUrl, `CREATE DATABASE "${db}";`); created = true;
    for (const role of Object.values(roles)) { psql(url.href, `CREATE ROLE "${role}";`); createdRoles.push(role); }
    psql(url.href, `
      CREATE TABLE public."TrackedStock" (id text PRIMARY KEY, symbol text UNIQUE NOT NULL,
        name text NOT NULL, exchange text NOT NULL, sector text, industry text, "isOTC" boolean NOT NULL,
        "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL);
      CREATE TABLE public."StockDailySnapshot" (id text PRIMARY KEY, "stockId" text REFERENCES "TrackedStock"(id),
        "scanDate" timestamp(3), "riskLevel" text, "totalScore" int, "isLegitimate" boolean, "isInsufficient" boolean,
        "lastPrice" float8, "previousClose" float8, "priceChangePct" float8,
        volume int, "avgVolume" int, "volumeRatio" float8, "marketCap" float8,
        signals text, "signalSummary" text, "signalCount" int, "dataSource" text,
        "sourceObservedAt" timestamp(3), "sourceVersion" text, "evaluatedAt" timestamp(3),
        "artifactRevisionId" text, "createdAt" timestamp(3), "futureEvidence" text);
      CREATE TABLE public."StockRiskAlert" (id text PRIMARY KEY, "stockId" text REFERENCES "TrackedStock"(id));
      CREATE TABLE public."PromotedStock" (id text PRIMARY KEY, symbol text);
      INSERT INTO "TrackedStock" VALUES
        ('bf261302-c656-4916-a36b-0285bdad2ac0','LGMK','Landmark Group Holdings Inc','NASDAQ','Real Estate','Real Estate',false,'2026-03-19 22:26:13.986','2026-03-19 22:26:13.986'),
        ('0f6cf853-2450-4118-b6ea-d8fd9d79e875','SNTX','Synthorx Inc.','NASDAQ','Healthcare','Biotechnology',false,'2026-03-19 23:53:22.526','2026-03-19 23:53:22.526'),
        ('unrelated','SAFE','Safe issuer','NYSE',NULL,NULL,false,'2026-01-01','2026-01-01');
      INSERT INTO "StockDailySnapshot" VALUES
        ('ee810bc5-f6ad-4e9d-9308-66495eda0e76','bf261302-c656-4916-a36b-0285bdad2ac0','2025-12-15','MEDIUM',3,true,false,
         9.56,'-0'::float8,NULL,NULL,3400000,'1e-300'::float8,'3965061512412.9995'::float8,
         '[]','Unicode 🧪 and literal apostrophe ''',2,'FMP',NULL,NULL,'2025-12-15',NULL,'2026-03-19 22:26:13.986','preserve $issuer_recovery$ future column');
    `);
    let migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20260917020000_private_issuer_identity_quarantine/migration.sql'), 'utf8');
    for (const [original, role] of Object.entries(roles)) migration = migration.replaceAll(new RegExp(`\\b${original}\\b`, 'g'), role);
    psql(url.href, `BEGIN; ${migration} COMMIT;`);
    return await fn(url.href, roles);
  } finally {
    if (created) psql(databaseUrl, `DROP DATABASE "${db}";`);
    for (const role of createdRoles) psql(databaseUrl, `DROP ROLE "${role}";`);
  }
}
function capture(url) { return JSON.parse(psql(url, recovery.captureSql())); }
function state(url) {
  return psql(url, `SELECT json_build_object(
    'tracked',(SELECT json_agg(encode(record_send(t),'hex') ORDER BY id) FROM "TrackedStock" t),
    'snapshots',(SELECT json_agg(encode(record_send(s),'hex') ORDER BY id) FROM "StockDailySnapshot" s),
    'archive',(SELECT json_agg(to_jsonb(q) ORDER BY id) FROM identity_quarantine."IssuerRecovery" q));`);
}
function run(url, manifest, mode = 'dry-run') {
  return JSON.parse(psql(url, recovery.recoverySql(manifest, mode)));
}

pgTest('archive and restore reproduce every original PostgreSQL record byte; dry-run and repeats do not write', () => fixture(url => {
  const manifest = capture(url); const before = state(url);
  assert.equal(run(url, manifest).status, 'READY'); assert.equal(state(url), before);
  assert.equal(run(url, manifest, 'apply').status, 'APPLIED');
  const applied = state(url);
  assert.equal(run(url, manifest, 'apply').status, 'ALREADY_APPLIED'); assert.equal(state(url), applied);
  assert.equal(psql(url, 'SELECT count(*) FROM "StockDailySnapshot";'), '0');
  assert.equal(psql(url, 'SELECT count(*) FROM "TrackedStock" WHERE "isOTC" AND exchange=\'OTC\';'), '2');
  const archived = JSON.parse(psql(url, 'SELECT payload FROM identity_quarantine."IssuerRecovery";'));
  assert.deepEqual(archived.before, manifest.before);
  assert.equal(archived.before.snapshot.row.previousClose, '-0');
  assert.equal(archived.before.snapshot.row.marketCap, '3965061512412.9995');
  assert.equal(run(url, manifest, 'restore').status, 'RESTORED');
  const restored = JSON.parse(state(url)), original = JSON.parse(before);
  assert.deepEqual(restored.tracked, original.tracked); assert.deepEqual(restored.snapshots, original.snapshots);
  assert.equal(run(url, manifest, 'restore').status, 'ALREADY_RESTORED');
  assert.equal(JSON.parse(psql(url, 'SELECT payload FROM identity_quarantine."IssuerRecovery";')).before.snapshot.binary, manifest.before.snapshot.binary);
}));

pgTest('stale whole-row state, extra snapshots and related evidence abort without changes', () => fixture(url => {
  const manifest = capture(url);
  for (const mutation of [
    'UPDATE "TrackedStock" SET industry=\'changed\' WHERE symbol=\'LGMK\';',
    'UPDATE "StockDailySnapshot" SET "previousClose"=0;',
    'INSERT INTO "StockDailySnapshot" (id,"stockId") VALUES (\'new\',\'0f6cf853-2450-4118-b6ea-d8fd9d79e875\');',
    'INSERT INTO "StockRiskAlert" VALUES (\'alert\',\'bf261302-c656-4916-a36b-0285bdad2ac0\');',
    'INSERT INTO "PromotedStock" VALUES (\'promoted\',\'SNTX\');',
    'INSERT INTO "PromotedStock" VALUES (\'promoted-case\',\' sntx \');',
  ]) {
    assert.throws(() => psql(url, `BEGIN; ${mutation} ${recovery.recoverySql(manifest, 'apply').replace(/^BEGIN[^;]*;/, '')}`));
    assert.equal(run(url, manifest).status, 'READY');
  }
}));

pgTest('late failure rolls back archive, deletion and metadata updates', () => fixture(url => {
  const manifest = capture(url), before = state(url);
  psql(url, `CREATE FUNCTION reject_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.symbol='SNTX' AND NEW."isOTC" THEN RAISE EXCEPTION 'fixture late failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER late_failure BEFORE UPDATE ON "TrackedStock" FOR EACH ROW EXECUTE FUNCTION reject_identity_change();`);
  assert.throws(() => run(url, manifest, 'apply'));
  assert.equal(state(url), before);
}));

pgTest('restoration rejects new canonical history or altered corrected metadata', () => fixture(url => {
  const manifest = capture(url); run(url, manifest, 'apply');
  psql(url, 'INSERT INTO "StockDailySnapshot" (id,"stockId") VALUES (\'new-publication\',\'bf261302-c656-4916-a36b-0285bdad2ac0\');');
  const before = state(url); assert.throws(() => run(url, manifest, 'restore')); assert.equal(state(url), before);
}));

pgTest('quarantine denies both API roles and allows only service read/insert', () => fixture((url, roles) => {
  for (const role of [roles.anon, roles.authenticated]) {
    for (const query of ['SELECT * FROM identity_quarantine."IssuerRecovery"', 'INSERT INTO identity_quarantine."IssuerRecovery" VALUES (\'x\',\'{}\',now())'])
      assert.throws(() => psql(url, `SET ROLE ${role}; ${query};`));
  }
  assert.equal(psql(url, `SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='identity_quarantine."IssuerRecovery"'::regclass;`), 't');
  assert.equal(psql(url, `SELECT has_table_privilege('${roles.service_role}','identity_quarantine."IssuerRecovery"','SELECT,INSERT') AND NOT has_table_privilege('${roles.service_role}','identity_quarantine."IssuerRecovery"','UPDATE,DELETE,TRUNCATE');`), 't');
  assert.equal(psql(url, `SET ROLE ${roles.service_role}; INSERT INTO identity_quarantine."IssuerRecovery" (id,payload) VALUES ('proof','{}'); SELECT count(*) FROM identity_quarantine."IssuerRecovery";`), '1');
  assert.throws(() => psql(url, `SET ROLE ${roles.service_role}; DELETE FROM identity_quarantine."IssuerRecovery";`));
}));

pgTest('concurrent writer is fenced and changed before-image aborts the waiting recovery', () => fixture(async url => {
  const manifest = capture(url);
  const writer = spawn('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {env, stdio:['pipe','pipe','pipe']});
  let output=''; writer.stdout.on('data', b => { output += b; });
  writer.stdin.end(`BEGIN; UPDATE "TrackedStock" SET industry='concurrent-evidence' WHERE symbol='LGMK'; SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;`);
  const done = new Promise((resolve,reject) => { writer.on('error',reject); writer.on('close',code=>code===0?resolve():reject(Error('fixture writer failed'))); });
  while (!output.includes('LOCKED')) await new Promise(resolve=>setTimeout(resolve,10));
  assert.throws(() => run(url, manifest, 'apply'));
  await done;
  assert.equal(psql(url, `SELECT industry FROM "TrackedStock" WHERE symbol='LGMK';`), 'concurrent-evidence');
  assert.equal(psql(url, 'SELECT count(*) FROM identity_quarantine."IssuerRecovery";'), '0');
  assert.equal(psql(url, 'SELECT count(*) FROM "StockDailySnapshot";'), '1');
}));

test('rejects unsafe URLs and unbounded or altered proof manifests', { skip: !recovery }, () => {
  for (const input of ['https://localhost/db', 'postgres://u@evil.com/postgres', 'postgres://u@127.0.0.1/db?options=-c%20role=postgres'])
    assert.throws(() => recovery.validateRuntime(input, 'local'));
  assert.throws(() => recovery.recoverySql({}, 'apply'));
});
