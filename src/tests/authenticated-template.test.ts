import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("approved authenticated Paper & Ink shell", () => {
  test("uses the shared approved logo in the sliding sidebar", () => {
    const sidebar = readProjectFile("src/components/Sidebar.tsx");

    expect(sidebar).toContain('import { NavigationLogo } from "./Logo";');
    expect(sidebar).toContain('<NavigationLogo href="/dashboard" onDarkSurface />');
    expect(sidebar).not.toContain("<Shield className=\"h-3.5 w-3.5 text-white\"");
  });

  test("uses the same navigation logo in the public and authenticated header", () => {
    const header = readProjectFile("src/components/Header.tsx");

    expect(header).toContain('import { NavigationLogo } from "./Logo";');
    expect(header).toContain('const logoHref = session?.user ? "/dashboard" : "/";');
    expect(header).toContain("<NavigationLogo href={logoHref}");
  });

  test("uses customer-facing plan names in the shared account badge", () => {
    const header = readProjectFile("src/components/Header.tsx");

    expect(header).toContain('effectiveUsage.plan === "PRO_MAX"');
    expect(header).toContain('effectiveUsage.plan === "PAID"');
    expect(header).toContain('? "Pro"');
    expect(header).toContain(': "Free"');
    expect(header).not.toContain('String(effectiveUsage.plan).replaceAll("_", " ")');
    expect(header).not.toContain('font-semibold uppercase tracking-wide text-primary');
  });

  test("keeps account and subscription screens inside the current authenticated shell", () => {
    const account = readProjectFile("src/app/(protected)/account/page.tsx");

    expect(account).toContain('import { PageLayout } from "@/components/PageLayout";');
    expect(account).toContain("<PageLayout dashboardShell>");
    expect(account).not.toContain('<Shield className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />');
    expect(account).not.toContain('<Link href="/" className="flex items-center gap-2">');
  });

  test("keeps the activity strip inside the viewport without a horizontal scrollbar", () => {
    const ticker = readProjectFile("src/components/ActivityTicker.tsx");

    expect(ticker).toContain("overflow-hidden");
    expect(ticker).not.toContain("overflow-x-auto");
    expect(ticker).not.toContain("Other users");
    expect(ticker).not.toContain("community");
    expect(ticker).toContain("not live");
    expect(ticker).toContain("xl:hidden");
    expect(ticker).toContain("text-primary sm:flex");
    expect(ticker).toContain('compactLabel="Latest"');
    expect(ticker).toContain('compactLabel="High"');
    expect(ticker).toContain('aria-hidden="true"');
    expect(ticker).toContain('className="sr-only sm:hidden"');
  });

  test("keeps the authenticated scan home inside the approved dashboard shell", () => {
    const home = readProjectFile("src/app/HomeContent.tsx");

    expect(home).toContain("font-editorial");
    expect(home).toContain("max-w-[1600px]");
    expect(home).toContain("persistent");
    expect(home).toContain("Paste a ticker, get the truth.");
    expect(home).not.toContain("Pump Radar shows market-wide findings");
  });

  test("takes a normal login to the feature dashboard unless a safe callback is supplied", () => {
    const login = readProjectFile("src/app/(auth)/login/page.tsx");

    expect(login).toContain('searchParams.get("callbackUrl") || "/dashboard"');
  });

  test("uses the editorial display treatment for the dashboard heading", () => {
    const dashboard = readProjectFile("src/components/dashboard/DashboardHome.tsx");

    expect(dashboard).toContain("font-editorial");
  });

  test("keeps publication safety metadata on the separate Pump Radar surface", () => {
    const marketTable = readProjectFile("src/components/dashboard/UnifiedMarketTable.tsx");
    const pumpRadar = readProjectFile("src/components/dashboard/PumpRadar.tsx");

    expect(marketTable).not.toContain("<FreshnessNote");
    expect(pumpRadar).toContain("<FreshnessNote");
    expect(pumpRadar).toContain("executedAt={executedAt}");
    expect(pumpRadar).toContain("publicationQuality={publicationQuality}");
    expect(pumpRadar).toContain("socialPublication={socialPublication}");
  });

  test("uses the teal dashboard rail and keeps tracking status in the brand color", () => {
    const globals = readProjectFile("src/app/globals.css");
    const tailwind = readProjectFile("tailwind.config.js");
    const sidebar = readProjectFile("src/components/Sidebar.tsx");
    const home = readProjectFile("src/app/HomeContent.tsx");
    const monitorEditor = readProjectFile("src/components/dashboard/MonitorEditor.tsx");
    const marketTable = readProjectFile("src/components/dashboard/UnifiedMarketTable.tsx");
    const authenticatedSources = [sidebar, home, monitorEditor, marketTable].join("\n");

    expect(globals).toContain("--dashboard-shell: 191 46% 24%;");
    expect(globals).toContain("--dashboard-shell-active: 191 46% 31%;");
    expect(tailwind).toContain('dashboard: {');
    expect(sidebar).toContain("border-dashboard-border bg-dashboard text-dashboard-foreground");
    expect(sidebar).toContain("bg-dashboard-active");
    expect(sidebar).toContain('label === "Pump Radar" && "mt-6 border-t border-dashboard-border pt-5"');
    expect(marketTable).toContain('bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary');
    expect(marketTable).toContain('text-[13px] font-medium');
    expect(marketTable).toContain('text-[11px] text-muted-foreground');
    expect(home).toContain("border-dashboard-border bg-dashboard");
    expect(authenticatedSources).not.toContain("brand-blue");
  });

  test("allows the approved landing hero to shrink on narrow screens", () => {
    const landing = readProjectFile("src/components/landing/LandingOptionA.tsx");

    expect(landing).toContain('className="min-w-0"');
    expect(landing).toContain('className="min-w-0 flex-1');
  });
});
