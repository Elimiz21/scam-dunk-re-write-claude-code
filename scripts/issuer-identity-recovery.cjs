#!/usr/bin/env node
'use strict';

// One reviewed incident, two metadata rows and one unsupported historical row.
// This is not an issuer override facility or a generic data migration runner.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const ID = '2026-09-17-lgmk-sntx-identity';
const VERSION = 'scamdunk.issuer-identity-recovery/v1';
const STOCK_IDS = ['bf261302-c656-4916-a36b-0285bdad2ac0', '0f6cf853-2450-4118-b6ea-d8fd9d79e875'];
const SNAPSHOT_ID = 'ee810bc5-f6ad-4e9d-9308-66495eda0e76';
const PROOF = {
  evaluationDate: '2026-09-16',
  producerCommit: '344ec674ffbcd3a407568f6109f8dc9ea361e77b',
  evaluationSha256: '37c82675f934e086558e019f8b1772bfe82d0d6415a25677193277c030dd08d6',
  originalDataCommit: 'd96a424f888ae572ce07f7d2aab213c9fcb1faaf',
  originalArtifactMatches: 0,
  reason: 'Current issuer identities evidenced; old LGMK snapshot issuer linkage unestablished. No price repair or historical issuer inference.',
  issuers: [
    { symbol: 'LGMK', name: 'LogicMark, Inc.', exchange: 'OTC', isOTC: true,
      sector: 'Technology', industry: 'Communication Equipment',
      isin: 'US67091J8009', cusip: '67091J800', cik: '1566826',
      sources: [
        'https://www.sec.gov/Archives/edgar/data/1566826/000121390022010402/ea156417-8k_logicmark.htm',
        'https://www.sec.gov/Archives/edgar/data/1566826/000121390025049700/ea0244171-8k_logic.htm',
        'https://www.sec.gov/Archives/edgar/data/1566826/000121390025102286/ea0262507-8k_logic.htm',
      ] },
    { symbol: 'SNTX', name: 'Suntex Enterprises, Inc.', exchange: 'OTC', isOTC: true,
      sector: 'Financial Services', industry: 'Asset Management',
      isin: 'US86804E1064', cusip: '86804E106',
      sources: [
        'https://www.otcmarkets.com/file/company/financial-report/553515/content',
        'https://www.sec.gov/Archives/edgar/data/1609727/000119312520013091/d858447d8k.htm',
      ] },
  ],
  classificationSource: 'Sector/industry from exact retained evaluation; official filings establish issuer and CUSIP, not provider classifications.',
};
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
// Hex transport also prevents provider text from closing the surrounding DO
// block's dollar delimiter. Apostrophe escaping alone does not protect that.
const json = value => `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('hex')}','hex'),'UTF8')::jsonb`;
const ids = STOCK_IDS.map(literal).join(',');
const tracked = `(SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(t),'binary',encode(record_send(t),'hex')) ORDER BY symbol)
 FROM public."TrackedStock" t WHERE t.id IN (${ids}))`;
// PostgreSQL's own float text output with extra_float_digits=3 is roundtrip exact,
// including signed zero. Keep these strings out of JS numeric serialization.
const snapshot = `(SELECT jsonb_build_object('row',to_jsonb(s) || jsonb_build_object(
 'lastPrice',s."lastPrice"::text,'previousClose',s."previousClose"::text,
 'priceChangePct',s."priceChangePct"::text,'volumeRatio',s."volumeRatio"::text,'marketCap',s."marketCap"::text),
 'binary',encode(record_send(s),'hex')) FROM public."StockDailySnapshot" s WHERE s.id=${literal(SNAPSHOT_ID)})`;
const settings = `SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
 SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL extra_float_digits=3;
 SET LOCAL timezone='UTC'; SET LOCAL search_path=pg_catalog; SET LOCAL standard_conforming_strings=on;`;

function captureSql() {
  return `BEGIN READ ONLY; ${settings}
 SELECT jsonb_build_object('version',${literal(VERSION)},'id',${literal(ID)},'proof',${json(PROOF)},
 'before',jsonb_build_object('tracked',${tracked},'snapshot',${snapshot})); COMMIT;`;
}

function validateManifest(m) {
  if (m?.version !== VERSION || m.id !== ID || !isDeepStrictEqual(m.proof, PROOF)) throw Error('Unrecognized recovery proof');
  if (!Array.isArray(m.before?.tracked) || m.before.tracked.length !== 2) throw Error('Expected two metadata before-images');
  const [lgmk, sntx] = m.before.tracked;
  if (lgmk?.row?.id !== STOCK_IDS[0] || lgmk.row.symbol !== 'LGMK' || lgmk.row.name !== 'Landmark Group Holdings Inc' ||
      sntx?.row?.id !== STOCK_IDS[1] || sntx.row.symbol !== 'SNTX' || sntx.row.name !== 'Synthorx Inc.') throw Error('Unexpected metadata scope');
  const old = m.before.snapshot;
  if (old?.row?.id !== SNAPSHOT_ID || old.row.stockId !== STOCK_IDS[0] || old.row.scanDate !== '2025-12-15T00:00:00' ||
      old.row.artifactRevisionId !== null || old.row.sourceObservedAt !== null || old.row.sourceVersion !== null) throw Error('Unexpected snapshot scope');
  for (const r of [...m.before.tracked, old]) {
    if (!/^(?:[a-f0-9]{2})+$/.test(r.binary || '') || r.binary.length > 1000000) throw Error('Invalid complete-row binary fingerprint');
  }
  if (JSON.stringify(m).length > 2000000) throw Error('Recovery manifest too large');
}

function recoverySql(manifest, mode = 'dry-run') {
  validateManifest(manifest);
  if (!['dry-run', 'apply', 'restore'].includes(mode)) throw Error('Invalid recovery mode');
  const mutating = mode !== 'dry-run';
  // Table locks fence symbol-only PromotedStock writes too, not merely FK writes.
  // The timeout aborts rather than waiting behind an active publisher indefinitely.
  const locks = mutating ? `LOCK TABLE public."TrackedStock", public."StockDailySnapshot", public."StockRiskAlert", public."PromotedStock", identity_quarantine."IssuerRecovery" IN SHARE ROW EXCLUSIVE MODE;` : '';
  return `BEGIN ISOLATION LEVEL SERIALIZABLE${mutating ? '' : ' READ ONLY'}; ${settings} ${locks}
 DO $issuer_recovery$
 DECLARE m jsonb := ${json(manifest)}; archived jsonb; current_tracked jsonb; current_snapshot jsonb;
   snapshot_count integer; related_count integer; n integer; result text; after_rows jsonb; correction jsonb;
 BEGIN
   SELECT payload INTO archived FROM identity_quarantine."IssuerRecovery" WHERE id=${literal(ID)};
   current_tracked := ${tracked}; current_snapshot := ${snapshot};
   SELECT count(*) INTO snapshot_count FROM public."StockDailySnapshot" WHERE "stockId" IN (${ids});
   SELECT (SELECT count(*) FROM public."StockRiskAlert" WHERE "stockId" IN (${ids})) +
          (SELECT count(*) FROM public."PromotedStock" WHERE upper(btrim(symbol)) IN ('LGMK','SNTX')) INTO related_count;
   IF archived IS NOT NULL THEN
     IF archived->'manifest' IS DISTINCT FROM m OR archived->'before' IS DISTINCT FROM m->'before' THEN
       RAISE EXCEPTION 'Archive does not match reviewed manifest';
     END IF;
     IF ${literal(mode)} = 'restore' THEN
       IF related_count <> 0 THEN RAISE EXCEPTION 'Restore refused: new related evidence'; END IF;
       IF current_tracked = m->'before'->'tracked' AND current_snapshot = m->'before'->'snapshot' AND snapshot_count=1 THEN
         result := 'ALREADY_RESTORED';
       ELSE
         IF current_tracked IS DISTINCT FROM archived->'after' OR snapshot_count<>0 OR current_snapshot IS NOT NULL THEN
           RAISE EXCEPTION 'Restore refused: corrected state changed or new publication exists';
         END IF;
         FOR correction IN SELECT value->'row' FROM jsonb_array_elements(m->'before'->'tracked') LOOP
           UPDATE public."TrackedStock" t SET name=r.name,exchange=r.exchange,sector=r.sector,industry=r.industry,
             "isOTC"=r."isOTC","updatedAt"=r."updatedAt"
           FROM jsonb_populate_record(NULL::public."TrackedStock",correction) r WHERE t.id=r.id;
           GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Restore metadata target count'; END IF;
         END LOOP;
         INSERT INTO public."StockDailySnapshot" SELECT * FROM jsonb_populate_record(NULL::public."StockDailySnapshot",m->'before'->'snapshot'->'row');
         IF ${tracked} IS DISTINCT FROM m->'before'->'tracked' OR ${snapshot} IS DISTINCT FROM m->'before'->'snapshot' THEN
           RAISE EXCEPTION 'Restoration failed original complete-row binary equality';
         END IF;
         result := 'RESTORED';
       END IF;
     ELSE
       IF current_tracked IS DISTINCT FROM archived->'after' OR current_snapshot IS NOT NULL THEN
         RAISE EXCEPTION 'Prior recovery state differs; review required';
       END IF;
       result := 'ALREADY_APPLIED';
     END IF;
   ELSE
     IF ${literal(mode)}='restore' THEN RAISE EXCEPTION 'No archive to restore'; END IF;
     IF current_tracked IS DISTINCT FROM m->'before'->'tracked' OR current_snapshot IS DISTINCT FROM m->'before'->'snapshot'
        OR snapshot_count<>1 OR related_count<>0 THEN RAISE EXCEPTION 'Stale before-images or unexpected related evidence'; END IF;
     result := 'READY';
     IF ${literal(mode)}='apply' THEN
       -- Archive the original rows before removing the sole unsupported observation.
       INSERT INTO identity_quarantine."IssuerRecovery" (id,payload)
         VALUES (${literal(ID)},jsonb_build_object('manifest',m,'before',m->'before','after',
           (SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(r),'binary',encode(record_send(r),'hex')) ORDER BY r.symbol)
             FROM (SELECT (jsonb_populate_record(NULL::public."TrackedStock",x->'row' ||
               (SELECT value - ARRAY['sources','isin','cusip','cik'] FROM jsonb_array_elements(m->'proof'->'issuers') WHERE value->>'symbol'=x->'row'->>'symbol') ||
               jsonb_build_object('updatedAt',transaction_timestamp()::timestamp(3)))).*
               FROM jsonb_array_elements(m->'before'->'tracked') x) r)));
       SELECT payload->'after' INTO after_rows FROM identity_quarantine."IssuerRecovery" WHERE id=${literal(ID)};
       DELETE FROM public."StockDailySnapshot" WHERE id=${literal(SNAPSHOT_ID)};
       GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Snapshot deletion count'; END IF;
       FOR correction IN SELECT value->'row' FROM jsonb_array_elements(after_rows) LOOP
         UPDATE public."TrackedStock" t SET name=r.name,exchange=r.exchange,sector=r.sector,industry=r.industry,
           "isOTC"=r."isOTC","updatedAt"=r."updatedAt"
         FROM jsonb_populate_record(NULL::public."TrackedStock",correction) r WHERE t.id=r.id;
         GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Metadata correction target count'; END IF;
       END LOOP;
       IF ${tracked} IS DISTINCT FROM after_rows OR ${snapshot} IS NOT NULL THEN RAISE EXCEPTION 'Correction postcondition failed'; END IF;
       result := 'APPLIED';
     END IF;
   END IF;
   PERFORM set_config('identity_recovery.result',result,true);
 END $issuer_recovery$;
 SELECT jsonb_build_object('recoveryId',${literal(ID)},'status',current_setting('identity_recovery.result'),
   'mode',${literal(mode)},'scopedSnapshotRows',1,'scopedMetadataRows',2);
 COMMIT;`;
}

function validateRuntime(raw, target) {
  let url; try { url = new URL(raw); } catch { throw Error('Invalid database URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw Error('Invalid database protocol');
  const allowed = new Set(['sslmode', 'connect_timeout']);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw Error('Unsafe database option');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (target === 'local') { if (!local) throw Error('Local mode requires loopback'); }
  else {
    if (!/^[a-z]{20}$/.test(target || '') || url.pathname !== '/postgres') throw Error('Expected explicit Supabase project ref');
    const direct = url.hostname === `db.${target}.supabase.co` && url.username === 'postgres';
    const pooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${target}`;
    if ((!direct && !pooler) || url.searchParams.get('sslmode') !== 'require') throw Error('Database target or TLS mismatch');
  }
  const timeout = url.searchParams.get('connect_timeout');
  if (timeout !== null && (!/^\d+$/.test(timeout) || +timeout < 1 || +timeout > 30)) throw Error('Invalid connection timeout');
  url.searchParams.set('connect_timeout', timeout || '10');
  return url.href;
}

function main(args) {
  const opts = {}; let mode='dry-run';
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (arg==='--apply'||arg==='--restore') { if(mode!=='dry-run') throw Error('Conflicting mode'); mode=arg.slice(2); }
    else if (['--target','--capture','--manifest'].includes(arg) && args[i+1] && !args[i+1].startsWith('--') && !opts[arg]) opts[arg]=args[++i];
    else throw Error('Usage: --target local|PROJECT_REF (--capture FILE | --manifest FILE [--apply|--restore])');
  }
  if (!!opts['--capture'] === !!opts['--manifest'] || (opts['--capture'] && mode!=='dry-run')) throw Error('Capture is read-only; select one manifest operation');
  const url=validateRuntime(process.env.IDENTITY_RECOVERY_DATABASE_URL,opts['--target']);
  const m=opts['--manifest'] ? JSON.parse(fs.readFileSync(opts['--manifest'],'utf8')) : null;
  const sql=m ? recoverySql(m,mode) : captureSql();
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG') && k!=='IDENTITY_RECOVERY_DATABASE_URL'));
  env.PGOPTIONS=`-c default_transaction_read_only=${mode==='dry-run'?'on':'off'} -c statement_timeout=30000 -c lock_timeout=5000`;
  let raw;
  try { raw=execFileSync('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:sql,env,encoding:'utf8',timeout:45000,maxBuffer:4000000,stdio:['pipe','pipe','pipe']}); }
  catch { throw Error('Bounded database operation failed; no successful transaction confirmation. Credentials and SQL output withheld.'); }
  const result=JSON.parse(raw.trim());
  if (opts['--capture']) {
    validateManifest(result);
    fs.writeFileSync(opts['--capture'],JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({status:'CAPTURED_READ_ONLY',recoveryId:ID,manifestSha256:createHash('sha256').update(fs.readFileSync(opts['--capture'])).digest('hex')}));
  } else console.log(JSON.stringify(result));
}

module.exports={captureSql,recoverySql,validateManifest,validateRuntime};
if(require.main===module) { try { main(process.argv.slice(2)); } catch(error) { console.error(error.message); process.exitCode=1; } }
