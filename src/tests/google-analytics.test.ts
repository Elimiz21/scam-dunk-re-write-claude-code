import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
const analytics = readFileSync(
  join(process.cwd(), "src/components/GoogleAnalytics.tsx"),
  "utf8",
);

describe("Google Analytics", () => {
  test("loads the approved GA4 measurement stream in the shared layout", () => {
    expect(layout).toContain('import { GoogleAnalytics } from "@/components/GoogleAnalytics";');
    expect(layout).toContain("<GoogleAnalytics />");
    expect(analytics).toContain("G-377T7N93Q6");
    expect(analytics).toContain("googletagmanager.com/gtag/js");
    expect(analytics).toContain('strategy="afterInteractive"');
    expect(analytics).toContain("window.gtag = window.gtag || gtag");
  });
});
