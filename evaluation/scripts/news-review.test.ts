import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { createNewsReview, type NewsEvidence } from "./news-review";
import { evidenceWindow, retrieveEvidence } from "./news-evidence";
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
function answer(evidenceIds: string[], overrides = {}) {return {choices:[{message:{content:JSON.stringify({results:[{symbol:"TEST",hasLegitimateNews:true,specificEvent:"Earnings",explanation:"Dated event",evidenceIds,...overrides}]})}}],usage:{prompt_tokens:50, completion_tokens:30}};}
it("requires exact dated citations and retains complete model input/output and metered usage", async () => {
 const evidence=await item(); mockCreate.mockResolvedValue(answer([evidence.sources[0].items[0].id]));
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
 expect(mockCreate.mock.calls[0][0].response_format).toMatchObject({type:"json_schema",json_schema:{strict:true}});
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
