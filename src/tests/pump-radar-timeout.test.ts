import { RequestTimeoutError, withRequestTimeout } from "@/lib/pump-radar-timeout";

describe("Pump Radar request timeout", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("aborts a request that exceeds its deadline", async () => {
    jest.useFakeTimers();
    const onTimeout = jest.fn();
    const request = new Promise<never>(() => undefined);
    const result = withRequestTimeout(request, 12_000, onTimeout);
    const rejected = expect(result).rejects.toBeInstanceOf(RequestTimeoutError);

    await jest.advanceTimersByTimeAsync(12_000);
    await rejected;
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  test("clears the deadline when a request completes", async () => {
    jest.useFakeTimers();

    await expect(withRequestTimeout(Promise.resolve("ready"), 12_000)).resolves.toBe("ready");
    expect(jest.getTimerCount()).toBe(0);
  });
});

