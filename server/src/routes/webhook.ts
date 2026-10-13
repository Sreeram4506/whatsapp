import express, { Router } from "express";
import { DeliveryStatus, Prisma } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { webhookLimiter } from "../middleware/rateLimit";
import { processInbound } from "../services/bot/inbound";
import { credsForTenant, downloadMedia, markAsRead } from "../services/whatsapp/cloudApi";
import { parseWebhook, verifySignature, WaInboundMessage, WaStatus, WaUserIdUpdate } from "../services/whatsapp/webhook";
import { BSUID_PREFIX } from "../services/whatsapp/cloudApi";
import type { InboundInput } from "../services/whatsapp/types";
import { putObject, safeFileName, validateUpload } from "../services/storage";
import { transcribe } from "../services/ai/stt";

export const webhookRouter = Router();

/** Meta webhook verification handshake (GET). */
webhookRouter.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && config.WHATSAPP_VERIFY_TOKEN && token === config.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).type("text/plain").send(String(challenge ?? ""));
  }
  return res.sendStatus(403);
});

// Background work queue — exposed so tests (and graceful shutdown) can await completion.
const pending = new Set<Promise<void>>();
export async function drainWebhookQueue() {
  while (pending.size) await Promise.allSettled([...pending]);
}
function enqueue(fn: () => Promise<void>) {
  const p = fn().catch((err) => logger.error({ err }, "Webhook processing failed"));
  pending.add(p);
  void p.finally(() => pending.delete(p));
}

/** Event notifications (POST). Raw body is required to verify X-Hub-Signature-256. */
webhookRouter.post("/whatsapp", webhookLimiter, express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifySignature(raw, req.get("x-hub-signature-256"))) {
    logger.warn("Rejected WhatsApp webhook with invalid or missing signature");
    return res.sendStatus(401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }
  const { messages, statuses, userIdUpdates } = parseWebhook(body);

  // Idempotency: record each event key once; Meta retries deliveries that were not acknowledged.
  const work: ({ kind: "msg"; m: WaInboundMessage } | { kind: "status"; s: WaStatus } | { kind: "uid"; u: WaUserIdUpdate })[] = [];
  for (const m of messages) {
    if (await claimEvent(`msg:${m.id}`, m)) work.push({ kind: "msg", m });
  }
  for (const s of statuses) {
    if (await claimEvent(`status:${s.id}:${s.status}`, s)) work.push({ kind: "status", s });
  }
  for (const u of userIdUpdates) {
    if (await claimEvent(`uid:${u.previous}>${u.current}`, u)) work.push({ kind: "uid", u });
  }
  res.sendStatus(200); // acknowledge fast; process asynchronously

  for (const item of work) {
    const eventKey = item.kind === "msg" ? `msg:${item.m.id}` : item.kind === "status" ? `status:${item.s.id}:${item.s.status}` : `uid:${item.u.previous}>${item.u.current}`;
    enqueue(async () => {
      try {
        if (item.kind === "msg") await handleMessage(item.m);
        else if (item.kind === "status") await handleStatus(item.s);
        else await handleUserIdUpdate(item.u);
        await prisma.webhookEvent.update({ where: { eventKey }, data: { processedAt: new Date() } });
      } catch (err) {
        await prisma.webhookEvent.update({ where: { eventKey }, data: { error: (err as Error).message.slice(0, 500) } }).catch(() => undefined);
        throw err;
      }
    });
  }
});

async function claimEvent(eventKey: string, payload: unknown): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: { eventKey, provider: "whatsapp", payload: payload as Prisma.InputJsonValue },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logger.info({ eventKey }, "Duplicate webhook event ignored");
      return false;
    }
    throw err;
  }
}

async function handleMessage(m: WaInboundMessage) {
  const tenant = await prisma.tenant.findFirst({ where: { whatsappPhoneNumberId: m.phoneNumberId, active: true } });
  if (!tenant) {
    logger.warn({ phoneNumberId: m.phoneNumberId }, "Webhook for unknown phone number id");
    return;
  }
  await prisma.webhookEvent.update({ where: { eventKey: `msg:${m.id}` }, data: { tenantId: tenant.id } });
  const creds = credsForTenant(tenant);
  // Phone number when Meta shares it; otherwise the BSUID (user adopted a username)
  const identity = m.from ?? `${BSUID_PREFIX}${m.from_user_id}`;
  let input: InboundInput;

  switch (m.type) {
    case "text":
      input = { kind: "text", text: m.text?.body ?? "" };
      break;
    case "interactive": {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      input = r ? { kind: "reply", id: r.id, title: r.title } : { kind: "unsupported", type: "interactive" };
      break;
    }
    case "button": // quick-reply button on a template message
      input = { kind: "reply", id: m.button?.payload ?? "", title: m.button?.text ?? "" };
      break;
    case "location":
      input = { kind: "location", latitude: m.location!.latitude, longitude: m.location!.longitude, name: m.location?.name, address: m.location?.address };
      break;
    case "image":
    case "document": {
      const media = m.type === "image" ? m.image! : m.document!;
      input = { kind: "media", mediaType: m.type, caption: media.caption, fileName: m.document?.filename };
      if (!creds) {
        input.error = "media download is unavailable (credentials not configured)";
        break;
      }
      try {
        const { buffer, mimeType } = await downloadMedia(creds, media.id);
        const mime = validateUpload(buffer, mimeType);
        const citizen =
          (m.from_user_id && (await prisma.citizen.findFirst({ where: { tenantId: tenant.id, bsuid: m.from_user_id } }))) ||
          (await prisma.citizen.upsert({
            where: { tenantId_phone: { tenantId: tenant.id, phone: identity } },
            update: {},
            create: { tenantId: tenant.id, phone: identity, bsuid: m.from_user_id ?? null, preferredLanguage: tenant.defaultLanguage },
          }));
        const stored = await putObject(tenant.id, buffer, mime);
        const att = await prisma.attachment.create({
          data: {
            tenantId: tenant.id,
            citizenId: citizen.id,
            kind: "CITIZEN_UPLOAD",
            fileName: safeFileName(m.document?.filename ?? `whatsapp-${m.type}.${mime.split("/")[1]}`),
            mimeType: mime,
            source: "WHATSAPP",
            ...stored,
          },
        });
        input.attachmentId = att.id;
      } catch (err) {
        input.error = (err as Error).message.slice(0, 120);
      }
      break;
    }
    case "audio": {
      let transcript: string | null = null;
      if (creds) {
        try {
          const { buffer, mimeType } = await downloadMedia(creds, m.audio!.id);
          const convo = await prisma.conversation.findUnique({
            where: { tenantId_channel_citizenPhone: { tenantId: tenant.id, channel: "WHATSAPP", citizenPhone: identity } },
          });
          transcript = await transcribe(buffer, mimeType, convo?.language === "en" ? "en" : "te");
        } catch (err) {
          logger.warn({ err: (err as Error).message }, "Voice note download failed");
        }
      }
      input = { kind: "media", mediaType: "audio", transcript };
      break;
    }
    default:
      input = { kind: "unsupported", type: m.type };
  }

  const result = await processInbound(tenant, "WHATSAPP", identity, input, { externalId: m.id, profileName: m.profileName, rawType: m.type, bsuid: m.from_user_id });
  if (!result.duplicate && creds) void markAsRead(creds, m.id);
}

const STATUS_MAP: Record<string, DeliveryStatus> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
const RANK: Partial<Record<DeliveryStatus, number>> = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

async function handleStatus(s: WaStatus) {
  const next = STATUS_MAP[s.status];
  if (!next) return;
  const msg = await prisma.message.findFirst({ where: { externalId: s.id } });
  if (!msg) return;
  const err = s.errors?.[0];
  // Status webhooks can arrive out of order, and concurrently. The "never downgrade" rule is enforced
  // inside the UPDATE itself (not read-then-write), so a late `delivered` can never overwrite `read`.
  const blocking = (Object.keys(RANK) as DeliveryStatus[]).filter((st) => next !== "FAILED" && RANK[st]! >= RANK[next]!);
  await prisma.message.updateMany({
    where: { id: msg.id, ...(blocking.length ? { status: { notIn: blocking } } : {}) },
    data: {
      status: next,
      statusUpdatedAt: new Date(Number(s.timestamp) * 1000 || Date.now()),
      ...(err ? { error: `${err.code} ${err.title ?? err.message ?? ""} ${err.error_data?.details ?? ""}`.trim().slice(0, 500) } : {}),
    },
  });
}

/** A user's BSUID changed — keep the same citizen record by swapping the stored ID. */
async function handleUserIdUpdate(u: WaUserIdUpdate) {
  const tenant = await prisma.tenant.findFirst({ where: { whatsappPhoneNumberId: u.phoneNumberId, active: true } });
  if (!tenant) return;
  const citizen = await prisma.citizen.findFirst({ where: { tenantId: tenant.id, bsuid: u.previous } });
  if (!citizen) return;
  const taken = await prisma.citizen.findFirst({ where: { tenantId: tenant.id, bsuid: u.current } });
  if (taken) return;
  await prisma.citizen.update({ where: { id: citizen.id }, data: { bsuid: u.current } });
}
