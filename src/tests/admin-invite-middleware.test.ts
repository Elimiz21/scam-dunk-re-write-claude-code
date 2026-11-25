jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({ auth: jest.fn() }),
}));
jest.mock("@/lib/auth.config", () => ({ authConfig: {} }));
jest.mock("jose", () => ({ jwtVerify: jest.fn() }));
jest.mock("next/server", () => ({
  NextResponse: {
    next: () => ({ status: 200 }),
    json: (body: unknown, options: { status: number }) => ({ body, status: options.status }),
  },
}));

import middleware from "../middleware";
import type { NextRequest } from "next/server";

function request(method: string, pathname: string, ip = method + pathname): NextRequest {
  return {
    method,
    nextUrl: { pathname },
    headers: { get: (key: string) => key === "x-real-ip" ? ip : null },
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}

describe("admin invitation middleware without a session", () => {
  it("allows PUT acceptance to reach the invitation-token validator", async () => {
    expect((await middleware(request("PUT", "/api/admin/team/invite"))).status).toBe(200);
  });

  it.each(["GET", "POST", "PATCH", "DELETE"])("still rejects anonymous %s invitation management", async (method) => {
    expect((await middleware(request(method, "/api/admin/team/invite"))).status).toBe(401);
  });

  it.each(["/api/admin/team/invite/extra", "/api/admin/team", "/api/admin/users"])(
    "does not expose %s through the acceptance exception",
    async (path) => {
      expect((await middleware(request("PUT", path))).status).toBe(401);
    },
  );

  it("still rate limits anonymous acceptance attempts", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await middleware(request("PUT", "/api/admin/team/invite", "invite-limit-test"))).status).toBe(200);
    }
    expect((await middleware(request("PUT", "/api/admin/team/invite", "invite-limit-test"))).status).toBe(429);
  });
});
