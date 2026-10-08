import { readFileSync } from "node:fs";
import { join } from "node:path";

const signup = readFileSync(join(process.cwd(), "src/app/(auth)/signup/page.tsx"), "utf8");
const verify = readFileSync(join(process.cwd(), "src/app/(auth)/verify-email/page.tsx"), "utf8");
const login = readFileSync(join(process.cwd(), "src/app/(auth)/login/page.tsx"), "utf8");
const home = readFileSync(join(process.cwd(), "src/app/HomeContent.tsx"), "utf8");

describe("conversion funnel analytics", () => {
  test("records signup, verification, and login milestones", () => {
    expect(signup).toContain('trackEvent("signup_started"');
    expect(signup).toContain('trackEvent("registration_completed"');
    expect(verify).toContain('trackEventOnce("email_verified"');
    expect(login).toContain('trackEvent("login_success"');
  });

  test("records scan start and completion without personal data", () => {
    expect(home).toContain('trackEvent("run_scan"');
    expect(home).toContain('trackEvent("scan_completed"');
    expect(home).not.toContain("email:");
  });
});
