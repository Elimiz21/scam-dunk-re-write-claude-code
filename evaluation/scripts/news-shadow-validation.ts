/** Provider-backed retrieval validation only. Never ingests or publishes market results. */
import fs from "fs";
import path from "path";
import { createNewsAnalysisPlan } from "./news-analysis-plan";
import { createNewsReview, type NewsEvidence } from "./news-review";
import { retrievalComplete } from "./news-evidence";
import { hasIndependentWarning } from "../../src/lib/news-triage";

async function main() {
  const date = process.env.EVALUATION_DATE ?? "";
  const scope = process.env.NEWS_SHADOW_SCOPE ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["100","500","full"].includes(scope)) throw new Error("Explicit date and 100/500/full shadow scope required");
  const inputFile = process.env.NEWS_SHADOW_INPUT ?? "";
  const rows = JSON.parse(fs.readFileSync(inputFile,"utf8"));
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.symbol !== "string" || !/^[A-Z][A-Z0-9.-]{0,11}$/.test(row.symbol) || typeof row.name !== "string" || !Number.isFinite(row.totalScore))) throw new Error("Invalid retained evaluation cohort");
  const resultsDir = path.join(__dirname,"..","results");
  fs.mkdirSync(resultsDir,{recursive:true});
  const sourceRows = rows.filter(row => row.riskLevel !== "INSUFFICIENT");
  const plan = createNewsAnalysisPlan(sourceRows,scope === "full" ? Number.MAX_SAFE_INTEGER : Number(scope),10);
  const review = createNewsReview({date,fmpKey:process.env.FMP_API_KEY ?? "",openaiKey:process.env.OPENAI_API_KEY ?? "",resultsDir});
  const output: Array<Record<string,unknown>> = [];
  const startedAt = new Date().toISOString();
  for (const batch of plan.batches) {
    const evidence = await Promise.all(batch.map(async group => {
      const symbol = group.key;
      const sources = await Promise.all([review.fetchStockNews(symbol),review.fetchSECFilings(symbol),review.fetchPressReleases(symbol)]);
      const eligible = (index: number) => sources[index].items.filter(item=>item.eligible).map(item=>item.raw);
      return {key:symbol,result:group.representative,sources,news:eligible(0),secFilings:eligible(1),pressReleases:eligible(2)} as NewsEvidence;
    }));
    const eligible = evidence.filter(item=>retrievalComplete(item.sources)&&item.sources.some(source=>source.items.some(item=>item.eligible)));
    const verdict = eligible.length ? await review.analyzeNewsLegitimacyBatch(eligible,25) : null;
    for (const item of evidence) {
      const result = verdict?.results.get(item.key);
      const status = !retrievalComplete(item.sources) ? item.sources.some(source=>source.status === "ERROR") ? "ERROR" : "UNAVAILABLE" : !eligible.includes(item) ? "NO_EVIDENCE" : result?.skipped ? /^DEFERRED:/.test(result.analysis) ? "DEFERRED" : verdict?.unavailable ? "UNAVAILABLE" : "ERROR" : result ? result.hasLegitimateNews && !hasIndependentWarning(item.result) ? "CLEARED" : "RETAINED" : "ERROR";
      const record = {symbol:item.key,status,sources:item.sources,verdict:result ?? null};
      output.push(record);
      fs.appendFileSync(path.join(resultsDir,`news-shadow-${scope}-${date}.jsonl`),JSON.stringify(record)+"\n");
    }
    console.log(JSON.stringify({progress:output.length,selected:plan.selected.length,sourceRequests:review.calls,costBoundUsd:review.modelCostBoundUsd}));
  }
  const statuses = output.reduce<Record<string,number>>((counts,row)=>{counts[String(row.status)]=(counts[String(row.status)]??0)+1;return counts;},{});
  const report = {schemaVersion:"news-shadow-validation/v1",mode:"SHADOW_ONLY",published:false,sourceCohort:"retained historical scoring output; this does not revalidate point-in-time instruments or classifier efficacy",date,scope,startedAt,completedAt:new Date().toISOString(),inputRecords:rows.length,excludedInsufficient:rows.length-sourceRows.length,eligibleRecords:sourceRows.length,uniqueInstruments:plan.selected.length+plan.deferred.length,selected:plan.selected.length,deferredByScope:plan.deferred.length,accounted:output.length,unexplainedOmissions:plan.selected.length-output.length,statuses,sourceRequests:review.calls,modelCostBoundUsd:review.modelCostBoundUsd,sourceActualBilledCostUsd:null,reviewComplete:output.every(row=>["CLEARED","RETAINED","NO_EVIDENCE"].includes(String(row.status)))};
  fs.writeFileSync(path.join(resultsDir,`news-shadow-report-${scope}-${date}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if (report.unexplainedOmissions || !report.reviewComplete) process.exitCode=2;
}
if (require.main === module) main().catch(()=>{console.error("News shadow validation failed; inspect retained status artifacts");process.exitCode=1;});
