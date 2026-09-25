import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const registerRoute = readFileSync(
  join(process.cwd(), "src/app/api/auth/register/route.ts"),
  "utf8",
);
const signupPage = readFileSync(
  join(process.cwd(), "src/app/(auth)/signup/page.tsx"),
  "utf8",
);
const header = readFileSync(join(process.cwd(), "src/components/Header.tsx"), "utf8");

describe("signup consent and mobile authentication access", () => {
  test("persists an opt-out marketing preference defaulting to opted in", () => {
    expect(schema).toMatch(/marketingOptIn\s+Boolean\s+@default\(true\)/);
    expect(registerRoute).toContain("marketingOptIn: z.boolean().optional().default(true)");
    expect(registerRoute).toContain("marketingOptIn,");
    expect(signupPage).toContain("marketingOptIn");
    expect(signupPage).toContain("Email me ScamDunk updates");
  });

  test("keeps the login link visible on mobile", () => {
    expect(header).toContain('href="/login"');
    expect(header).not.toContain('className="hidden text-[13px] font-medium text-foreground/70 hover:text-foreground md:inline-block"');
  });
});
