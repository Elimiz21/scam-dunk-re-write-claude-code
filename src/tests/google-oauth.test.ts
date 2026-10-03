import type { NextAuthConfig } from "next-auth";
const mockBaseAdapter = { linkAccount: jest.fn() };
const mockPrisma = { user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
let mockConfig: NextAuthConfig;
jest.mock("next-auth", () => ({
  __esModule: true,
  default: (config: NextAuthConfig) => { mockConfig = config; return {}; },
  CredentialsSignin: class extends Error {},
}));
jest.mock("next-auth/providers/google", () => ({ __esModule: true, default: (config: object) => ({ id: "google", ...config }) }));
jest.mock("next-auth/providers/credentials", () => ({ __esModule: true, default: (config: object) => ({ id: "credentials", ...config }) }));
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => mockBaseAdapter }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth-funnel", () => ({ recordAuthFunnelEvent: jest.fn() }));
jest.mock("@/lib/auth-error-tracking", () => ({ logAuthError: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({ rateLimit: jest.fn() }));
jest.mock("@/lib/auth-user", () => ({ findCredentialsUser: jest.fn() }));
import { recordAuthFunnelEvent } from "@/lib/auth-funnel";

describe("Google OAuth integration", () => {
  beforeAll(() => {
    process.env.AUTH_GOOGLE_ID = "local-client"; process.env.AUTH_GOOGLE_SECRET = "local-secret";
    require("@/lib/auth");
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ plan: "PAID", sessionVersion: 4, deletedAt: null });
  });
  it("registers Google alongside credentials without unsafe email auto-linking", () => {
    expect(mockConfig.providers).toEqual(expect.arrayContaining([expect.objectContaining({ id: "google", allowDangerousEmailAccountLinking: false }), expect.objectContaining({ id: "credentials" })]));
  });
  it("denies unverified profiles and deleted users", async () => {
    const signIn = mockConfig.callbacks!.signIn!;
    const params = { user: { id: "user", email: "person@example.test" }, account: { provider: "google" }, profile: { email: "person@example.test", email_verified: false } };
    expect(await signIn(params as never)).toBe(false);
    params.profile.email_verified = true;
    expect(await signIn(params as never)).toBe(true);
    mockPrisma.user.findUnique.mockResolvedValue({ deletedAt: new Date() });
    expect(await signIn(params as never)).toBe(false);
  });
  it("does not persist Google tokens", async () => {
    await mockConfig.adapter!.linkAccount!({ provider: "google", type: "oidc", userId: "user", providerAccountId: "subject", access_token: "secret-access", refresh_token: "secret-refresh", id_token: "secret-id" });
    expect(mockBaseAdapter.linkAccount).toHaveBeenCalledWith({ provider: "google", type: "oidc", userId: "user", providerAccountId: "subject" });
  });
  it("creates a verified, normalized account without marketing consent", async () => {
    mockPrisma.user.create.mockResolvedValue({ id: "new-user", email: "person@example.test", plan: "FREE" });
    await mockConfig.adapter!.createUser!({ id: "provider-profile-id", email: "Person@Example.Test", emailVerified: null } as never);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({ data: { email: "person@example.test", emailVerified: expect.any(Date), marketingOptIn: false } });
  });
  it("hydrates paid plans and the current session version on OAuth login", async () => {
    const result = await mockConfig.callbacks!.jwt!({ token: {}, user: { id: "user" }, trigger: "signIn" } as never);
    expect(result).toMatchObject({ id: "user", plan: "PAID", sessionVersion: 4 });
  });
  it("still revokes prior JWT sessions after a credential change", async () => {
    expect(await mockConfig.callbacks!.jwt!({ token: { id: "user", sessionVersion: 3 } } as never)).toBeNull();
  });
  it("verifies Google email and records the successful login", async () => {
    await mockConfig.events!.signIn!({ user: { id: "user" }, account: { provider: "google" } } as never);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user" }, data: { emailVerified: expect.any(Date) } });
    expect(recordAuthFunnelEvent).toHaveBeenCalledWith({ userId: "user", eventType: "LOGIN_SUCCESS", method: "google" });
  });
});
