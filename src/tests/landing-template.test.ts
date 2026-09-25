import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("approved Paper & Ink landing template", () => {
  test("keeps the photo-led hero, supporting imagery, and original positioning copy", () => {
    const landing = readProjectFile("src/components/landing/LandingOptionA.tsx");

    expect(landing).toContain("/images/landing/hero-reading.jpg");
    expect(landing).toContain("/images/landing/how-reading.jpg");
    expect(landing).toContain("That tip came from someone you trust.");
    expect(landing).toContain("Not another stock picker");
  });

  test("shows the Wall Street Journal mention between the hero and stats", () => {
    const landing = readProjectFile("src/components/landing/LandingOptionA.tsx");

    expect(landing).toContain('aria-label="Press mention"');
    expect(landing).toContain("As seen in");
    expect(landing).toContain("The Wall Street Journal");
    expect(landing).toContain('/images/press/wsj-logo.svg');
    expect(readProjectFile("public/images/press/wsj-logo.svg")).not.toHaveLength(0);
  });

  test("uses the approved logo asset in the shared brand component", () => {
    const logo = readProjectFile("src/components/Logo.tsx");

    expect(logo).toContain("/images/brand/logo.png");
    expect(logo).toContain("/images/brand/logo-dark.png");
    expect(logo).toContain('data-logo-layer="dark-wordmark"');
    expect(logo).toContain('clipPath: "inset(0 0 0 25%)"');
    expect(logo).toContain("export function NavigationLogo");
    expect(logo).toContain("onDarkSurface");
    expect(readProjectFile("public/images/brand/logo.png")).not.toHaveLength(0);
    expect(readProjectFile("public/images/landing/hero-reading.jpg")).not.toHaveLength(0);
    expect(readProjectFile("public/images/landing/how-phone.jpg")).not.toHaveLength(0);
    expect(readProjectFile("public/images/landing/how-reading.jpg")).not.toHaveLength(0);
  });

  test("keeps Pump Radar visible on the public home flow", () => {
    const home = readProjectFile("src/app/HomeContent.tsx");

    expect(home).toContain("<PublicPumpRadar />");
    expect(home).toContain("<PublicPumpRadar showDashboardLink />");
  });
});
