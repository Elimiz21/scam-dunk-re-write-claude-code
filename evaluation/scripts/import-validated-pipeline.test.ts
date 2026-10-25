import {validatePipelineRelease} from './import-validated-pipeline';
import {SCORING_VERSION,SCORE_UNIT} from '../../src/lib/scoring/policy';
import {NEWS_REVIEW_MODEL,NEWS_REVIEW_VERSION} from './news-review';
const date='2026-10-23',sha='a'.repeat(40);
const run={id:123,path:'.github/workflows/enhanced-daily-evaluation.yml',event:'workflow_dispatch',conclusion:'success',head_repository:{full_name:'Elimiz21/scam-dunk-re-write-claude-code'},head_sha:sha};
function fixture(){
 const row={symbol:'TEST',riskLevel:'HIGH',totalScore:8,marketCap:1e8,avgDollarVolume:1e6,scoringVersion:SCORING_VERSION,scoreUnit:SCORE_UNIT,newsTriage:'RETAINED',signals:[],newsEvidence:{sources:['news','sec_filings','press_releases'].map(source=>({source,status:'EMPTY',items:[]})),review:{model:NEWS_REVIEW_MODEL,reviewVersion:NEWS_REVIEW_VERSION}}};
 const docs:Record<string,any>={
  'enhanced-evaluation':[row],'enhanced-high-risk':[row],'suspicious-stocks':[row],
  'daily-report':{},'fmp-summary':{evaluated:1,coverageAccounting:{processing:{reconciles:true,unprocessed:{total:0}}},byRiskLevel:{LOW:0,MEDIUM:0,HIGH:1,INSUFFICIENT:0}},
  'scan-status':{date,pipelineStatus:'degraded',phases:{phase1_riskScoring:{status:'completed'},phase3_newsAnalysis:{status:'completed',details:{reviewModel:NEWS_REVIEW_MODEL,reviewVersion:NEWS_REVIEW_VERSION,newsFilterSkipped:0,newsAnalysisMetrics:{candidatesDeferred:0,eligibleRecords:1,candidatesSelected:1}}}}},
  'otc-coverage':{},'social-media-scan':{},'promoted-stocks':{},
 };
 return docs;
}
const files=(docs:Record<string,any>)=>Object.fromEntries(Object.entries(docs).map(([name,value])=>[`${name}-${date}.json`,Buffer.from(JSON.stringify(value))]));
test('retains the tested bytes and marks explicitly partial social coverage as degraded',()=>{
 const input=files(fixture()),output=validatePipelineRelease({date,run,acceptedCommits:[sha],files:input});
 expect(output[`enhanced-evaluation-${date}.json`]).toBe(input[`enhanced-evaluation-${date}.json`]);
 expect(JSON.parse(output[`pipeline-validation-${date}.json`].toString())).toMatchObject({status:'degraded',validatedCommit:sha,filesMissing:0});
});
test.each([
 ['different commit',(d:any)=>{}, {...run,head_sha:'b'.repeat(40)}],
 ['failed run',(d:any)=>{}, {...run,conclusion:'failure'}],
 ['foreign repository',(d:any)=>{}, {...run,head_repository:{full_name:'other/repo'}}],
 ['wrong score version',(d:any)=>{d['enhanced-evaluation'][0].scoringVersion='old';},run],
 ['incomplete review',(d:any)=>{d['enhanced-evaluation'][0].newsTriage='DEFERRED';},run],
 ['older review model',(d:any)=>{d['enhanced-evaluation'][0].newsEvidence.review.model='gpt-4o-mini';},run],
 ['missing reviewed alerts',(d:any)=>{d['suspicious-stocks']=[];},run],
 ['unprocessed instruments',(d:any)=>{d['fmp-summary'].coverageAccounting.processing.unprocessed.total=1;},run],
 ['count mismatch',(d:any)=>{d['fmp-summary'].byRiskLevel.HIGH=0;},run],
 ['failed scoring',(d:any)=>{d['scan-status'].phases.phase1_riskScoring.status='failed';},run],
])('blocks %s before release',(_name,mutate,metadata)=>{
 const docs=fixture();(mutate as Function)(docs);
 expect(()=>validatePipelineRelease({date,run:metadata,acceptedCommits:[sha],files:files(docs)})).toThrow();
});
