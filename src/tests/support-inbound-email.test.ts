jest.mock("@/lib/db", () => ({ prisma: {
  supportTicket: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  supportTicketResponse: { create: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock("@/lib/email", () => ({ sendSupportTicketNotification: jest.fn(), sendSupportTicketConfirmation: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({ rateLimit: jest.fn(async () => ({ success: true, headers: {} })), rateLimitExceededResponse: jest.fn() }));
const mockGetEmail = jest.fn();
jest.mock("resend", () => {
  const actual = jest.requireActual("resend");
  return { Resend: jest.fn((key) => {
    const client = new actual.Resend(key);
    client.emails.receiving.get = mockGetEmail;
    return client;
  }) };
});

import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendSupportTicketNotification } from "@/lib/email";

const signingKey = Buffer.from("a-test-webhook-secret").toString("base64");
process.env.RESEND_INBOUND_WEBHOOK_SECRET = `whsec_${signingKey}`;
process.env.RESEND_API_KEY = "test-key";
process.env.INBOUND_EMAIL_WEBHOOK_SECRET = "legacy-key";
const { POST } = require("@/app/api/inbound-email/route");
const ticket = { id: "ticket-1", email: "customer@example.com", subject: "Help needed", category: "SUPPORT", status: "RESOLVED", priority: "NORMAL" };

function request(payload: unknown, valid = true) {
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", Buffer.from(signingKey, "base64")).update(`event-1.${timestamp}.${raw}`).digest("base64");
  return new NextRequest("https://scamdunk.com/api/inbound-email", { method: "POST", headers: {
    "content-type": "application/json", "svix-id": "event-1", "svix-timestamp": timestamp, "svix-signature": `v1,${valid ? signature : "invalid"}`,
  }, body: raw });
}

describe("inbound support replies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn(prisma));
    (prisma.supportTicket.findFirst as jest.Mock).mockImplementation(async ({where}) => {
      const sameEmail = typeof where.email === "object" ? where.email.equals === ticket.email : where.email === ticket.email;
      return sameEmail && (where.id === ticket.id || where.subject === ticket.subject) ? ticket : null;
    });
    (prisma.supportTicket.create as jest.Mock).mockImplementation(async ({data}) => ({ id: "new-ticket", ...data }));
    (sendSupportTicketNotification as jest.Mock).mockResolvedValue(true);
    mockGetEmail.mockResolvedValue({ data: { from: "Customer <customer@example.com>", to: ["support@inbound.scamdunk.com"], subject: "Re: [Ticket ticket-1] Help needed", text: "I tried again and it still fails.", html: null }, error: null });
  });

  it("verifies a real signed Resend event, retrieves its body, appends the user reply, and notifies support", async () => {
    const response = await POST(request({ type: "email.received", data: { email_id: "received-1" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ticketId: "ticket-1", isReply: true });
    expect(prisma.supportTicketResponse.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ticketId: "ticket-1", isFromAdmin: false, message: "I tried again and it still fails.", responderEmail: "customer@example.com" }) });
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: {id: "ticket-1"}, data: expect.objectContaining({ status: "OPEN", resolvedAt: null, closedAt: null }) });
    expect(sendSupportTicketNotification).toHaveBeenCalledWith("ticket-1", "Customer", "customer@example.com", "Help needed", "I tried again and it still fails.", "SUPPORT", "reply");
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature without retrieving or storing email", async () => {
    const response = await POST(request({ type: "email.received", data: { email_id: "received-1" } }, false));
    expect(response.status).toBe(401);
    expect(mockGetEmail).not.toHaveBeenCalled();
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it("does not append to another customer's ticket even if the subject contains its ID", async () => {
    mockGetEmail.mockResolvedValue({ data: { from: "Other <other@example.com>", to: ["support@inbound.scamdunk.com"], subject: "Re: [Ticket ticket-1] Help needed", text: "My own different support question" }, error: null });
    const response = await POST(request({ type: "email.received", data: { email_id: "received-2" } }));
    expect(response.status).toBe(201);
    expect(prisma.supportTicketResponse.create).not.toHaveBeenCalled();
    expect(prisma.supportTicket.create).toHaveBeenCalled();
  });

  it("matches replies to old emails by subject and sender", async () => {
    mockGetEmail.mockResolvedValue({ data: { from: "Customer <customer@example.com>", to: ["support@inbound.scamdunk.com"], subject: "Re: Help needed", text: "Here is my follow-up answer" }, error: null });
    const response = await POST(request({ type: "email.received", data: { email_id: "received-3" } }));
    expect(await response.json()).toMatchObject({ticketId: "ticket-1", isReply: true});
  });

  it("ignores received mail addressed outside the support inbox", async () => {
    mockGetEmail.mockResolvedValue({ data: { from: "Customer <customer@example.com>", to: ["private@unrelated.example"], subject: "Private mail", text: "This is not a support request" }, error: null });
    const response = await POST(request({ type: "email.received", data: { email_id: "received-4" } }));
    expect(response.status).toBe(200);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(sendSupportTicketNotification).not.toHaveBeenCalled();
  });

  it("returns a retryable error if Resend cannot retrieve the message", async () => {
    mockGetEmail.mockResolvedValue({ data: null, error: {message: "Provider unavailable"} });
    const response = await POST(request({ type: "email.received", data: { email_id: "received-5" } }));
    expect(response.status).toBe(503);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it("does not duplicate a user reply or send another alert when Resend retries the same email", async () => {
    (prisma.supportTicketResponse.create as jest.Mock).mockRejectedValueOnce({ code: "P2002" });
    const response = await POST(request({ type: "email.received", data: { email_id: "received-1" } }));
    expect(await response.json()).toMatchObject({success: true, ticketId: "ticket-1", duplicate: true});
    expect(sendSupportTicketNotification).not.toHaveBeenCalled();
  });

  it("keeps authenticated forwarding compatible for existing integrations", async () => {
    const response = await POST(new NextRequest("https://scamdunk.com/api/inbound-email", {
      method: "POST", headers: {"content-type": "application/json", authorization: "Bearer legacy-key"},
      body: JSON.stringify({from: "Customer <customer@example.com>", subject: "Re: Help needed", text: "Here is another follow-up"}),
    }));
    expect(await response.json()).toMatchObject({ticketId: "ticket-1", isReply: true});
  });
});
