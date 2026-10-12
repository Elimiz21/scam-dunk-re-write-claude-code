import { createPublicKey, verify } from "crypto";
import { z } from "zod";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const address = z.union([phone, z.object({ phone_number: phone })]);
const inboundSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string(),
  direction: z.literal("inbound"),
  messaging_profile_id: z.string(),
  from: address,
  to: z.union([address, z.array(address).min(1)]),
  text: z.string().max(10000).optional(),
  // WhatsApp messages may also include the original channel-specific body.
  body: z.object({
    type: z.string(),
    text: z.object({ body: z.string().max(10000) }).optional(),
  }).optional(),
});

export function verifyTelnyxSignature(raw: Buffer, signature: string | null, timestamp: string | null): boolean {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) throw new Error("TELNYX_NOT_CONFIGURED");
  if (!signature || !timestamp || !/^\d{10}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = Buffer.from(publicKey, "base64");
    const sig = Buffer.from(signature, "base64");
    if (key.length !== 32 || sig.length !== 64) return false;
    const spki = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key]),
      format: "der", type: "spki",
    });
    return verify(null, Buffer.concat([Buffer.from(`${timestamp}|`), raw]), spki, sig);
  } catch { return false; }
}

export function parseTelnyxWhatsAppInbound(input: unknown) {
  const envelope = z.object({ data: z.object({ event_type: z.string(), payload: z.unknown() }) }).parse(input);
  if (envelope.data.event_type !== "message.received") return null;
  const channel = z.object({ type: z.string() }).parse(envelope.data.payload);
  if (channel.type.toUpperCase() !== "WHATSAPP") return null;
  const payload = inboundSchema.parse(envelope.data.payload);
  const numberOf = (value: z.infer<typeof address>) => typeof value === "string" ? value : value.phone_number;
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  if (payload.messaging_profile_id !== process.env.TELNYX_MESSAGING_PROFILE_ID ||
      !recipients.some(value => numberOf(value) === process.env.WHATSAPP_PHONE_NUMBER)) return null;
  const text = payload.body?.text?.body ?? payload.text;
  const messageType = payload.body?.type ?? (text !== undefined ? "text" : "unsupported");
  return { id: `telnyx:${payload.id}`, from: numberOf(payload.from), messageType,
    text: messageType === "text" ? text : undefined };
}

export async function postTelnyxWhatsAppMessage(body: { to: string; type: string; [key: string]: unknown }): Promise<string | null> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.WHATSAPP_PHONE_NUMBER;
  const profile = process.env.TELNYX_MESSAGING_PROFILE_ID;
  if (!apiKey || !from || !profile) throw new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED");
  const { to, ...message } = body;
  const recipient = to.startsWith("+") ? to : `+${to}`;
  if (!phone.safeParse(from).success || !phone.safeParse(recipient).success) {
    throw new Error("WHATSAPP_INVALID_PHONE");
  }
  // Telnyx requires a numeric component index; Meta accepts its string form.
  if (message.type === "template") {
    const template = message.template as { components: Array<{ index?: string; [key: string]: unknown }>; language: object };
    message.template = { ...template, language: { ...template.language, policy: "deterministic" },
      components: template.components.map(c => c.index === undefined ? c : { ...c, index: Number(c.index) }) };
  }
  const response = await fetch("https://api.telnyx.com/v2/messages/whatsapp", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipient, type: "WHATSAPP", messaging_profile_id: profile, whatsapp_message: message }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { errors?: Array<{ code?: string }> } | null;
    const code = failure?.errors?.[0]?.code;
    console.error("WhatsApp Telnyx send failed", { status: response.status,
      code: typeof code === "string" && /^\d{1,10}$/.test(code) ? code : null });
    throw new Error("WHATSAPP_PROVIDER_SEND_FAILED");
  }
  const result = await response.json() as { data?: { id?: string } };
  if (!result.data?.id) throw new Error("WHATSAPP_PROVIDER_SEND_FAILED");
  return result.data.id;
}
