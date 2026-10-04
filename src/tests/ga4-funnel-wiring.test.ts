import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("GA4 funnel wiring", () => {
  test("sets authenticated user properties before downstream client events", () => {
    const analytics = read("src/lib/analytics.ts");
    const identity = read("src/components/AnalyticsIdentity.tsx");

    expect(analytics).toContain('"user_properties"');
    expect(analytics).toContain("trackEventOnce");
    expect(identity).toContain("/api/analytics/identity");
    expect(identity).toContain("setAnalyticsIdentity");
  });

  test("tracks product-action, paywall, and checkout moments", () => {
    const home = read("src/app/HomeContent.tsx");
    const account = read("src/app/(protected)/account/page.tsx");
    const checkout = read("src/app/api/billing/stripe/checkout/route.ts");

    expect(home).toContain('trackEvent("run_scan"');
    expect(home).toContain('trackEventOnce("paywall_view"');
    expect(account).toContain('trackEventOnce("begin_checkout"');
    expect(checkout).toContain('eventType: "BEGIN_CHECKOUT"');
  });

  test("records and sends a deduplicated purchase after Stripe confirms payment", () => {
    const webhook = read("src/app/api/billing/stripe/webhook/route.ts");
    const schema = read("prisma/schema.prisma");
    const serverAnalytics = read("src/lib/conversion-funnel-server.ts");

    expect(webhook).toContain("recordStripePurchase");
    expect(serverAnalytics).toContain('eventType: "PURCHASE"');
    expect(serverAnalytics).toContain("sendServerAnalyticsEvent");
    expect(schema).toContain("model ConversionFunnelEvent");
    expect(schema).toMatch(/idempotencyKey\s+String\s+@unique/);
  });

  test("provides an authenticated admin report and an aggregate-only team report", () => {
    expect(read("src/app/api/admin/funnel/route.ts")).toContain("getConversionFunnelReport");
    expect(read("src/app/admin/funnel/page.tsx")).toContain("Conversion Funnel");
    expect(read("src/app/team/funnel/[token]/page.tsx")).toContain("FUNNEL_DASHBOARD_SHARE_TOKEN");
  });
});
