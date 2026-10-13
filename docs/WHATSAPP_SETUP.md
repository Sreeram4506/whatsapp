# WhatsApp Cloud API setup

ConstituencyOS AI uses the official **Meta WhatsApp Business Platform (Cloud API)**. Until you complete this guide the product runs in **simulation mode**: the browser phone works, but replies are stored with status `SIMULATED` and nothing is sent to WhatsApp. Workspaces without credentials show *"Awaiting credentials"* in Settings, and any live-channel message is recorded as `NOT_CONFIGURED` — never as sent.

> Meta changes its documentation often. This guide reflects the docs as read in October 2026 (Graph API v26.0). Re-check the linked pages before go-live.
> Official docs: <https://developers.facebook.com/docs/whatsapp/cloud-api> · changelog: <https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog/>

## 1. Meta business prerequisites

1. A **Meta Business portfolio** (business.facebook.com). For production sending at scale and for a verified display name you need **business verification** (legal documents for the organisation). An MLA's office will usually operate through a registered entity or authorised party — confirm who the legal business owner is **before** you start.
2. A **Meta developer account** and an **app** of type *Business* with the **WhatsApp** product added (developers.facebook.com/apps).
3. A **phone number for the helpdesk** that is *not already registered* on a personal WhatsApp or WhatsApp Business app (or is deleted from it first). It must be able to receive an SMS/voice verification code. Use one number per MLA workspace.
4. Branding rule: do **not** use an MLA's name, photograph, logo or designation as the WhatsApp profile unless you hold their written permission (record the reference in the platform admin when creating the workspace).

## 2. Create credentials

In the Meta App Dashboard → **WhatsApp → API Setup**:

| Value | Where | Goes to |
|---|---|---|
| **Phone number ID** | API Setup page | Workspace Settings → *WhatsApp phone number ID* |
| **WhatsApp Business Account ID** | API Setup page | Workspace Settings → *Business Account ID* |
| **Permanent access token** | Business Settings → *System users* → create a system user → *Generate token* with `whatsapp_business_messaging` + `whatsapp_business_management` | **Server environment variable** (never the database/browser) |
| **App secret** | App settings → Basic → *App secret* | `WHATSAPP_APP_SECRET` |
| **Verify token** | any random string you invent | `WHATSAPP_VERIFY_TOKEN` and pasted in step 4 |

Temporary tokens from the API Setup page expire in about 24 hours — use a system-user token for anything beyond a quick test.

Set environment variables on the **API server** (see `server/.env.example`):

```bash
WHATSAPP_GRAPH_API_VERSION=v26.0
WHATSAPP_VERIFY_TOKEN=<random string>
WHATSAPP_APP_SECRET=<app secret>
WHATSAPP_ACCESS_TOKEN=<system-user token>      # default for all workspaces
# Multi-tenant: give each MLA its own token under its own env var name and enter that NAME
# (not the token) in Workspace Settings → "Access-token environment variable name", e.g.
# WHATSAPP_TOKEN_SEETHAPURAM=<token for that workspace's number>
```

Restart the API. In **Workspace Settings** (as Office Admin) enter the phone number ID, display number and (optionally) the token variable name, then **Save**. The integration card should change to *Live*.

## 3. Expose the webhook

Meta must reach `https://<your-api-host>/webhooks/whatsapp` over **public HTTPS**.

- Production: your deployed API URL (see [DEPLOYMENT.md](DEPLOYMENT.md)).
- Local testing: tunnel port 4000, e.g. `cloudflared tunnel --url http://localhost:4000` or `ngrok http 4000`. Use the tunnel URL only for testing.

## 4. Configure the webhook in Meta

App Dashboard → **WhatsApp → Configuration → Webhook**:

1. **Callback URL**: `https://<host>/webhooks/whatsapp`
2. **Verify token**: the same string as `WHATSAPP_VERIFY_TOKEN`.
3. Click **Verify and save**. The server answers Meta's `GET` handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`).
4. **Subscribe** to the **`messages`** field (this carries incoming messages *and* sent/delivered/read/failed statuses). Also subscribe to **`user_id_update`** if Meta offers it for your app (see BSUID below).

What the server does with each delivery:

- **Rejects** any POST whose `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret) is missing or wrong → `401`.
- **Deduplicates**: every message id / status event is recorded once in `WebhookEvent`; Meta's retries are acknowledged and ignored.
- Replies `200` immediately and processes asynchronously, so slow work never causes Meta to re-send.
- Looks up the workspace by `metadata.phone_number_id`; unknown numbers are logged and ignored.
- Downloads inbound photos/PDFs (`GET /{media-id}` then the temporary URL with the bearer token), validates size and **file signature**, stores them privately.
- Updates delivery status (`sent → delivered → read`, or `failed` with Meta's error code) and never downgrades a status if webhooks arrive out of order.

## 5. Message templates (messages outside the 24-hour window)

WhatsApp only allows free-form replies within **24 hours of the citizen's last message**. Office updates after that (e.g. "assigned", "resolved" days later) require an **approved template**.

1. WhatsApp Manager → **Message templates** → create a **Utility** template, one per language (Telugu and English), body with two variables, for example:
   `Update on your complaint {{1}}: {{2}}. Reply here or send "menu" for options.`
2. Wait for approval.
3. Set `WHATSAPP_TEMPLATE_STATUS_UPDATE=<template name>`, and `WHATSAPP_TEMPLATE_LANG_EN` / `WHATSAPP_TEMPLATE_LANG_TE` to the language codes you registered.

`{{1}}` = ticket number, `{{2}}` = status text / note. If no template is configured, an out-of-window update is recorded as **FAILED** ("outside the 24-hour window and no approved template") in *WhatsApp Delivery* so staff can follow up another way — it is never silently dropped.

## 6. Opt-in and opt-out

- The conversation starts when the citizen messages the helpdesk (user-initiated), and the privacy/consent step is recorded before any complaint is stored (`ConsentRecord`, with notice version).
- **STOP** (or *unsubscribe*) sets `optedOut`; later office updates are recorded as `SUPPRESSED`, not sent. **START** opts back in. Both are logged.
- Do not send marketing or political messages through this channel. Meta's commerce/business policies and this product's privacy rules both forbid it.

## 7. Usernames and BSUIDs

In 2026 WhatsApp began rolling out **usernames**. For users who adopt one, Meta may **omit their phone number** from webhooks and instead provide a business-scoped user ID (BSUID: `from_user_id` / `contacts[].user_id`). ConstituencyOS handles this:

- A sender with only a BSUID becomes a citizen keyed `bsuid:<id>`; the BSUID is stored and matched **before** the phone number.
- Replies to BSUID-only users use `"recipient": "<BSUID>"` and omit `to`, per Meta's documentation. (If both are sent, `to` wins.)
- If the same user later shares a phone number, the existing record is upgraded in place.
- A `user_id_update` webhook (BSUID rotation) swaps the stored ID so history stays attached.
- Staff see *"WhatsApp username user (no number shared)"* instead of a phone number.

Meta states these details are subject to change — re-read <https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/> before go-live. Public-tracking by last-4-digits is unavailable for BSUID-only users (they track via WhatsApp itself).

## 8. Production testing checklist

Run these with a real handset against the live number, then confirm in **WhatsApp Delivery** and the audit log:

- [ ] `GET` webhook verification succeeds in the Meta dashboard.
- [ ] Sending "Hi" returns the language buttons; picking a language shows the service list.
- [ ] A complete complaint (Telugu **and** English) creates a ticket; the citizen receives the confirmation.
- [ ] A photo and a PDF sent during the complaint appear on the case; an oversized or renamed non-image file is rejected politely.
- [ ] Sharing a location pin stores coordinates; skipping stores none.
- [ ] Assigning a case sends the "assigned" update; status moves to *delivered* then *read*.
- [ ] Marking resolved sends the confirm/not-solved buttons; both paths work (close with rating; reopen).
- [ ] STOP suppresses later updates; START restores them.
- [ ] After 24 hours of silence an update is sent through the approved template (or recorded FAILED if none).
- [ ] A POST with a bad signature returns 401; replaying the same webhook body creates no duplicate messages.
- [ ] A voice note gets the "voice not enabled" reply (or a transcript if STT is configured).
- [ ] Telugu text renders correctly on Android and iPhone.
- [ ] A user with a WhatsApp username (BSUID only) can complete a complaint.

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Verify-and-save fails | `WHATSAPP_VERIFY_TOKEN` differs, or the API is not reachable over HTTPS |
| Messages arrive but nothing happens | `WHATSAPP_APP_SECRET` wrong (signature check → 401 in logs), or the workspace's phone number ID doesn't match `metadata.phone_number_id` |
| Replies recorded `NOT_CONFIGURED` | No access token available for that workspace (check the env var name) |
| Replies recorded `FAILED` with a Meta code | Read the error in *WhatsApp Delivery* — common: expired token, number not registered/connected, outside 24h window, template not approved |
| Interactive list shows truncated titles | Meta limits: button 20 chars, list row title 24, row description 72 — the server truncates automatically |
