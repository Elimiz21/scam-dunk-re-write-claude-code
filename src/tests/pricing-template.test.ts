import { readFileSync } from "node:fs";
import { join } from "node:path";

const pricingPage = readFileSync(
  join(process.cwd(), "src/app/pricing/page.tsx"),
  "utf8",
);
const footer = readFileSync(
  join(process.cwd(), "src/components/Footer.tsx"),
  "utf8",
);
const landing = readFileSync(
  join(process.cwd(), "src/components/landing/LandingOptionA.tsx"),
  "utf8",
);
const help = readFileSync(
  join(process.cwd(), "src/app/help/HelpContent.tsx"),
  "utf8",
);
const terms = readFileSync(
  join(process.cwd(), "src/app/terms/TermsContent.tsx"),
  "utf8",
);
const limitReached = readFileSync(
  join(process.cwd(), "src/components/LimitReached.tsx"),
  "utf8",
);
const account = readFileSync(
  join(process.cwd(), "src/app/(protected)/account/page.tsx"),
  "utf8",
);
const homepageGenerator = readFileSync(
  join(process.cwd(), "src/app/api/admin/homepage/generate/route.ts"),
  "utf8",
);
const homePage = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const llms = readFileSync(join(process.cwd(), "public/llms.txt"), "utf8");
const signup = readFileSync(
  join(process.cwd(), "src/app/(auth)/signup/page.tsx"),
  "utf8",
);

describe("public pricing disclosure", () => {
  test("shows all three plans with their approved scan and monitoring limits", () => {
    expect(pricingPage).toContain('name: "Pro Max"');
    expect(pricingPage).toContain("200 manual scan credits");
    expect(pricingPage).toContain("10 full monitors");
    expect(pricingPage).toContain("20 price monitors");
    expect(pricingPage).toContain("50 manual scan credits");
    expect(pricingPage).toContain("2 full monitors");
    expect(pricingPage).toContain("5 price monitors");
    expect(pricingPage).toContain("5 manual scan credits");
    expect(pricingPage).toContain("1 price monitor");
  });

  test("explains watchlists, scheduled frequencies, credits, and the not-live boundary", () => {
    expect(pricingPage).toContain("Save as many supported US stocks as you want");
    expect(pricingPage).toContain("Daily");
    expect(pricingPage).toContain("Weekly");
    expect(pricingPage).toContain("Price monitor");
    expect(pricingPage).toContain("Full monitor");
    expect(pricingPage).toContain("not live");
    expect(pricingPage).toContain("Each completed scheduled check uses one credit");
    expect(pricingPage).toContain("in-app");
    expect(pricingPage).toContain("email");
    expect(pricingPage).toContain("1–24 months");
    expect(pricingPage).toContain("Plans differ by manual");
    expect(pricingPage).toContain("monitoring capacity");
  });

  test("keeps the shared footer links inside a narrow mobile viewport", () => {
    expect(footer).toContain("flex-wrap");
  });

  test("keeps landing, help, and terms pricing language aligned with the approved model", () => {
    expect(landing).toContain("Pro Max");
    expect(homePage).toContain("formatUsdCents");
    expect(landing).toContain("10 full monitors");
    expect(landing).toContain("20 price monitors");
    expect(help).toContain("Pro Max");
    expect(help).toContain("price monitoring");
    expect(terms).toContain("Pro Max");
    expect(terms).toContain("not live");
  });

  test("keeps machine-readable and signup pricing copy aligned", () => {
    expect(llms).toContain("Pro Max plan");
    expect(llms).toContain("10 full monitors");
    expect(llms).toContain("20 price monitors");
    expect(llms).toContain("daily or weekly");
    expect(signup).toContain("5 manual scan credits per month");
  });

  test("does not present a misleading upgrade for current Pro or Pro Max users", () => {
    expect(limitReached).toContain("Pro Max");
    expect(limitReached).toContain("Your Pro Max plan is active");
    expect(limitReached).toContain("Plan: {planLabel}");
    expect(account).toContain('currentPlan !== "PRO_MAX"');
    expect(account).toContain('plan.plan === "PRO_MAX"');
    expect(account).toContain('plan === "PRO_MAX" ? "Pro Max" : "Pro"');
    expect(account).toContain("Contact support to change from Pro to Pro Max");
    expect(homepageGenerator).toContain("Free, Pro, and Pro Max");
  });
});
