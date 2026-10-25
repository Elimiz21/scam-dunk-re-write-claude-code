/** Import only a completed full rehearsal from this candidate or its merge parent. */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { SCORING_VERSION, SCORE_UNIT } from "../../src/lib/scoring/policy";
import { NEWS_REVIEW_MODEL, NEWS_REVIEW_VERSION } from "./news-review";
import { retrievalComplete } from "./news-evidence";
import { assessPublicationQuality } from "../../src/lib/admin/artifact-quality";
import { reviewedAlertEligible } from "../../src/lib/news-triage";
import { shouldFilterBySize } from "./market-shortlist";

const prefixes = ["enhanced-evaluation", "enhanced-high-risk", "suspicious-stocks", "daily-report", "fmp-summary", "scan-status", "otc-coverage", "social-media-scan", "promoted-stocks"];
const completeTriage = new Set(["CLEARED", "RETAINED", "NO_EVIDENCE"]);
export function validatePipelineRelease(input: {date: string; run: any; acceptedCommits: string[]; files: Record<string, Buffer>}) {
  const {date, run, acceptedCommits, files} = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0,10) !== date) throw Error("Invalid release scan date");
  if (!Number.isSafeInteger(run?.id) || run.id < 1 || run.path !== ".github/workflows/enhanced-daily-evaluation.yml" || run.event !== "workflow_dispatch" || run.conclusion !== "success" || run.head_repository?.full_name !== "Elimiz21/scam-dunk-re-write-claude-code" || !/^[a-f0-9]{40}$/.test(run.head_sha) || !acceptedCommits.includes(run.head_sha)) throw Error("Validation run does not belong to this reviewed candidate");
  for (const prefix of prefixes) if (!files[`${prefix}-${date}.json`]) throw Error("Full validation output is missing");
  const read = (prefix: string) => JSON.parse(files[`${prefix}-${date}.json`].toString("utf8"));
  const rows = read("enhanced-evaluation"), summary = read("fmp-summary"), status = read("scan-status");
  if (!Array.isArray(rows) || rows.length < 1 || summary.evaluated !== rows.length || summary.coverageAccounting?.processing?.reconciles !== true || summary.coverageAccounting.processing.unprocessed?.total !== 0) throw Error("Evaluation coverage is incomplete or does not reconcile");
  const counts: Record<string,number> = {LOW:0, MEDIUM:0, HIGH:0, INSUFFICIENT:0};
  const symbols = new Set<string>();
  for (const row of rows) {
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(row.symbol) || symbols.has(row.symbol) || !Object.prototype.hasOwnProperty.call(counts,row.riskLevel) || !Number.isSafeInteger(row.totalScore) || row.totalScore < 0 || row.scoringVersion !== SCORING_VERSION || row.scoreUnit !== SCORE_UNIT) throw Error("Evaluation contains incompatible instruments or score units");
    symbols.add(row.symbol); counts[row.riskLevel]++;
    if (row.riskLevel === "INSUFFICIENT") continue;
    if (!completeTriage.has(row.newsTriage) || !Array.isArray(row.newsEvidence?.sources) || !retrievalComplete(row.newsEvidence.sources)) throw Error("News coverage is incomplete");
    if (row.newsTriage !== "NO_EVIDENCE" && (row.newsEvidence.review?.model !== NEWS_REVIEW_MODEL || row.newsEvidence.review?.reviewVersion !== NEWS_REVIEW_VERSION)) throw Error("News decision provenance is incompatible");
  }
  if (Object.entries(counts).some(([level,count]) => summary.byRiskLevel?.[level] !== count)) throw Error("Risk distribution does not reconcile");
  const expectedAlerts=rows.filter(row=>reviewedAlertEligible(row)&&!shouldFilterBySize(row).filtered).map(row=>row.symbol).sort();
  const alerts=read("suspicious-stocks");
  if (!Array.isArray(alerts) || JSON.stringify(alerts.map(row=>row.symbol).sort()) !== JSON.stringify(expectedAlerts)) throw Error("Reviewed alerts were lost or unreviewed observations were promoted");
  const news = status.phases?.phase3_newsAnalysis;
  const metrics = news?.details?.newsAnalysisMetrics;
  const eligible = rows.length - counts.INSUFFICIENT;
  if (status.date !== date || news?.status !== "completed" || news.details.reviewModel !== NEWS_REVIEW_MODEL || news.details.reviewVersion !== NEWS_REVIEW_VERSION || news.details.newsFilterSkipped !== 0 || metrics?.candidatesDeferred !== 0 || metrics.eligibleRecords !== eligible || metrics.candidatesSelected !== eligible) throw Error("Full current-model news review did not complete");
  const validation = {
    date, timestamp: new Date().toISOString(), status: status.pipelineStatus === "completed" ? "healthy" : "degraded", scanPipelineStatus: status.pipelineStatus,
    filesExpected: prefixes.length, filesPresent: prefixes.length, filesMissing: 0,
    workflowRun: String(run.id), validatedCommit: run.head_sha, releaseInput: "completed full isolated pipeline; no provider rerun during import",
  };
  const output = {...files, [`pipeline-validation-${date}.json`]: Buffer.from(JSON.stringify(validation,null,2))};
  assessPublicationQuality(date,output);
  return output;
}

function locate(root: string, name: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if (entry.isSymbolicLink()) throw Error("Symbolic links are not valid release input");
    const file=path.join(root,entry.name);
    if (entry.isFile() && entry.name===name) found.push(file);
    else if (entry.isDirectory() && !["market-http-cache","news-cache","news-decisions"].includes(entry.name)) found.push(...locate(file,name));
  }
  return found;
}
if (require.main === module) {
  const [metadataFile, artifactRoot, date] = process.argv.slice(2);
  const run=JSON.parse(fs.readFileSync(metadataFile,"utf8"));
  const commit=execFileSync("git",["cat-file","-p","HEAD"],{encoding:"utf8"});
  const acceptedCommits=[execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),...Array.from(commit.matchAll(/^parent ([a-f0-9]{40})$/gm),match=>match[1])];
  const names=prefixes.map(prefix=>`${prefix}-${date}.json`);
  const files: Record<string,Buffer>={};
  for (const name of names) {
    const matches=locate(artifactRoot,name);
    if (matches.length!==1) throw Error("Release input is missing or ambiguous");
    files[name]=fs.readFileSync(matches[0]);
  }
  const output=validatePipelineRelease({date,run,acceptedCommits,files});
  const staticFiles: Record<string,Buffer>={};
  for (const name of ["scheme-database.json","promoter-database.json"]) {
    const matches=locate(artifactRoot,name); if (matches.length!==1) throw Error("Current scheme state is missing or ambiguous");
    const data=fs.readFileSync(matches[0]); JSON.parse(data.toString("utf8"));staticFiles[name]=data;
  }
  const results=path.join(__dirname,"..","results"); fs.mkdirSync(results,{recursive:true});
  for (const [name,bytes] of Object.entries(output)) fs.writeFileSync(path.join(results,name),bytes);
  const target=path.join(__dirname,"..","scheme-database");fs.mkdirSync(target,{recursive:true});
  for (const [name,bytes] of Object.entries(staticFiles)) fs.writeFileSync(path.join(target,name),bytes);
  console.log(JSON.stringify({status:"VALIDATED_RELEASE_INPUT",date,sourceRun:run.id,sourceCommit:run.head_sha,files:Object.keys(output).length}));
}
