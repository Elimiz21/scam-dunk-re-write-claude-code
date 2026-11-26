const mockSend = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send: mockSend } })) }));
jest.mock("@/lib/admin/metrics", () => ({ logApiUsage: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: {
  supportEmailRecipient: { findMany: jest.fn() },
  emailLog: { create: jest.fn() },
} }));

import { prisma } from "@/lib/db";
import { sendSupportTicketNotification, sendSupportTicketResponse } from "@/lib/email";

describe("support email notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "test-key";
    process.env.SUPPORT_REPLY_EMAIL = "support@inbound.scamdunk.com";
    mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
    (prisma.supportEmailRecipient.findMany as jest.Mock).mockResolvedValue([
      { email: "existing@example.com", isPrimary: true, categories: null },
      { email: "elimizroch@gmail.com", isPrimary: false, categories: "[]" },
      { email: "billing@example.com", isPrimary: false, categories: '["BILLING"]' },
    ]);
  });

  it("delivers every category to an active recipient with an empty category list", async () => {
    expect(await sendSupportTicketNotification("ticket-1", "Customer", "customer@example.com", "Help needed", "Please help with this issue", "SUPPORT")).toBe(true);
    expect(mockSend.mock.calls[0][0].to).toEqual(["existing@example.com", "elimizroch@gmail.com"]);
  });

  it("labels user replies distinctly and escapes their content", async () => {
    await sendSupportTicketNotification("ticket-1", "Customer", "customer@example.com", "Help needed", "<script>bad()</script>", "SUPPORT", "reply");
    const payload = mockSend.mock.calls[0][0];
    expect(payload.subject).toBe("[Support Reply] Help needed");
    expect(payload.html).toContain("New User Reply Received");
    expect(payload.html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(payload.html).not.toContain("<script>");
  });

  it("gives customer replies a ticket reference and the working inbound reply address", async () => {
    await sendSupportTicketResponse("ticket-1", "Customer", "customer@example.com", "Help needed", "Try again please", "Support");
    const payload = mockSend.mock.calls[0][0];
    expect(payload.replyTo).toBe("support@inbound.scamdunk.com");
    expect(payload.subject).toBe("Re: [Ticket ticket-1] Help needed");
  });
});
