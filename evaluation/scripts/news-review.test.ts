import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { createNewsReview, type NewsEvidence } from "./news-review";
import { evidenceWindow, retrieveEvidence, materialEventExcerpts } from "./news-evidence";
const mockCreate = jest.fn();
jest.mock("openai", () => jest.fn().mockImplementation(() => ({chat: {completions: {create: mockCreate}}})));
let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "news-review-")); jest.clearAllMocks(); });
afterEach(() => { jest.restoreAllMocks(); rmSync(dir, {recursive: true, force: true}); });
const reviewer = (budget = 25) => createNewsReview({date: "2026-10-23", fmpKey: "fixture", openaiKey: "fixture", resultsDir: dir, maxBudgetUsd: budget});
async function item(): Promise<NewsEvidence> {
 const sources = await Promise.all(["news", "sec_filings", "press_releases"].map(source => retrieveEvidence({source, symbol: "TEST", window: evidenceWindow("2026-10-23"), available: true, retrieve: async () => source === "news" ? [{symbol:"TEST", date:"2026-10-23", title:"Dated earnings release"}] : []})));
 return {key:"TEST", result:{name:"Test Corp", signals:[]}, sources, news:[sources[0].items[0].raw],secFilings:[],pressReleases:[]};
}
function answer(evidenceIds: string[], overrides = {}) {return {choices:[{message:{content:JSON.stringify({results:[{symbol:"TEST",decision:`EARNINGS:${evidenceIds[0]??"missing"}`,explanation:"Dated event",...overrides}]})}}],usage:{prompt_tokens:50, completion_tokens:30}};}
it("requires exact dated citations and retains complete model input/output and metered usage", async () => {
 const evidence=await item(); mockCreate.mockResolvedValue(answer(["E1"]));
 const r=reviewer(); const result=await r.analyzeNewsLegitimacyBatch([evidence],25);
 expect(result.results.get("TEST")).toMatchObject({hasLegitimateNews:true,skipped:false});
 expect(result.chargedUpperBoundUsd).toBeCloseTo((50*.15+30*.6)/1e6);
 expect(r.modelCostBoundUsd).toBe(result.chargedUpperBoundUsd);
 expect(require("openai")).toHaveBeenCalledWith(expect.objectContaining({maxRetries:0,timeout:30_000}));
 const retained=readFileSync(path.join(dir,"news-model-batches-2026-10-23.jsonl"),"utf8");
 expect(retained).toContain(evidence.sources[0].items[0].id); expect(retained).toContain('usage');
});
it.each([{ids:["invented"]}, {ids:[]}])("does not clear uncited or invented evidence $ids", async ({ids}) => {
 mockCreate.mockResolvedValue(answer(ids)); const result=await reviewer().analyzeNewsLegitimacyBatch([await item()],25);
 expect(result.results.get("TEST")).toMatchObject({hasLegitimateNews:false,skipped:true});
});
it("stops before making a model call when the budget is exhausted", async () => {
 const result=await reviewer(0).analyzeNewsLegitimacyBatch([await item()],25);
 expect(result.attemptedCall).toBe(false); expect(mockCreate).not.toHaveBeenCalled();
 expect(result.results.get("TEST")?.analysis).toMatch(/^DEFERRED:/);
});
it("retains incurred cost even when a charged model response is malformed", async () => {
 mockCreate.mockResolvedValue({...answer([]),choices:[{message:{content:"malformed"}}]});
 const r=reviewer();const result=await r.analyzeNewsLegitimacyBatch([await item()],25);
 expect(result.failedCall).toBe(true);expect(result.chargedUpperBoundUsd).toBeGreaterThan(0);
 expect(reviewer().modelCostBoundUsd).toBe(result.chargedUpperBoundUsd);
});
it("keeps the cost reservation after an ambiguous network failure or process restart", async () => {
 mockCreate.mockRejectedValue(new Error("secret URL"));const r=reviewer();const result=await r.analyzeNewsLegitimacyBatch([await item()],25);
 expect(result.failedCall).toBe(true);expect(result.chargedUpperBoundUsd).toBeGreaterThan(0);
 expect(reviewer().modelCostBoundUsd).toBe(result.chargedUpperBoundUsd);
 expect(result.results.get("TEST")?.analysis).not.toContain("secret URL");
});
it("resumes successful source retrieval and rejects corrupted cache eligibility", async () => {
 const response = () => new Response(JSON.stringify([{symbol:"TEST",date:"2026-10-23",title:"Earnings"}]),{status:200});
 const request=jest.spyOn(global,"fetch").mockImplementation(async () => response());
 const r=reviewer();const first=await r.fetchStockNews("TEST");
 expect(first.status).toBe("FOUND");expect(request).toHaveBeenCalledTimes(1);
 expect((await r.fetchStockNews("TEST")).requests).toBe(0);expect(request).toHaveBeenCalledTimes(1);
 const cachePath=path.join(dir,"news-cache",readdirSync(path.join(dir,"news-cache"))[0]);
 const corrupted=JSON.parse(readFileSync(cachePath,"utf8"));corrupted.items[0].eligible=false;writeFileSync(cachePath,JSON.stringify(corrupted));
 expect((await r.fetchStockNews("TEST")).items[0].eligible).toBe(true);expect(request).toHaveBeenCalledTimes(2);
});

it("uses short evidence references in a strict response schema and restores exact source IDs",async()=>{
 const evidence=await item();mockCreate.mockResolvedValue(answer(["E1"]));
 const result=await reviewer().analyzeNewsLegitimacyBatch([evidence],25);
 expect(result.results.get("TEST")).toMatchObject({hasLegitimateNews:true,evidenceIds:[evidence.sources[0].items[0].id]});
 expect(mockCreate.mock.calls[0][0].response_format).toMatchObject({type:"json_schema",json_schema:{strict:true,schema:{properties:{results:{minItems:1,maxItems:1}}}}});
});
it("retries an invalid response once, accounts both calls and resumes the valid decision",async()=>{
 const evidence=await item();mockCreate.mockResolvedValueOnce({...answer([]),choices:[{message:{content:"truncated"}}]}).mockResolvedValueOnce(answer(["E1"]));
 const r=reviewer();const result=await r.analyzeNewsLegitimacyBatch([evidence],25);
 expect(result.attemptCount).toBe(2);expect(result.failedAttemptCount).toBe(1);expect(result.results.get("TEST")?.hasLegitimateNews).toBe(true);
 const resumed=await reviewer().analyzeNewsLegitimacyBatch([evidence],25);expect(resumed.attemptCount).toBe(0);expect(mockCreate).toHaveBeenCalledTimes(2);
});
it("does not accept a cached clearance after its current dated evidence is removed",async()=>{
 const evidence=await item();mockCreate.mockResolvedValue(answer(["E1"]));
 await reviewer().analyzeNewsLegitimacyBatch([evidence],25);
 const changed={...evidence,sources:evidence.sources.map(source=>({...source,items:[]}))};
 mockCreate.mockResolvedValue(answer(["invented"]));
 expect((await reviewer().analyzeNewsLegitimacyBatch([changed],25)).results.get("TEST")?.hasLegitimateNews).toBe(false);
});

it("generic filing metadata cannot substantiate a claimed financing event",async()=>{
 const evidence=await item();evidence.sources[0].items[0].raw={symbol:"TEST",date:"2026-10-23",formType:"8-K",finalLink:"https://www.sec.gov/Archives/example"};
 mockCreate.mockResolvedValue(answer(["E1"],{decision:"FINANCING:E1"}));
 expect((await reviewer().analyzeNewsLegitimacyBatch([evidence],25)).results.get("TEST")).toMatchObject({hasLegitimateNews:false,skipped:true});
});

it("earnings-calendar notices do not become evidence of reported earnings",()=>{
 expect(materialEventExcerpts({title:"Example will host an earnings conference call next month"})).not.toHaveProperty("EARNINGS");
 expect(materialEventExcerpts({title:"Example reports quarterly financial results with revenue growth"})).toHaveProperty("EARNINGS");
});

it("binds each allowed decision to that instrument's source and event, without contradictory flags",async()=>{
 const evidence=await item();mockCreate.mockResolvedValue(answer([],{decision:"NONE",explanation:"Only a call title was available; no substantive result explains the signals."}));
 const result=await reviewer().analyzeNewsLegitimacyBatch([evidence],25);
 expect(result.results.get("TEST")).toMatchObject({hasLegitimateNews:false,skipped:false,eventType:"NONE",evidenceIds:[]});
 const schema=mockCreate.mock.calls[0][0].response_format.json_schema.schema.properties.results.items.anyOf[0];
 expect(schema.properties.decision.enum).toEqual(["NONE","EARNINGS:E1"]);
 expect(schema.properties).not.toHaveProperty("hasLegitimateNews");
});
it("rejects a real citation paired with an event its content does not support",async()=>{
 mockCreate.mockResolvedValue(answer(["E1"],{decision:"MANAGEMENT_CHANGE:E1"}));
 expect((await reviewer().analyzeNewsLegitimacyBatch([await item()],25)).results.get("TEST")).toMatchObject({hasLegitimateNews:false,skipped:true});
});
it("keeps a bare CEO mention distinct from a management change and retains substantive new event types",()=>{
 expect(materialEventExcerpts({title:"CEO discusses weak demand in China"})).not.toHaveProperty("MANAGEMENT_CHANGE");
 expect(materialEventExcerpts({title:"Example appoints a new CEO"})).toHaveProperty("MANAGEMENT_CHANGE");
 expect(materialEventExcerpts({title:"Example announces £25 million fundraising"})).toHaveProperty("FINANCING");
 expect(materialEventExcerpts({title:"Example makes first commercial delivery of its new test panel"})).toHaveProperty("PRODUCT_LAUNCH");
 expect(materialEventExcerpts({title:"Example to invest nearly $3 billion in a new mill"})).toHaveProperty("CAPITAL_INVESTMENT");
 expect(materialEventExcerpts({title:"Example plans to cut 2,500 jobs"})).toHaveProperty("RESTRUCTURING");
});
