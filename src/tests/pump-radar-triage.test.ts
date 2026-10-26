import {createPumpRadarService} from "@/lib/pump-radar";
const row=(id:string,newsTriage:string,signals="[]")=>({id,newsTriage,signals,riskLevel:"HIGH",totalScore:8,scoringVersion:"rules-2026-10-25-v2",signalCount:3,marketCap:1e8,stock:{symbol:id,name:"Example Common Corp",exchange:"NASDAQ",isOTC:false,sector:"Technology"}});
it("cleared market observations stay out of the radar while independent warnings survive with explicit review status",async()=>{
 const client={dailyScanSummary:{findFirst:jest.fn().mockResolvedValue({scanDate:new Date("2026-10-23"),publishedAt:new Date(),artifactRevision:{status:"PUBLISHED",qualityStatus:"VERIFIED"},totalStocks:5,evaluated:4,skippedNoData:1,byExchange:JSON.stringify({OTC:{identityQuarantines:[{symbol:"quarantined"}]}})})},stockDailySnapshot:{findMany:jest.fn().mockResolvedValue([row("clear","CLEARED"),row("regulatory","CLEARED",JSON.stringify([{code:"ALERT_LIST_HIT",category:"ALERT"}])),row("pending","DEFERRED"),row("retained","RETAINED")])},socialScanRun:{findFirst:jest.fn().mockResolvedValue(null)},socialMention:{findMany:jest.fn()}};
 const result=await createPumpRadarService(client).getPumpRadar({limit:10,viewer:"PUBLIC",now:new Date("2026-10-25T12:00:00Z")});
 expect(result.status).toBe("AVAILABLE");if(result.status!=="AVAILABLE")throw new Error("No publication");
 expect(result.rows).toHaveLength(3);expect(result.rows.map(row=>row.newsTriage)).toEqual(["CLEARED","DEFERRED","RETAINED"]);
 expect(result.rows.every(row=>row.score===8 && row.scoreUnit==="deduplicated_signal_points")).toBe(true);
 expect(client.stockDailySnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({scoringVersion:"rules-2026-10-25-v2"})}));
 expect(result.publicationQuality).toBe("DEGRADED");expect(result.notice).toContain("Raw market observations");
 expect(JSON.stringify(result.rows)).not.toContain('"ticker"');
});

function emptyViewClient(snapshots: any[]) {
 return {
  dailyScanSummary:{findFirst:jest.fn().mockResolvedValue({scanDate:new Date("2026-10-23"),totalStocks:5,evaluated:4,skippedNoData:1})},
  stockDailySnapshot:{findMany:jest.fn().mockResolvedValue(snapshots)},
  socialScanRun:{findFirst:jest.fn().mockResolvedValue(null)},socialMention:{findMany:jest.fn()},
 };
}
it.each([
 ["no matching current-rule assessments",[]],
 ["only unsupported instruments",[{...row("fund","RETAINED"),stock:{symbol:"FUND",name:"Example ETF Fund",exchange:"NYSE",isOTC:false}}]],
])("reports unavailable when the publication has %s",async(_reason,snapshots)=>{
 const client=emptyViewClient(snapshots as any[]);
 const result=await createPumpRadarService(client).getPumpRadar({limit:10,viewer:"PUBLIC"});
 expect(result).toMatchObject({status:"UNAVAILABLE",rows:[],coverage:null});
 expect(result.notice).toContain("Current market assessments are unavailable");
 expect(client.stockDailySnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({scoringVersion:"rules-2026-10-25-v2",riskLevel:{in:["LOW","MEDIUM","HIGH"]}})}));
 expect(client.socialScanRun.findFirst).not.toHaveBeenCalled();
});
it("retains a completed empty view when compatible observations were cleared",async()=>{
 const result=await createPumpRadarService(emptyViewClient([row("clear","CLEARED")])).getPumpRadar({limit:10,viewer:"PUBLIC"});
 expect(result).toMatchObject({status:"AVAILABLE",rows:[],asOf:"2026-10-23T00:00:00.000Z"});
});
it.each(["{}","[null]","not-json"])("does not turn malformed signal evidence %s into an independent warning",async signals=>{
 const result=await createPumpRadarService(emptyViewClient([row("clear","CLEARED",signals)])).getPumpRadar({limit:10,viewer:"PUBLIC"});
 expect(result).toMatchObject({status:"AVAILABLE",rows:[]});
});
it("finds retained and independent warnings beyond a full page of cleared observations",async()=>{
 const client=emptyViewClient([]);
 client.dailyScanSummary.findFirst.mockResolvedValue({scanDate:new Date("2026-10-23"),artifactRevisionId:"published-revision",totalStocks:202,evaluated:202,skippedNoData:0} as any);
 client.stockDailySnapshot.findMany
  .mockResolvedValueOnce(Array.from({length:200},(_,i)=>row(`cleared-${i}`,"CLEARED")))
  .mockResolvedValueOnce([row("retained","RETAINED"),row("independent","CLEARED",JSON.stringify([{code:"ALERT_LIST_HIT",category:"ALERT"}]))]);
 const result=await createPumpRadarService(client).getPumpRadar({limit:2,viewer:"PUBLIC"});
 expect(result.status).toBe("AVAILABLE");
 expect(result.rows.map(value=>value.newsTriage)).toEqual(["RETAINED","CLEARED"]);
 expect(client.stockDailySnapshot.findMany).toHaveBeenCalledTimes(2);
 expect(client.stockDailySnapshot.findMany).toHaveBeenNthCalledWith(2,expect.objectContaining({skip:200,take:200,where:expect.objectContaining({artifactRevisionId:"published-revision"}),orderBy:[{totalScore:"desc"},{signalCount:"desc"},{id:"asc"}]}));
});
