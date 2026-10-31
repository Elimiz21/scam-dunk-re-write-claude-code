import {execSync} from "child_process";
import {fetchStockData,listedDataFailure} from "./enhanced-daily-pipeline";
jest.mock("child_process",()=>({execSync:jest.fn()}));

it.each([
 "Example Inc. Warrant", "Example Inc. Subscription Rights",
 "Example Inc. Units", "Example Inc. Preferred Shares",
])("rejects directory security label %s before paid provider work",async directoryName=>{
 jest.clearAllMocks();
 expect(await fetchStockData("TYPEW",directoryName)).toBeNull();
 expect(listedDataFailure("TYPEW")).toBe("unsupported_instrument");
 expect(execSync).not.toHaveBeenCalled();
});
