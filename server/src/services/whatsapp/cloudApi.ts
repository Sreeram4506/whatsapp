import { config } from "../../config";
import { logger } from "../../lib/logger";
import type { OutboundContent } from "./types";

/**
 * Meta WhatsApp Business Platform — Cloud API client.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const LIMITS = { body: 1024, text: 4096, button: 20, rowTitle: 24, rowDesc: 72, sectionTitle: 24, footer: 60 };

const cut = (s: string, n: number) => {
  const chars = Array.from(s);
  return chars.length <= n ? s : chars.slice(0, n - 1).join("") + "…";
};

export interface TenantWhatsAppCreds {
  phoneNumberId: string;
  accessToken: string;
}

export function credsForTenant(t: { whatsappPhoneNumberId: string | null; whatsappTokenEnvKey: string | null }) {
  if (!t.whatsappPhoneNumberId) return null;
  const token = (t.whatsappTokenEnvKey ? process.env[t.whatsappTokenEnvKey] : "") || config.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  return { phoneNumberId: t.whatsappPhoneNumberId, accessToken: token } satisfies TenantWhatsAppCreds;
}

export const BSUID_PREFIX = "bsuid:";

/**
 * Cloud API addressing: a phone number goes in `to`; a business-scoped user ID (users who adopted a
 * WhatsApp username and whose number is not shared) goes in `recipient` with `to` omitted.
 */
export function addressee(identity: string): { to: string } | { recipient: string } {
  return identity.startsWith(BSUID_PREFIX) ? { recipient: identity.slice(BSUID_PREFIX.length) } : { to: identity };
}

/** Builds the exact JSON body for POST /{phone-number-id}/messages */
export function toCloudPayload(to: string, c: OutboundContent): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", ...addressee(to) };
  if (c.kind === "text") return { ...base, type: "text", text: { preview_url: false, body: cut(c.body, LIMITS.text) } };
  if (c.kind === "buttons") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: cut(c.body, LIMITS.body) },
        ...(c.footer ? { footer: { text: cut(c.footer, LIMITS.footer) } } : {}),
        action: {
          buttons: c.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: cut(b.title, LIMITS.button) } })),
        },
      },
    };
  }
  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: cut(c.body, LIMITS.body) },
      ...(c.footer ? { footer: { text: cut(c.footer, LIMITS.footer) } } : {}),
      action: {
        button: cut(c.button, LIMITS.button),
        sections: c.sections.map((s) => ({
          title: cut(s.title, LIMITS.sectionTitle),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: cut(r.title, LIMITS.rowTitle),
            ...(r.description ? { description: cut(r.description, LIMITS.rowDesc) } : {}),
          })),
        })),
      },
    },
  };
}

export function templatePayload(to: string, name: string, languageCode: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    ...addressee(to),
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: cut(text, 300) })) }],
    },
  };
}

export interface SendResult {
  ok: boolean;
  wamid?: string;
  error?: string;
  attempts: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends with bounded retries for transient failures (network, 429, 5xx). Never throws. */
export async function sendCloudMessage(
  creds: TenantWhatsAppCreds,
  payload: Record<string, unknown>,
  maxAttempts = 3,
): Promise<SendResult> {
  const url = `${config.WHATSAPP_GRAPH_BASE_URL}/${config.WHATSAPP_GRAPH_API_VERSION}/${creds.phoneNumberId}/messages`;
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${creds.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      };
      if (res.ok && data.messages?.[0]?.id) return { ok: true, wamid: data.messages[0].id, attempts: attempt };
      lastError = `HTTP ${res.status}${data.error ? `: ${data.error.code ?? ""} ${data.error.message ?? ""}` : ""}`.trim();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) break;
    } catch (err) {
      lastError = `Network error: ${(err as Error).message}`;
    }
    if (attempt < maxAttempts) await sleep(config.isTest ? 5 : 400 * 3 ** (attempt - 1));
  }
  logger.warn({ error: lastError }, "WhatsApp send failed");
  return { ok: false, error: lastError, attempts: maxAttempts };
}

export async function markAsRead(creds: TenantWhatsAppCreds, wamid: string) {
  const url = `${config.WHATSAPP_GRAPH_BASE_URL}/${config.WHATSAPP_GRAPH_API_VERSION}/${creds.phoneNumberId}/messages`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${creds.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    /* read receipts are best-effort */
  }
}

/** Downloads inbound media: GET /{media-id} → temporary URL → binary (both require the bearer token). */
export async function downloadMedia(creds: TenantWhatsAppCreds, mediaId: string) {
  const meta = await fetch(`${config.WHATSAPP_GRAPH_BASE_URL}/${config.WHATSAPP_GRAPH_API_VERSION}/${mediaId}`, {
    headers: { authorization: `Bearer ${creds.accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!meta.ok) throw new Error(`Media lookup failed: HTTP ${meta.status}`);
  const info = (await meta.json()) as { url: string; mime_type: string; file_size?: number };
  if (info.file_size && info.file_size > config.MAX_UPLOAD_MB * 1024 * 1024) throw new Error("File too large");
  const bin = await fetch(info.url, {
    headers: { authorization: `Bearer ${creds.accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!bin.ok) throw new Error(`Media download failed: HTTP ${bin.status}`);
  return { buffer: Buffer.from(await bin.arrayBuffer()), mimeType: info.mime_type };
}
