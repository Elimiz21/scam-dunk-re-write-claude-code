const mockCreate = jest.fn();
jest.mock('openai',()=>jest.fn().mockImplementation(()=>({chat:{completions:{create:mockCreate}}})));
jest.mock('@/lib/config',()=>({config:{openaiApiKey:'fixture'}}));
jest.mock('@/lib/admin/metrics',()=>({logApiUsage:jest.fn().mockResolvedValue(undefined)}));
jest.mock('@/lib/scoring',()=>({getSignalsByCategory:(signals:any[])=>Object.fromEntries(['structural','pattern','behavioral','alert'].map(category=>[category,signals.filter(signal=>signal.category.toLowerCase()===category)]))}));
import {generateNarrative} from '@/lib/narrative';
const stock={ticker:'TEST',companyName:'Example',exchange:'NASDAQ',lastPrice:100,marketCap:1e9,avgDollarVolume30d:1e8};
const signal={code:'OVERBOUGHT_RSI',category:'PATTERN' as const,weight:1,description:'Overbought RSI'};
afterEach(()=>jest.restoreAllMocks());
test('a generated summary cannot reinterpret LOW as investment stability',async()=>{
 mockCreate.mockResolvedValue({choices:[{message:{content:JSON.stringify({header:'A stable and safe investment environment',stockRedFlags:['Overbought RSI'],behaviorRedFlags:[],suggestions:['Review official filings'],disclaimers:[]})}}]});
 const result=await generateNarrative('LOW',1,[signal],stock,true);
 expect(result.header).toMatch(/few warning signs.*supplied information/);expect(result.header).not.toMatch(/stable|safe|legitimate/);
 expect(result.stockRedFlags).toEqual(['Overbought RSI']);
});
test('malformed model list entries fall back to renderable, signal-backed text',async()=>{
 jest.spyOn(console,'error').mockImplementation(()=>{});
 mockCreate.mockResolvedValue({choices:[{message:{content:JSON.stringify({header:'Summary',stockRedFlags:[{message:'cannot render an object'}],behaviorRedFlags:[],suggestions:[],disclaimers:[]})}}]});
 const result=await generateNarrative('MEDIUM',2,[signal],stock);
 expect(result.header).toMatch(/caution/);expect(result.stockRedFlags).toEqual(['Overbought RSI']);
 expect([...result.stockRedFlags,...result.behaviorRedFlags,...result.suggestions,...result.disclaimers].every(line=>typeof line==='string')).toBe(true);
});
