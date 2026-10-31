import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {generatePromoterDatabase} from "./enhanced-daily-pipeline";
import {createSchemeBaseline, promoterIds, stablePromoterId, validateSchemePublication} from "./scheme-state";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
function fixture() {
  const account = {platform:"telegram",identifier:"example",firstSeen:"2026-02-02",lastSeen:"2026-10-23",postCount:4};
  return {
    schemes:{lastUpdated:"2026-10-24T02:00:00Z",schemes:{S1:{schemeId:"S1",symbol:"TEST",firstDetected:"2026-02-02",lastSeen:"2026-10-23",status:"ONGOING",timeline:[{date:"2026-02-02",event:"detection"},{date:"2026-10-23",event:"update"}],notes:["investigation"],investigationFlags:[],promotionPlatforms:["telegram"],signalsDetected:["VOLUME"],promoterAccounts:[account]}}},
    promoters:{lastUpdated:"2026-10-24T02:00:00Z",promoters:{P1:{promoterId:"P1",...account,totalPosts:4}}},
  };
}
const state = (docs: ReturnType<typeof fixture>) => ({"scheme-database.json":encode(docs.schemes),"promoter-database.json":encode(docs.promoters)});

test("retains historical evidence and identities while allowing newer lifecycle updates",()=>{
  const old=fixture(), next=fixture(), current=state(old);
  next.schemes.lastUpdated="2026-10-26T02:00:00Z";
  next.schemes.schemes.S1.status="COOLING";
  next.schemes.schemes.S1.timeline.push({date:"2026-10-23",event:"cooling"});
  validateSchemePublication(current,state(next),createSchemeBaseline(current));
});

test.each([
  ["lost scheme",(d:any)=>{delete d.schemes.schemes.S1;}],
  ["lost timeline",(d:any)=>{d.schemes.schemes.S1.timeline.pop();}],
  ["rewritten identity",(d:any)=>{d.schemes.schemes.S1.symbol="OTHER";}],
  ["older last seen",(d:any)=>{d.schemes.schemes.S1.lastSeen="2026-02-02";}],
  ["lost account",(d:any)=>{d.schemes.schemes.S1.promoterAccounts=[];}],
  ["reset post count",(d:any)=>{d.schemes.schemes.S1.promoterAccounts[0].postCount=1;}],
  ["changed promoter ID",(d:any)=>{d.promoters.promoters.P1.promoterId="P2";}],
  ["older promoter totals",(d:any)=>{d.promoters.promoters.P1.totalPosts=1;}],
  ["older database",(d:any)=>{d.schemes.lastUpdated="2026-02-15T00:00:00Z";}],
])("rejects %s before publication",(_name,mutate)=>{
  const current=state(fixture()), next=fixture(); mutate(next);
  expect(()=>validateSchemePublication(current,state(next),createSchemeBaseline(current))).toThrow();
});

test("rejects a release after newer published history appears",()=>{
  const seed=state(fixture()), newer=fixture();newer.schemes.schemes.S1.timeline.push({date:"2026-10-24",event:"new evidence"});
  expect(()=>validateSchemePublication(state(newer),seed,createSchemeBaseline(seed))).toThrow(/changed after validation/);
});
test("retains existing promoter IDs and assigns reproducible IDs to new accounts",()=>{
  const ids=promoterIds(fixture().promoters);
  expect(stablePromoterId("telegram","example",ids)).toBe("P1");
  expect(stablePromoterId("telegram","new",ids)).toBe(stablePromoterId("telegram","new",new Map()));
  expect(stablePromoterId("telegram","new",ids)).not.toBe(stablePromoterId("reddit","new",ids));
});
test("does not treat missing durable history as an empty database",()=>{
  expect(()=>createSchemeBaseline({"scheme-database.json":encode({}),"promoter-database.json":encode({})})).toThrow();
});
test("the real promoter rebuild preserves existing IDs, totals and relationships",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"scheme-state-"));
  try {
    const old=fixture(), file=path.join(directory,"promoter-database.json");
    fs.writeFileSync(file,encode(old.promoters));
    generatePromoterDatabase(Object.values(old.schemes.schemes) as any,file);
    const generated=JSON.parse(fs.readFileSync(file,"utf8"));
    expect(generated.promoters.P1).toMatchObject({promoterId:"P1",totalPosts:4,platform:"telegram",identifier:"example"});
    expect(generated.promoters.P1.stocksPromoted).toHaveLength(1);
    validateSchemePublication(state(old),{...state(old),"promoter-database.json":encode(generated)},createSchemeBaseline(state(old)));
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test("the release workflow restores current history and verifies it before uploading",()=>{
  const workflow=fs.readFileSync(path.join(__dirname,"../../.github/workflows/enhanced-daily-evaluation.yml"),"utf8");
  expect(workflow.indexOf("Restore durable scheme history before scanning")).toBeLessThan(workflow.indexOf("Run Enhanced Daily Pipeline"));
  expect(workflow.indexOf("Reject stale or destructive scheme publication")).toBeLessThan(workflow.indexOf("Upload to Supabase"));
  expect(workflow).toContain("Restore durable scheme history before validation");
});
