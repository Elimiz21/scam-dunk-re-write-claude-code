import fixtures from "../../python_ai/scoring-contract-fixtures.json";
import { scoreSignals, levelFromSignals } from "@/lib/scoring/policy";
import type { RiskSignal } from "@/lib/types";
import { scoreMarketData } from "@/lib/scoring/engine";
test.each(fixtures)("shared contract: $name", fixture => {
 const signals=fixture.signals.map(signal=>({...signal,description:signal.code})) as RiskSignal[];
 expect(scoreSignals(signals)).toBe(fixture.score);expect(levelFromSignals(scoreSignals(signals),signals)).toBe(fixture.level);
});
it("a small declining-price control with an extreme negative z-score is not market HIGH",()=>{
 const history=Array.from({length:100},(_,i)=>{
  const close=i<95?20+(i%2?0.001:-0.001):20-(i-94)*0.08;
  return {date:new Date(Date.UTC(2026,5,1+i)).toISOString().slice(0,10),open:close,high:close,low:close,close,volume:5000};
 });
 const result=scoreMarketData({marketData:{quote:{ticker:'CONTROL',companyName:'Declining price control',exchange:'OTC',lastPrice:19.6,marketCap:1e9,avgVolume30d:5000,avgDollarVolume30d:98000},priceHistory:history,isOTC:true,dataAvailable:true},pitchText:'',context:{},secFlagged:false});
 expect(result.signals.some(s=>s.code==='PRICE_ANOMALY' && s.weight===4)).toBe(true);
 expect(result.totalScore).toBe(9);
 expect(result.riskLevel).toBe('MEDIUM');
});
it("removing RSI evidence cannot turn an ordinary-trend control into an active warning",()=>{
 const signals=fixtures[1].signals.filter(signal=>!['OVERBOUGHT_RSI','PERSISTENT_OVERBOUGHT'].includes(signal.code)).map(signal=>({...signal,description:signal.code})) as RiskSignal[];
 expect(levelFromSignals(scoreSignals(signals),signals)).toBe('MEDIUM');
});
