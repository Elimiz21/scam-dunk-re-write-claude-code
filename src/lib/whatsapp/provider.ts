type WhatsAppProviderResponse = { messages?: Array<{ id?: string }> };

/**
 * True only when every env var the WhatsApp pipeline needs is present —
 * provider credentials, webhook secrets, and storage keys. Surfaces the
 * feature as "coming soon" until the selected transport is configured.
 */
export function isWhatsAppConfigured(): boolean {
  const transportReady = process.env.WHATSAPP_PROVIDER === "telnyx"
    ? Boolean((process.env.TELNYX_WHATSAPP_API_KEY || process.env.TELNYX_API_KEY) &&
        (process.env.TELNYX_WHATSAPP_PUBLIC_KEY || process.env.TELNYX_PUBLIC_KEY) &&
        process.env.TELNYX_MESSAGING_PROFILE_ID && process.env.WHATSAPP_PHONE_NUMBER)
    : (!process.env.WHATSAPP_PROVIDER || process.env.WHATSAPP_PROVIDER === "meta") &&
      Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
  return Boolean(
    transportReady &&
      process.env.WHATSAPP_VERIFICATION_TEMPLATE &&
      process.env.WHATSAPP_ENCRYPTION_KEY &&
      process.env.WHATSAPP_IDENTITY_HASH_KEY,
  );
}

function providerConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_VERIFICATION_TEMPLATE;
  if (!accessToken || !phoneNumberId || !templateName) {
    throw new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED");
  }
  return { accessToken, phoneNumberId, templateName };
}

async function postMessage(body: { to: string; type: string; [key: string]: unknown }): Promise<string | null> {
  if (process.env.WHATSAPP_PROVIDER === "telnyx") {
    const { postTelnyxWhatsAppMessage } = await import("./telnyx");
    return postTelnyxWhatsAppMessage(body);
  }
  if (process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER !== "meta") {
    throw new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED");
  }
  const { accessToken, phoneNumberId } = providerConfig();
  const response = await fetch(
    `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    },
  );
  if (!response.ok) {
    // Meta's description can contain request data. Log only diagnostic codes.
    const failure = (await response.json().catch(() => null)) as {
      error?: { code?: number; error_subcode?: number };
    } | null;
    console.error("WhatsApp provider send failed", {
      status: response.status,
      code: failure?.error?.code ?? null,
      subcode: failure?.error?.error_subcode ?? null,
    });
    throw new Error("WHATSAPP_PROVIDER_SEND_FAILED");
  }
  const data = (await response.json()) as WhatsAppProviderResponse;
  return data.messages?.[0]?.id ?? null;
}

/** Meta's copy-code authentication template requires the same OTP in body and button. */
export async function sendWhatsAppVerificationCode(
  phoneNumber: string,
  code: string,
): Promise<string | null> {
  const templateName = process.env.WHATSAPP_VERIFICATION_TEMPLATE;
  if (!templateName) throw new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED");
  return postMessage({
    to: phoneNumber.slice(1),
    type: "template",
    template: {
      name: templateName,
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  });
}

export async function sendWhatsAppTextReply(
  recipientWaId: string,
  body: string,
): Promise<string | null> {
  return postMessage({
    to: recipientWaId,
    type: "text",
    text: { preview_url: false, body },
  });
}
