import { readFileSync } from "node:fs";
import { join } from "node:path";

const nextConfig = readFileSync(join(process.cwd(), "next.config.js"), "utf8");

describe("Google Analytics CSP access", () => {
  test("allows the GA4 script and collection endpoints", () => {
    expect(nextConfig).toContain("https://www.googletagmanager.com");
    expect(nextConfig).toContain("https://www.google-analytics.com");
    expect(nextConfig).toContain("https://region1.google-analytics.com");
  });
});
