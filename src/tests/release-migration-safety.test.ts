import {spawnSync} from "child_process";
const run=(extra:Record<string,string>)=>spawnSync(process.execPath,["scripts/apply-approved-release-migrations.cjs"],{encoding:"utf8",env:{NODE_ENV:"test",SCAMDUNK_RELEASE_MIGRATIONS:"true",DATABASE_URL:"postgresql://postgres.gwzcluijtbuglznwdqqk:dummy@evil.invalid/db",NEXT_PUBLIC_SUPABASE_URL:"https://gwzcluijtbuglznwdqqk.supabase.co",VERCEL_PROJECT_ID:"prj_U6Fd6Lch5b39VS27foWZGUzqTmQS",VERCEL_ENV:"production",...extra}});
it("ordinary builds skip migrations without reading database credentials",()=>expect(run({SCAMDUNK_RELEASE_MIGRATIONS:"false"}).status).toBe(0));
it("rejects a forged pooler identity before connecting",()=>{const r=run({});expect(r.status).toBe(1);expect(r.stderr).toContain("identity mismatch");});
it("rejects production databases in preview and unrecognized projects",()=>{
 expect(run({DATABASE_URL:"postgresql://postgres:dummy@db.gwzcluijtbuglznwdqqk.supabase.co/db",VERCEL_ENV:"preview"}).status).toBe(1);
 expect(run({VERCEL_PROJECT_ID:"other"}).stderr).toContain("Deployment identity mismatch");
});
it("cannot opt a remote target into local-fixture mode",()=>expect(run({SCAMDUNK_LOCAL_MIGRATION_FIXTURE:"true"}).status).toBe(1));

it("verifies deployment identity without connecting or migrating",()=>{
 const r=run({SCAMDUNK_RELEASE_MIGRATIONS:"false",SCAMDUNK_VERIFY_DEPLOYMENT_TARGET:"true",DATABASE_URL:"postgresql://postgres:dummy@db.iwbewmdeotcnqtpazezi.supabase.co/db",NEXT_PUBLIC_SUPABASE_URL:"https://iwbewmdeotcnqtpazezi.supabase.co",VERCEL_ENV:"preview"});
 expect(r.status).toBe(0);expect(r.stdout).toContain('VERIFIED');expect(r.stdout).not.toContain('APPLIED');
});
it("rejects cross-environment targets even when migrations are disabled",()=>expect(run({SCAMDUNK_RELEASE_MIGRATIONS:"false",SCAMDUNK_VERIFY_DEPLOYMENT_TARGET:"true",DATABASE_URL:"postgresql://postgres:dummy@db.gwzcluijtbuglznwdqqk.supabase.co/db",VERCEL_ENV:"preview"}).status).toBe(1));
