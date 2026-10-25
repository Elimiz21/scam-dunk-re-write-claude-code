import { fetchStockData } from "./enhanced-daily-pipeline";
const mockExec=jest.fn();
jest.mock("child_process",()=>({...jest.requireActual("child_process"),execSync:(...args:any[])=>mockExec(...args)}));
it("paces actual provider starts once while preserving fully validated listed data",async()=>{
 const before=process.env.EVALUATION_DATE;process.env.EVALUATION_DATE="2026-10-23";
 const starts:number[]=[];
 const history=Array.from({length:100},(_,index)=>({date:new Date(Date.UTC(2026,9,23-index)).toISOString().slice(0,10),open:100,high:101,low:99,close:100,volume:1000000}));
 mockExec.mockImplementation((command:string)=>{starts.push(Date.now());return JSON.stringify(command.includes('/profile?')?[{symbol:"TEST",companyName:"Test Corporation",isin:"US0000000000",currency:"USD",isEtf:false,isFund:false,isActivelyTrading:true,marketCap:1000000000,price:100}]:command.includes('/splits?')?[]:history);});
 try{
  const result=await fetchStockData("TEST");expect(result).toMatchObject({dataAvailable:true,quote:{ticker:"TEST",lastPrice:100,avgDollarVolume30d:100000000}});
  expect(starts).toHaveLength(3);expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(200);expect(starts[2]-starts[1]).toBeGreaterThanOrEqual(200);
 }finally{if(before===undefined)delete process.env.EVALUATION_DATE;else process.env.EVALUATION_DATE=before;}
});
