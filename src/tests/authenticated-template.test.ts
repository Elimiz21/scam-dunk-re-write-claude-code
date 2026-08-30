import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("approved authenticated Paper & Ink shell", () => {
  test("uses the shared approved logo in the sliding sidebar", () => {
    const sidebar = readProjectFile("src/components/Sidebar.tsx");

    expect(sidebar).toContain('import { Logo } from "./Logo";');
    expect(sidebar).toContain('<Logo size={32} href="/" />');
    expect(sidebar).not.toContain("<Shield className=\"h-3.5 w-3.5 text-white\"");
  });

  test("keeps the authenticated scan home in the approved editorial language and exposes the dashboard features", () => {
    const home = readProjectFile("src/app/HomeContent.tsx");

    expect(home).toContain("font-editorial");
    expect(home).toContain("Open dashboard");
    expect(home).toContain("Manage watchlist");
    expect(home).toContain("Checked after the trading day closes — not live.");
  });

  test("takes a normal login to the feature dashboard unless a safe callback is supplied", () => {
    const login = readProjectFile("src/app/(auth)/login/page.tsx");

    expect(login).toContain('searchParams.get("callbackUrl") || "/dashboard"');
  });

  test("uses the editorial display treatment for the dashboard heading", () => {
    const dashboard = readProjectFile("src/app/(protected)/dashboard/page.tsx");

    expect(dashboard).toContain("font-editorial");
    expect(dashboard).toContain("text-brand-blue");
  });

  test("allows the approved landing hero to shrink on narrow screens", () => {
    const landing = readProjectFile("src/components/landing/LandingOptionA.tsx");

    expect(landing).toContain('className="min-w-0"');
    expect(landing).toContain('className="min-w-0 flex-1');
  });
});
