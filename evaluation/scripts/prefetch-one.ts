/** Overlap one read-only batch with processing; preserve order and backpressure. */
export async function* prefetchOne<T, U>(batches: readonly T[], load: (batch: T) => Promise<U>): AsyncGenerator<U> {
  const start = (batch: T) => Promise.resolve().then(() => load(batch)).then(
    value => ({ok:true as const,value}),
    error => ({ok:false as const,error}),
  );
  let pending = batches.length ? start(batches[0]) : undefined;
  try {
    for (let index=0; index<batches.length; index++) {
      const current = await pending!;
      pending = undefined;
      if (current.ok === false) throw current.error;
      if (index+1 < batches.length) pending = start(batches[index+1]);
      yield current.value;
    }
  } finally {
    // An early consumer failure must not leave an unobserved rejection or
    // work running after the enclosing pipeline snapshots its source cache.
    await pending;
  }
}
