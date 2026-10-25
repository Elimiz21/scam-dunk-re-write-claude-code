/** Fresh provider acquisition and canonical scoring; no database, publication or messaging. */
import fs from "fs";
import path from "path";
import { fetchStockData, loadStockList, listedDataFailure } from "./enhanced-daily-pipeline";
import { computeRiskScore } from "./standalone-scorer";
import { OtcClient, runOtcScan, reconcileListedResults } from "./otc-daily";
import { SCORING_VERSION, SCORE_UNIT } from "../../src/lib/scoring/policy";

async function main() {
 const date=process.env.EVALUATION_DATE ?? "", scope=process.env.RISK_SHADOW_SCOPE ?? "";
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["100","500","full"].includes(scope) || !process.env.FMP_API_KEY) throw new Error("Explicit date, scope and provider credentials required");
 if (["DATABASE_URL","DIRECT_URL","RESEND_API_KEY","SOCIAL_SCAN_APP_URL","SOCIAL_SCAN_API_KEY","SOCIAL_SCAN_INGEST_KEY","AI_BACKEND_URL"].some(key=>process.env[key])) throw new Error("Shadow validation must not have publication, database or messaging credentials");
 const dir=path.join(__dirname,"..","results");fs.mkdirSync(dir,{recursive:true});
 const limit=scope === "full" ? undefined : Number(scope);
 const universe=loadStockList(), selected=limit ? universe.slice(0,limit) : universe;
 const results:any[]=[], outcomes:any[]=[]; const startedAt=new Date().toISOString();
 for (const stock of selected) {
   try {
     const marketData=await fetchStockData(stock.symbol);
     if (!marketData?.dataAvailable) outcomes.push({symbol:stock.symbol,status:"excluded",reason:listedDataFailure(stock.symbol)});
     else if (marketData.isOTC) outcomes.push({symbol:stock.symbol,status:"excluded",reason:"requires_fresh_otc_directory"});
     else {
       const score=computeRiskScore(marketData);
       results.push({...score,symbol:stock.symbol,name:marketData.quote.companyName,exchange:marketData.quote.exchange,scoringVersion:SCORING_VERSION,scoreUnit:SCORE_UNIT});
       outcomes.push({symbol:stock.symbol,status:"evaluated",reason:"canonical_rules"});
       fs.appendFileSync(path.join(dir,`risk-shadow-inputs-${scope}-${date}.jsonl`),JSON.stringify({symbol:stock.symbol,marketData,score,scoringVersion:SCORING_VERSION})+"\n");
     }
   } catch { outcomes.push({symbol:stock.symbol,status:"failed",reason:"acquisition_or_scoring_error"}); }
   if (outcomes.length % 25 === 0) console.log(JSON.stringify({listedAccounted:outcomes.length,listedSelected:selected.length}));
 }
 const client=new OtcClient(process.env.FMP_API_KEY,{spacingMs:250});
 const otc=await runOtcScan(date,client.request,{limit,checkpoint:coverage=>fs.writeFileSync(path.join(dir,`risk-shadow-otc-${scope}-${date}.json`),JSON.stringify(coverage,null,2))});
 const retained=reconcileListedResults(results,otc.coverage.directorySymbols);
 const final=[...retained,...otc.results];
 const categories=final.reduce<Record<string,number>>((counts,row)=>{counts[row.riskLevel]=(counts[row.riskLevel]??0)+1;return counts;},{});
 const excluded=outcomes.reduce<Record<string,number>>((counts,row)=>{if(row.status!=="evaluated")counts[row.reason]=(counts[row.reason]??0)+1;return counts;},{});
 const report={mode:"SHADOW_ONLY",published:false,date,scope,startedAt,completedAt:new Date().toISOString(),scoringVersion:SCORING_VERSION,scoreUnit:SCORE_UNIT,listedUniverse:universe.length,listedSelected:selected.length,listedAccounted:outcomes.length,unexplainedOmissions:selected.length-outcomes.length,listedExclusions:excluded,scored:final.length,categories,otcCoverage:otc.coverage,otcApiCalls:client.calls,efficacy:"NOT_EVALUATED; independent labels required"};
 fs.writeFileSync(path.join(dir,`risk-shadow-results-${scope}-${date}.json`),JSON.stringify(final,null,2));
 fs.writeFileSync(path.join(dir,`risk-shadow-outcomes-${scope}-${date}.json`),JSON.stringify(outcomes,null,2));
 fs.writeFileSync(path.join(dir,`risk-shadow-report-${scope}-${date}.json`),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,otcCoverage:{status:otc.coverage.status}}));
 if(report.unexplainedOmissions || !final.length || outcomes.some(row=>row.status==="failed"))process.exitCode=2;
}
if(require.main === module)main().catch(()=>{console.error("Fresh risk shadow validation failed; inspect retained status artifacts");process.exitCode=1;});
