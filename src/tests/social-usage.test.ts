import { SocialUsage } from "@/lib/social-scan/usage";
it("counts every paid attempt, rate limit and failure without storing URLs or secrets",()=>{
 const usage=new SocialUsage();usage.request("provider.example")(429,12);usage.request("provider.example")(null,10);
 expect(usage.snapshot()).toMatchObject({requests:2,providers:{"provider.example":{requests:2,rateLimited:1,errors:2,headerDurationMs:22}},actualBilledCostUsd:null,browserMinutes:null});
});
it("reserves ambiguous model cost, settles known usage once and stops before budget overshoot",()=>{
 const usage=new SocialUsage(.01);const settle=usage.reserveModel(.008);
 expect(()=>usage.reserveModel(.003)).toThrow("SOCIAL_MODEL_BUDGET_EXHAUSTED");
 expect(usage.snapshot().modelScreening.unknownUsageCalls).toBe(1);
 settle({prompt_tokens:100,completion_tokens:20});settle({prompt_tokens:100,completion_tokens:20});
 expect(usage.snapshot().modelScreening).toMatchObject({calls:1,promptTokens:100,completionTokens:20,unknownUsageCalls:0});
 expect(usage.snapshot().modelScreening.estimatedOrReservedUsd).toBeCloseTo(.000027);
});
