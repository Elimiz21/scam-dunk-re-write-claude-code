import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
const nextConfig = readFileSync(join(process.cwd(), "next.config.js"), "utf8");

describe("font loading", () => {
  test("does not require Google Fonts while building the application", () => {
    expect(layout).not.toContain('from "next/font/google"');
    expect(layout).toContain("fonts.googleapis.com");
    expect(layout).toContain("family=Inter:");
    expect(layout).toContain("family=Inter+Tight");
    expect(nextConfig).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(nextConfig).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });
});
