/* Opt-in additive release migration. Ordinary application builds never connect. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const applyMigrations = process.env.SCAMDUNK_RELEASE_MIGRATIONS === 'true';
const verifyTarget = process.env.SCAMDUNK_VERIFY_DEPLOYMENT_TARGET === 'true';
if (!applyMigrations && !verifyTarget) process.exit(0);
function fail(message) { console.error(message);process.exit(1); }
let db,storage;
try {db=new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);storage=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);} catch {fail('Migration target configuration is invalid');}
const production='gwzcluijtbuglznwdqqk',staging='iwbewmdeotcnqtpazezi';
if (!['postgres:', 'postgresql:'].includes(db.protocol)) fail('Invalid database protocol');
const ref=db.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1] || (db.hostname.endsWith('.pooler.supabase.com') ? decodeURIComponent(db.username).match(/^postgres\.([a-z0-9]{20})$/)?.[1] : null);
const storageRef=storage.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
const fixture=process.env.SCAMDUNK_LOCAL_MIGRATION_FIXTURE === 'true' && ['127.0.0.1','localhost'].includes(db.hostname) && ['/scamdunk_test','/scamdunk_migration_test'].includes(db.pathname) && ['127.0.0.1','localhost'].includes(storage.hostname);
if (!fixture) {
 if (process.env.VERCEL_PROJECT_ID !== 'prj_U6Fd6Lch5b39VS27foWZGUzqTmQS') fail('Deployment identity mismatch');
 const expected=process.env.VERCEL_ENV === 'production' ? production : process.env.VERCEL_ENV === 'preview' ? staging : null;
 if (!expected || ref!==expected || storageRef!==expected || storage.protocol!=='https:') fail('Migration database and storage identity mismatch');
}
if (!applyMigrations) {
 console.log(JSON.stringify({deploymentTarget:'VERIFIED',target:fixture?'local-fixture':ref}));
 process.exit(0);
}
const manifest=JSON.parse(fs.readFileSync('scripts/release-migrations.json','utf8'));
let sql="BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='120s';\n";
for (const migration of manifest.files) {
 const text=fs.readFileSync(migration.path,'utf8');
 if (crypto.createHash('sha256').update(text).digest('hex')!==migration.sha256) fail('Approved migration content changed');
 sql+='\n'+text+'\n';
}
sql+='\nCOMMIT;\n';
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--stdin','--url',db.toString()],{input:sql,encoding:'utf8',maxBuffer:1024*1024});
if(result.status!==0) fail('Approved release migration failed; transaction rolled back. Inspect database availability and lock contention before retrying.');
console.log(JSON.stringify({migrationStatus:'APPLIED_OR_ALREADY_PRESENT',target:fixture?'local-fixture':ref,manifestVersion:manifest.version}));
