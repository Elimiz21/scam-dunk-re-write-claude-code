import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RiskCard } from "@/components/RiskCard";
import { generateFallbackNarrative, generateNarrative } from "@/lib/narrative";
import type { RiskResponse, RiskSignal } from "@/lib/types";

const stock = { ticker: "MISSING" };
const warning: RiskSignal = { code: "ALERT_LIST_HIT", category: "ALERT", weight: 5, description: "Regulatory suspension" };
function result(overrides: Partial<RiskResponse> = {}): RiskResponse {
  return {
    riskLevel: "INSUFFICIENT", totalScore: 0, signals: [], stockSummary: stock,
    narrative: generateFallbackNarrative("INSUFFICIENT", 0, [], stock),
    usage: { plan: "FREE", scansUsedThisMonth: 1, scansLimitThisMonth: 1, limitReached: true },
    dataCompleteness: "none", ...overrides,
  };
}

test("missing data produces an unavailable narrative and no numeric score or clean-market claim", async () => {
  const narrative = await generateNarrative("INSUFFICIENT", 0, [], stock);
  const html = renderToStaticMarkup(createElement(RiskCard, { result: result({ narrative }) }));
  expect(html).toContain("Assessment unavailable");
  expect(html).toContain("not enough market data");
  expect(html).not.toContain("/ 100");
  expect(html).not.toContain("No concerning market signals");
  expect(html).toContain("Caution");
});

test("a stale client narrative cannot reassure when market coverage is absent", () => {
  const value = result();
  value.narrative.stockRedFlags = ["No concerning market signals detected for this stock"];
  expect(renderToStaticMarkup(createElement(RiskCard, { result: value }))).not.toContain("No concerning market signals");
});

test("regulatory warnings survive missing market data", () => {
  const value = result({ riskLevel: "HIGH", totalScore: 5, signals: [warning], narrative: generateFallbackNarrative("HIGH", 5, [warning], stock) });
  const html = renderToStaticMarkup(createElement(RiskCard, { result: value }));
  expect(html).toContain("Regulatory suspension");
  expect(html).toContain("High risk");
  expect(html).toContain("not enough market data");
});

test("complete assessments retain their numeric display", () => {
  const html = renderToStaticMarkup(createElement(RiskCard, { result: result({ riskLevel: "LOW", dataCompleteness: "full" }) }));
  expect(html).toContain("signal points");
  expect(html).not.toContain("Assessment unavailable");
});

test("structural caution displays the original signal points without a percentage scale",()=>{
 const html=renderToStaticMarkup(createElement(RiskCard,{result:result({riskLevel:"MEDIUM",totalScore:6,dataCompleteness:"full"})}));
 expect(html).toContain("Caution");expect(html).toContain(">6</span>");expect(html).toContain("signal points");expect(html).not.toContain("/ 100");
});

test("behavioral HIGH with only an RSI observation does not invent a price or volume spike",()=>{
 const signals: RiskSignal[]=[
  {code:"OVERBOUGHT_RSI",category:"PATTERN",weight:1,description:"Overbought RSI"},
  {code:"PROMISED_RETURNS",category:"BEHAVIORAL",weight:2,description:"Guaranteed-return claim"},
  {code:"URGENCY",category:"BEHAVIORAL",weight:2,description:"Urgency pressure"},
  {code:"SECRECY",category:"BEHAVIORAL",weight:2,description:"Secret-information claim"},
 ];
 const value=result({riskLevel:"HIGH",totalScore:7,signals,dataCompleteness:"full",narrative:generateFallbackNarrative("HIGH",7,signals,stock)});
 const html=renderToStaticMarkup(createElement(RiskCard,{result:value}));
 expect(html).toContain("Guaranteed-return claim");
 expect(html).toContain("market indicators");
 expect(html).not.toContain("unusual trading activity (price spikes, volume surges, or pump-and-dump patterns)");
 expect(html).not.toContain("this combination increases the overall concern");
});
