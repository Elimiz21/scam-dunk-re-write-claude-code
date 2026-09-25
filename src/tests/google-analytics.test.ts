import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("Google Analytics", () => {
  test("loads the approved GA4 measurement stream in the shared layout", () => {
    expect(layout).toContain('import Script from "next/script";');
    expect(layout).toContain("G-377T7N93Q6");
    expect(layout).toContain("googletagmanager.com/gtag/js");
    expect(layout).toContain("gtag('config'");
    expect(layout).toContain('id="google-analytics"');
    expect(layout).toContain('strategy="beforeInteractive"');
  });
});
