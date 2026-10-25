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
