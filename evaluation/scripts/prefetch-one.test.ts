import {prefetchOne} from "./prefetch-one";
function deferred<T>() {let resolve!: (value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}

test("retrieves the next batch while processing the current one, never two batches ahead",async()=>{
  const started:string[]=[], b=deferred<string>(), c=deferred<string>();
  const iterator=prefetchOne(["a","b","c"],async key=>{started.push(key);return key==="b"?b.promise:key==="c"?c.promise:key;});
  expect(await iterator.next()).toEqual({done:false,value:"a"});
  expect(started).toEqual(["a","b"]);
  b.resolve("b");
  expect(await iterator.next()).toEqual({done:false,value:"b"});
  expect(started).toEqual(["a","b","c"]);
  c.resolve("c");
  expect(await iterator.next()).toEqual({done:false,value:"c"});
  expect(await iterator.next()).toEqual({done:true,value:undefined});
});
test("preserves result order without overlapping source loaders",async()=>{
  let active=0,max=0;const output:number[]=[];
  for await(const value of prefetchOne([1,2,3,4],async value=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return value;})) output.push(value);
  expect(output).toEqual([1,2,3,4]);expect(max).toBe(1);
});
test("handles an empty cohort without a request",async()=>{
  const load=jest.fn();for await(const _ of prefetchOne([],load)) throw Error("unexpected result");expect(load).not.toHaveBeenCalled();
});
test("observes an early prefetch rejection and reports it in order",async()=>{
  const error=Error("source failed");
  const iterator=prefetchOne([1,2,3],async value=>{if(value===2)throw error;return value;});
  expect((await iterator.next()).value).toBe(1);
  await Promise.resolve();await Promise.resolve();
  await expect(iterator.next()).rejects.toBe(error);
});
test("waits for the bounded in-flight source work when the consumer stops",async()=>{
  const next=deferred<number>(),finished=jest.fn();
  const iterator=prefetchOne([1,2,3],async value=>value===2?next.promise:value);
  await iterator.next();const closing=iterator.return(undefined).then(finished);
  await Promise.resolve();expect(finished).not.toHaveBeenCalled();next.resolve(2);await closing;expect(finished).toHaveBeenCalledTimes(1);
});
