type WhatsAppProviderResponse = { messages?: Array<{ id?: string }> };

/**
 * True only when every env var the WhatsApp pipeline needs is present —
 * provider credentials, webhook secrets, and storage keys. Surfaces the
 * feature as "coming soon" everywhere until the Meta setup is complete.
 */
export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_VERIFICATION_TEMPLATE &&
      process.env.WHATSAPP_ENCRYPTION_KEY &&
      process.env.WHATSAPP_IDENTITY_HASH_KEY &&
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_VERIFY_TOKEN,
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

async function postMessage(body: object): Promise<string | null> {
  const { accessToken, phoneNumberId } = providerConfig();
  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    },
  );
  if (!response.ok) throw new Error("WHATSAPP_PROVIDER_SEND_FAILED");
  const data = (await response.json()) as WhatsAppProviderResponse;
  return data.messages?.[0]?.id ?? null;
}

/** The configured Meta authentication template must have one body variable: code. */
export async function sendWhatsAppVerificationCode(
  phoneNumber: string,
  code: string,
): Promise<string | null> {
  const { templateName } = providerConfig();
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
