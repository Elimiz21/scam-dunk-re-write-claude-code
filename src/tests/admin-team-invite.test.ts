jest.mock("@/lib/admin/auth", () => ({
  getAdminSession: jest.fn(),
  createAdminInvite: jest.fn(),
  acceptAdminInvite: jest.fn(),
}));
jest.mock("@/lib/email", () => ({ sendAdminInviteEmail: jest.fn() }));

import { NextRequest } from "next/server";
import { PUT } from "@/app/api/admin/team/invite/route";
import { acceptAdminInvite } from "@/lib/admin/auth";

describe("admin invite acceptance", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the invited email after saving the account so the invitee can sign in", async () => {
    (acceptAdminInvite as jest.Mock).mockResolvedValue({
      success: true,
      email: "teammate@example.com",
    });
    const request = new NextRequest("https://scamdunk.com/api/admin/team/invite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "valid-invite-token",
        name: "Team Member",
        password: "correct horse battery",
      }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      email: "teammate@example.com",
    });
    expect(acceptAdminInvite).toHaveBeenCalledWith(
      "valid-invite-token",
      "Team Member",
      "correct horse battery",
    );
  });
});
