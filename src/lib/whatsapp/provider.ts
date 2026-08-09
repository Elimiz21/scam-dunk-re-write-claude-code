type WhatsAppProviderResponse = { messages?: Array<{ id?: string }> };

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
