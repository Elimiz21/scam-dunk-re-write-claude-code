import { sendWhatsAppVerificationCode } from "@/lib/whatsapp/provider";

describe("WhatsApp copy-code verification delivery", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WHATSAPP_ACCESS_TOKEN: "test-token",
      WHATSAPP_PHONE_NUMBER_ID: "1264374606761416",
      WHATSAPP_VERIFICATION_TEMPLATE: "scamdunk_verify",
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("sends the same OTP in the body and copy-code button on a supported Graph version", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "message-id" }] }),
    });

    await expect(sendWhatsAppVerificationCode("+972504975755", "123456"))
      .resolves.toBe("message-id");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v26.0/1264374606761416/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: "972504975755",
          type: "template",
          template: {
            name: "scamdunk_verify",
            language: { code: "en_US" },
            components: [
              { type: "body", parameters: [{ type: "text", text: "123456" }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
            ],
          },
        }),
      }),
    );
  });

  it("logs provider status and numeric codes without its message or recipient", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 132000, error_subcode: 2494073, message: "private recipient and code" },
      }),
    });

    await expect(sendWhatsAppVerificationCode("+972504975755", "123456"))
      .rejects.toThrow("WHATSAPP_PROVIDER_SEND_FAILED");
    expect(log).toHaveBeenCalledWith("WhatsApp provider send failed", {
      status: 400,
      code: 132000,
      subcode: 2494073,
    });
  });
});
