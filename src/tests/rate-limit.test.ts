import { rateLimitConfigs } from "../lib/rate-limit";

describe("Rate Limit Configs", () => {
  test("strict config allows 5 requests per minute", () => {
    expect(rateLimitConfigs.strict.requests).toBe(5);
    expect(rateLimitConfigs.strict.windowMs).toBe(60 * 1000);
  });

  test("auth config allows 10 requests per minute", () => {
    expect(rateLimitConfigs.auth.requests).toBe(10);
    expect(rateLimitConfigs.auth.windowMs).toBe(60 * 1000);
  });

  test("standard config allows 30 requests per minute", () => {
    expect(rateLimitConfigs.standard.requests).toBe(30);
  });

  test("relaxed config allows 100 requests per minute", () => {
    expect(rateLimitConfigs.relaxed.requests).toBe(100);
  });

  test("heavy config allows 10 requests per minute", () => {
    expect(rateLimitConfigs.heavy.requests).toBe(10);
  });

  test("contact config allows 3 requests per hour", () => {
    expect(rateLimitConfigs.contact.requests).toBe(3);
    expect(rateLimitConfigs.contact.windowMs).toBe(60 * 60 * 1000);
  });

  test("all configs have required fields", () => {
    for (const [name, config] of Object.entries(rateLimitConfigs)) {
      expect(config).toHaveProperty("requests");
      expect(config).toHaveProperty("window");
      expect(config).toHaveProperty("windowMs");
      expect(typeof config.requests).toBe("number");
      expect(typeof config.windowMs).toBe("number");
      expect(config.requests).toBeGreaterThan(0);
      expect(config.windowMs).toBeGreaterThan(0);
    }
  });
});
