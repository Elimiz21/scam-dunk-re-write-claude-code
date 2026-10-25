import fixtures from "../../python_ai/scoring-contract-fixtures.json";
import { scoreSignals, levelFromSignals } from "@/lib/scoring/policy";
import type { RiskSignal } from "@/lib/types";
test.each(fixtures)("shared contract: $name", fixture => {
 const signals=fixture.signals.map(signal=>({...signal,description:signal.code})) as RiskSignal[];
 expect(scoreSignals(signals)).toBe(fixture.score);expect(levelFromSignals(scoreSignals(signals),signals)).toBe(fixture.level);
});
it("removing RSI evidence cannot turn an ordinary-trend control into an active warning",()=>{
 const signals=fixtures[1].signals.filter(signal=>!['OVERBOUGHT_RSI','PERSISTENT_OVERBOUGHT'].includes(signal.code)).map(signal=>({...signal,description:signal.code})) as RiskSignal[];
 expect(levelFromSignals(scoreSignals(signals),signals)).toBe('MEDIUM');
});
