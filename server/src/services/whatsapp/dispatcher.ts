import { Channel, Conversation, DeliveryStatus, Prisma, Tenant } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../lib/prisma";
import { credsForTenant, sendCloudMessage, templatePayload, toCloudPayload } from "./cloudApi";
import { contentToPlainText, OutboundContent } from "./types";

const WINDOW_MS = 24 * 3600_000;

export async function getConversation(tenantId: string, channel: Channel, phone: string) {
  return prisma.conversation.upsert({
    where: { tenantId_channel_citizenPhone: { tenantId, channel, citizenPhone: phone } },
    update: {},
    create: { tenantId, channel, citizenPhone: phone },
  });
}

export interface DeliverOptions {
  tenant: Tenant;
  conversation: Conversation;
  contents: OutboundContent[];
  grievanceId?: string | null;
  /** true for office-initiated notifications (subject to opt-out and the 24-hour window) */
  proactive?: boolean;
  optedOut?: boolean;
  /** parameters for the approved status-update template, used outside the 24h window */
  templateParams?: string[];
  language?: "en" | "te";
}

/**
 * Delivers bot/office messages to a citizen and records each one with an honest delivery status:
 *  - SIMULATOR conversations → status SIMULATED (never sent to WhatsApp; the exact Cloud API payload is stored for review)
 *  - WHATSAPP with credentials → SENT / FAILED (later DELIVERED / READ via status webhooks)
 *  - WHATSAPP without credentials → NOT_CONFIGURED
 *  - opted-out citizens → SUPPRESSED for proactive messages
 */
export async function deliver(opts: DeliverOptions) {
  const { tenant, conversation, contents } = opts;
  const results = [];
  // Timestamps within a conversation must be strictly increasing, otherwise two replies created in the
  // same millisecond would have an undefined display order.
  const latest = await prisma.message.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  let lastTs = latest?.createdAt.getTime() ?? 0;
  for (const content of contents) {
    const createdAt = new Date(Math.max(Date.now(), lastTs + 1));
    lastTs = createdAt.getTime();
    const to = conversation.citizenPhone;
    let payload: Record<string, unknown> = toCloudPayload(to, content);
    let status: DeliveryStatus;
    let error: string | null = null;
    let externalId: string | null = null;
    let attempts = 0;

    if (opts.proactive && opts.optedOut) {
      status = "SUPPRESSED";
      error = "Citizen has opted out of WhatsApp updates";
    } else if (conversation.channel === "SIMULATOR") {
      status = "SIMULATED";
    } else {
      const creds = credsForTenant(tenant);
      const outsideWindow =
        opts.proactive && (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() > WINDOW_MS);
      if (outsideWindow) {
        if (config.WHATSAPP_TEMPLATE_STATUS_UPDATE && opts.templateParams) {
          payload = templatePayload(
            to,
            config.WHATSAPP_TEMPLATE_STATUS_UPDATE,
            opts.language === "te" ? config.WHATSAPP_TEMPLATE_LANG_TE : config.WHATSAPP_TEMPLATE_LANG_EN,
            opts.templateParams,
          );
        } else {
          payload = { ...payload, _blocked: "outside_24h_window" };
        }
      }
      if (!creds) {
        status = "NOT_CONFIGURED";
        error = "WhatsApp Cloud API credentials are not configured for this workspace";
      } else if ((payload as { _blocked?: string })._blocked) {
        status = "FAILED";
        error = "Outside the 24-hour customer service window and no approved template is configured";
      } else {
        const r = await sendCloudMessage(creds, payload);
        attempts = r.attempts;
        if (r.ok) {
          status = "SENT";
          externalId = r.wamid ?? null;
        } else {
          status = "FAILED";
          error = r.error ?? "Send failed";
        }
      }
    }

    const msg = await prisma.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        channel: conversation.channel,
        externalId,
        type: content.kind === "text" ? "text" : "interactive",
        body: contentToPlainText(content),
        payload: { content, cloudApi: payload } as unknown as Prisma.InputJsonValue,
        status,
        error,
        attempts,
        grievanceId: opts.grievanceId ?? null,
        statusUpdatedAt: new Date(),
        createdAt,
      },
    });
    results.push(msg);
  }
  return results;
}

/** Re-attempts a FAILED outbound WhatsApp message (admin action). */
export async function retryMessage(tenantId: string, messageId: string) {
  const msg = await prisma.message.findFirst({
    where: { id: messageId, tenantId, direction: "OUTBOUND", status: "FAILED", channel: "WHATSAPP" },
    include: { conversation: { include: { tenant: true } } },
  });
  if (!msg) return null;
  const creds = credsForTenant(msg.conversation.tenant);
  const payload = (msg.payload as { cloudApi?: Record<string, unknown> }).cloudApi;
  if (!creds || !payload || payload._blocked) {
    return prisma.message.update({
      where: { id: msg.id },
      data: { error: creds ? "Message cannot be retried (blocked by 24-hour window)" : "Credentials not configured" },
    });
  }
  const r = await sendCloudMessage(creds, payload);
  return prisma.message.update({
    where: { id: msg.id },
    data: {
      status: r.ok ? "SENT" : "FAILED",
      externalId: r.wamid ?? msg.externalId,
      error: r.ok ? null : r.error,
      attempts: msg.attempts + r.attempts,
      statusUpdatedAt: new Date(),
    },
  });
}
