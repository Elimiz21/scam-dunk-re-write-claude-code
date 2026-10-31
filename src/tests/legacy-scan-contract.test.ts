import { NextRequest, NextResponse } from "next/server";
const mockProcess = jest.fn();
jest.mock("@/lib/check-scan",()=>({processCheckRequest: mockProcess}));
import { POST, GET } from "@/app/api/ai-analyze/route";
it("the legacy endpoint delegates once to durable canonical completion and never fabricates probability",async()=>{
 mockProcess.mockResolvedValue(NextResponse.json({resultId:"immutable-result",scoringVersion:"rules-2026-10-25-v2",assessedAt:"2026-10-25T00:00:00Z",riskLevel:"MEDIUM",totalScore:6,signals:[],stockSummary:{ticker:"TEST"},dataCompleteness:"full"}));
 const response=await POST(new NextRequest("http://localhost/api/ai-analyze",{method:"POST"}));
 expect(mockProcess).toHaveBeenCalledTimes(1);
 expect(await response.json()).toMatchObject({resultId:"immutable-result",riskLevel:"MEDIUM",riskScore:6,riskProbability:null,source:"canonical_rules",metadata:{analysisTimestamp:"2026-10-25T00:00:00Z"}});
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("preserves authentication, quota and persistence failures from the canonical route",async()=>{
 mockProcess.mockResolvedValue(NextResponse.json({error:"LIMIT_REACHED"},{status:429}));
 expect((await POST(new NextRequest("http://localhost/api/ai-analyze",{method:"POST"}))).status).toBe(429);
 expect(await (await GET()).json()).toMatchObject({scoreUnit:"deduplicated_signal_points",scoringMode:"canonical_rules"});
});
