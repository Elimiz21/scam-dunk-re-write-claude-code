import { assessPriceHistory } from "./price-quality";
import { marketSessionOnOrBefore } from "../../src/lib/market-publication-freshness";
const bars = Array.from({length:40},(_,i)=>({ date: new Date(Date.UTC(2026,8,8+i)).toISOString().slice(0,10), open: 10,high:10,low:10,close:10,volume:1000 }));
test.each([["2026-09-07","2026-09-04"],["2026-09-06","2026-09-04"],["2026-11-27","2026-11-27"],["2030-01-01",null]])("%s resolves to %s", (day,expected)=>expect(marketSessionOnOrBefore(day!)).toBe(expected));
test("current, delayed, sparse, malformed and action histories have explicit outcomes",()=>{
  expect(assessPriceHistory(bars,"2026-10-17")).toBe("stale_prices");
  const current=bars.slice(0,-1); // ends Friday October 16
  expect(assessPriceHistory(current,"2026-10-17")).toBeNull();
  expect(assessPriceHistory(current.slice(0,-1),"2026-10-17")).toBe("stale_prices");
  expect(assessPriceHistory(current.slice(-5),"2026-10-17")).toBe("insufficient_history");
  expect(assessPriceHistory([...current.slice(0,-1),{...current.at(-1)!,volume:0}],"2026-10-17")).toBe("sparse_trading");
  expect(assessPriceHistory([...current.slice(0,-1),{...current.at(-1)!,close:100,high:100}],"2026-10-17")).toBe("corporate_action");
});
