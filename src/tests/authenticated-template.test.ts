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
    expect(header).toContain("<NavigationLogo");
  });

  test("keeps the activity strip inside the viewport without a horizontal scrollbar", () => {
    const ticker = readProjectFile("src/components/ActivityTicker.tsx");

    expect(ticker).toContain("overflow-hidden");
    expect(ticker).not.toContain("overflow-x-auto");
    expect(ticker).not.toContain("Other users");
    expect(ticker).not.toContain("community");
    expect(ticker).toContain("not live");
    expect(ticker).toContain("xl:hidden");
  });

  test("keeps the authenticated scan home inside the approved dashboard shell", () => {
    const home = readProjectFile("src/app/HomeContent.tsx");

    expect(home).toContain("font-editorial");
    expect(home).toContain("max-w-[1600px]");
    expect(home).toContain("persistent");
    expect(home).toContain("Paste a ticker, get the truth.");
    expect(home).toContain("Checked after the trading day closes — not live.");
  });

  test("takes a normal login to the feature dashboard unless a safe callback is supplied", () => {
    const login = readProjectFile("src/app/(auth)/login/page.tsx");

    expect(login).toContain('searchParams.get("callbackUrl") || "/dashboard"');
  });

  test("uses the editorial display treatment for the dashboard heading", () => {
    const dashboard = readProjectFile("src/components/dashboard/DashboardHome.tsx");

    expect(dashboard).toContain("font-editorial");
    expect(dashboard).toContain("UnifiedMarketTable");
    expect(dashboard).toContain("not live");
  });

  test("allows the approved landing hero to shrink on narrow screens", () => {
    const landing = readProjectFile("src/components/landing/LandingOptionA.tsx");

    expect(landing).toContain('className="min-w-0"');
    expect(landing).toContain('className="min-w-0 flex-1');
  });
});
