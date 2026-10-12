# Telnyx WhatsApp routing

The production number is connected through Telnyx. On 2026-10-12, its message
records confirmed a real inbound WhatsApp message at 09:58 UTC. Both its messaging
profile and WABA had blank webhook URLs; no real inbound reached the Meta-only
ScamDunk endpoint. Direct Meta sends were rejected with code 10/subcode 2593181.

This adapter is opt-in. Existing Meta configuration remains the default.
No dashboard design, Google login, Telegram, database schema, or scoring changes.

## Activation

Keep the legacy TELNYX_API_KEY and TELNYX_PUBLIC_KEY variables unchanged.
The dedicated WhatsApp variables take priority; legacy names remain fallback-compatible.
Set these variables in the intended Vercel environment, using secret storage:

- `WHATSAPP_PROVIDER=telnyx`
- `TELNYX_WHATSAPP_API_KEY`: dedicated authorized server-side Telnyx API key (secret)
- `TELNYX_WHATSAPP_PUBLIC_KEY`: account Ed25519 verification public key
- `TELNYX_MESSAGING_PROFILE_ID=4001a058-31a7-49c2-84f2-2c8ad67b3a73`
- `WHATSAPP_PHONE_NUMBER=+17693909406`

Retain `WHATSAPP_VERIFICATION_TEMPLATE=scamdunk_verify`, the encryption key,
and the identity hashing key. Retain the Meta credentials for rollback.

After the adapter is deployed and configured, set the **ScamDunk WhatsApp**
messaging profile's inbound webhook to:
`https://scamdunk.com/api/webhooks/whatsapp/telnyx`.
Do not point Telnyx at the Meta endpoint. No failover URL is required.
WABA account lifecycle subscriptions are separate from message delivery.

The endpoint verifies Ed25519 signatures and a five-minute timestamp tolerance,
filters by WhatsApp channel, production destination, and profile, then persists
an encrypted inbound event before acknowledging it. `waitUntil` runs the existing
scan processor after the response. Existing cron recovery handles interrupted work.
Provider message IDs deduplicate retries. SMS, the test number, outbound echoes,
and delivery status events cannot initiate scans.

## Live validation still required

1. Confirm the verification template is approved in Telnyx.
2. Verify a real inbound reaches the endpoint and receives HTTP 200 promptly.
3. Link the signed-in Pro account using its verification code.
4. Send AAPL and verify one scan/reply and one quota debit.
5. Confirm provider delivery status; API acceptance alone is not delivery.

Rollback: clear the new Telnyx profile webhook and restore `WHATSAPP_PROVIDER=meta`
(or unset it), then redeploy. This restores the old configuration, whose direct
Meta permission error remains unresolved; it does not claim working Meta delivery.

References: Telnyx official WhatsApp send endpoint and messaging webhook docs:
https://developers.telnyx.com/api-reference/whatsapp-messaging/send-a-whatsapp-message
https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks
