import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const register = readFileSync(
  join(process.cwd(), "src/app/api/auth/register/route.ts"),
  "utf8",
);
const verify = readFileSync(
  join(process.cwd(), "src/app/api/auth/verify-email/route.ts"),
  "utf8",
);
const auth = readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf8");
const mobileLogin = readFileSync(
  join(process.cwd(), "src/app/api/auth/mobile/login/route.ts"),
  "utf8",
);
const mobileRegister = readFileSync(
  join(process.cwd(), "src/app/api/auth/mobile/register/route.ts"),
  "utf8",
);

describe("server-side auth funnel measurement", () => {
  test("defines a user-linked event ledger with query indexes", () => {
    expect(schema).toContain("model AuthFunnelEvent");
    expect(schema).toMatch(/authFunnelEvents\s+AuthFunnelEvent\[\]/);
    expect(schema).toContain("@@index([userId, eventType, occurredAt])");
    expect(schema).toContain("@@index([eventType, occurredAt])");
  });

  test("records authoritative signup and verification events", () => {
    expect(register).toContain('eventType: "SIGNUP_COMPLETED"');
    expect(mobileRegister).toContain('eventType: "SIGNUP_COMPLETED"');
    expect(verify).toContain('eventType: "EMAIL_VERIFIED"');
  });

  test("records successful web and mobile logins", () => {
    expect(auth).toContain('eventType: "LOGIN_SUCCESS"');
    expect(mobileLogin).toContain('eventType: "LOGIN_SUCCESS"');
  });
});
