import { NextRequest } from "next/server";
const mockSession = jest.fn(), mockAuth = jest.fn(), mockMobile = jest.fn();
const mockCompare = jest.fn(), mockHash = jest.fn(), mockIngest = jest.fn();
const mockDb = {
  user: { findUnique: jest.fn(), updateMany: jest.fn() },
  adminUser: { findUnique: jest.fn(), updateMany: jest.fn() },
  adminSession: { deleteMany: jest.fn() },
  adminAuditLog: { create: jest.fn() }, $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ prisma: mockDb }));
jest.mock("@/lib/auth", () => ({ auth: mockAuth }));
jest.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: mockMobile }));
jest.mock("bcryptjs", () => ({ compare: mockCompare, hash: mockHash }));
jest.mock("@/lib/admin/auth", () => ({ getAdminSession: mockSession, requireAdminAuth: mockSession, verifyPassword: mockCompare, hashPassword: mockHash }));
jest.mock("@/lib/server/ingestion-safety", () => ({ verifyIngestionTarget: () => ({ ok: true }) }));
jest.mock("@/lib/admin/ingest-evaluation-core", () => ({ ingestDate: mockIngest }));
jest.mock("@/lib/server/evaluation-storage", () => ({ getEvaluationStorageServerClient: jest.fn() }));
import { POST as preview } from "@/app/api/admin/auth/preview-login/route";
import { PUT as customerPassword } from "@/app/api/user/profile/route";
import { POST as adminPassword } from "@/app/api/admin/auth/change-password/route";
import { POST as ingest } from "@/app/api/admin/ingest-evaluation/route";
import { POST as socialIngest } from "@/app/api/admin/social-scan/ingest/route";
const request = (body: unknown = {}) => new NextRequest("http://localhost/test", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  jest.clearAllMocks();
  mockDb.$transaction.mockImplementation((fn) => fn(mockDb));
  mockSession.mockResolvedValue({ id: "admin", role: "OWNER" });
  mockAuth.mockResolvedValue({ user: { id: "customer" } });
  mockDb.user.findUnique.mockResolvedValue({ id: "customer", hashedPassword: "old-hash" });
  mockDb.adminUser.findUnique.mockResolvedValue({ id: "admin", hashedPassword: "old-hash" });
  mockCompare.mockResolvedValue(true); mockHash.mockResolvedValue("new-hash");
  mockDb.user.updateMany.mockResolvedValue({ count: 1 });
  mockDb.adminUser.updateMany.mockResolvedValue({ count: 1 });
});
test("retired preview shortcut has no account/session side effects", async () => {
  expect((await preview()).status).toBe(410);
  expect(mockDb.adminUser.findUnique).not.toHaveBeenCalled();
  expect(mockDb.$transaction).not.toHaveBeenCalled();
});
test.each(["web", "mobile"])("customer %s credential mutation advances revocation generation atomically", async (channel) => {
  if (channel === "mobile") { mockAuth.mockResolvedValue(null); mockMobile.mockResolvedValue("customer"); }
  const response = await customerPassword(request({ currentPassword: "OldPassword!42", newPassword: "NewPassword!42" }));
  expect(response.status).toBe(200);
  expect(mockDb.user.updateMany).toHaveBeenCalledWith({ where: { id: "customer", hashedPassword: "old-hash" }, data: { hashedPassword: "new-hash", sessionVersion: { increment: 1 } } });
  expect(await response.json()).toMatchObject({ requiresReauthentication: true });
});
test("incorrect customer credentials cannot advance generation", async () => {
  mockCompare.mockResolvedValue(false);
  expect((await customerPassword(request({ currentPassword: "wrong", newPassword: "NewPassword!42" }))).status).toBe(400);
  expect(mockDb.user.updateMany).not.toHaveBeenCalled();
});
test("admin credential mutation revokes all sessions in the same transaction", async () => {
  expect((await adminPassword(request({ currentPassword: "OldPassword!42", newPassword: "NewPassword!42" }))).status).toBe(200);
  expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  expect(mockDb.adminUser.updateMany).toHaveBeenCalledWith({ where: { id: "admin", hashedPassword: "old-hash" }, data: { hashedPassword: "new-hash" } });
  expect(mockDb.adminSession.deleteMany).toHaveBeenCalledWith({ where: { adminUserId: "admin" } });
});
test.each(["VIEWER", "unknown", "", "owner"])("%s cannot publish market or social results", async (role) => {
  mockSession.mockResolvedValue({ id: "admin", role });
  expect((await ingest(request())).status).toBe(403);
  expect((await socialIngest(request())).status).toBe(403);
  expect(mockIngest).not.toHaveBeenCalled();
});
test.each(["OWNER", "ADMIN"])("%s can publish an evaluation", async (role) => {
  mockSession.mockResolvedValue({ id: "admin", role }); mockIngest.mockResolvedValue({ success: true });
  expect((await ingest(request({ date: "2026-10-23" }))).status).toBe(200);
  expect(mockIngest).toHaveBeenCalledWith("2026-10-23");
});
test("anonymous publication remains unauthorized", async () => {
  mockSession.mockResolvedValue(null);
  expect((await ingest(request())).status).toBe(401);
  expect(mockIngest).not.toHaveBeenCalled();
});
test.each(["customer", "admin"])("an in-flight %s password change cannot overwrite recovered credentials", async (kind) => {
  const table = kind === "customer" ? mockDb.user : mockDb.adminUser;
  let storedHash = "old-hash";
  mockHash.mockImplementationOnce(async () => { storedHash = "recovered-hash"; return "attacker-hash"; });
  table.updateMany.mockImplementationOnce(async ({ where }) => ({ count: where.hashedPassword === storedHash ? 1 : 0 }));
  const handler = kind === "customer" ? customerPassword : adminPassword;
  expect((await handler(request({ currentPassword: "OldPassword!42", newPassword: "NewPassword!42" }))).status).toBe(409);
  expect(storedHash).toBe("recovered-hash");
  expect(mockDb.adminSession.deleteMany).not.toHaveBeenCalled();
});
