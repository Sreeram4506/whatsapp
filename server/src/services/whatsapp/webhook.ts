import crypto from "node:crypto";
import { config } from "../../config";

/** Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret). */
export function verifySignature(rawBody: Buffer, header: string | undefined): boolean {
  if (!config.WHATSAPP_APP_SECRET) return false;
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", config.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

export interface WaInboundMessage {
  phoneNumberId: string;
  /** Sender phone number — omitted by Meta when the user adopted a username and the number is not shareable */
  from?: string;
  /** Business-scoped user ID (BSUID) — always present */
  from_user_id?: string;
  profileName?: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload: string; text: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface WaStatus {
  phoneNumberId: string;
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: string;
  recipient_id?: string;
  recipient_user_id?: string;
  errors?: { code: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface WebhookBody {
  object?: string;
  entry?: {
    id: string;
    changes?: {
      field: string;
      value: {
        metadata?: { phone_number_id: string; display_phone_number?: string };
        contacts?: { wa_id?: string; user_id?: string; profile?: { name?: string; username?: string } }[];
        messages?: Omit<WaInboundMessage, "phoneNumberId" | "profileName">[];
        statuses?: Omit<WaStatus, "phoneNumberId">[];
        user_id_update?: { wa_id?: string; user_id?: { previous?: string; current?: string } }[];
      };
    }[];
  }[];
}

/** Flattens a webhook delivery into inbound messages and status updates. Unknown shapes are ignored. */
export interface WaUserIdUpdate {
  phoneNumberId: string;
  previous: string;
  current: string;
}

export function parseWebhook(body: unknown): { messages: WaInboundMessage[]; statuses: WaStatus[]; userIdUpdates: WaUserIdUpdate[] } {
  const out = { messages: [] as WaInboundMessage[], statuses: [] as WaStatus[], userIdUpdates: [] as WaUserIdUpdate[] };
  const b = body as WebhookBody;
  if (b?.object !== "whatsapp_business_account" || !Array.isArray(b.entry)) return out;
  for (const entry of b.entry) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const pnid = v?.metadata?.phone_number_id;
      if (!pnid) continue;
      if (change.field === "user_id_update") {
        for (const u of v.user_id_update ?? []) {
          if (u.user_id?.previous && u.user_id?.current) out.userIdUpdates.push({ phoneNumberId: pnid, previous: u.user_id.previous, current: u.user_id.current });
        }
        continue;
      }
      if (change.field !== "messages") continue;
      const names = new Map<string, string | undefined>();
      for (const c of v.contacts ?? []) {
        if (c.wa_id) names.set(c.wa_id, c.profile?.name);
        if (c.user_id) names.set(c.user_id, c.profile?.name);
      }
      for (const m of v.messages ?? []) {
        const from = m.from || undefined; // treat "" like missing
        if (!from && !m.from_user_id) continue; // cannot identify the sender
        out.messages.push({ ...m, from, phoneNumberId: pnid, profileName: names.get(from ?? "") ?? names.get(m.from_user_id ?? "") });
      }
      for (const s of v.statuses ?? []) out.statuses.push({ ...s, phoneNumberId: pnid });
    }
  }
  return out;
}
