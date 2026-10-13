import { Channel, Prisma, Tenant } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { deliver, getConversation } from "../whatsapp/dispatcher";
import { inputToPlainText, InboundInput } from "../whatsapp/types";
import { BotCtx, ConvData, runEngine } from "./engine";
import type { Lang } from "./i18n";

/** BSUID first, then phone; upgrades a placeholder "bsuid:" identity once a real phone number arrives. */
async function resolveCitizen(tenant: Tenant, phone: string, bsuid?: string) {
  const make = () => ({ tenantId: tenant.id, preferredLanguage: tenant.defaultLanguage });
  if (bsuid) {
    const byBsuid = await prisma.citizen.findUnique({ where: { tenantId_bsuid: { tenantId: tenant.id, bsuid } } });
    if (byBsuid) {
      if (!phone.startsWith("bsuid:") && byBsuid.phone !== phone && byBsuid.phone.startsWith("bsuid:")) {
        const clash = await prisma.citizen.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone } } });
        if (!clash) return prisma.citizen.update({ where: { id: byBsuid.id }, data: { phone } });
      }
      return byBsuid;
    }
  }
  const byPhone = await prisma.citizen.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone } } });
  if (byPhone) {
    if (bsuid && !byPhone.bsuid) return prisma.citizen.update({ where: { id: byPhone.id }, data: { bsuid } });
    return byPhone;
  }
  return prisma.citizen.create({ data: { ...make(), phone, bsuid: bsuid ?? null } });
}

/** Serialises processing per conversation so rapid messages are handled in order (single instance). */
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

export interface InboundMeta {
  /** Business-scoped user ID from the webhook (matched before phone, per Meta's guidance) */
  bsuid?: string;
  externalId?: string;
  profileName?: string;
  rawType?: string;
}

export interface InboundResult {
  duplicate: boolean;
  conversationId?: string;
  outboundIds?: string[];
}

/**
 * Single entry point for every citizen message, from the real WhatsApp webhook or the simulator:
 * persist inbound → run the bot → persist & deliver replies.
 */
export async function processInbound(
  tenant: Tenant,
  channel: Channel,
  phone: string,
  input: InboundInput,
  meta: InboundMeta = {},
): Promise<InboundResult> {
  return withLock(`${tenant.id}:${channel}:${phone}`, async () => {
    const citizen = await resolveCitizen(tenant, phone, meta.bsuid);
    // Conversations are keyed by the citizen's canonical identity (phone, or "bsuid:<id>" when no number is shared)
    phone = citizen.phone;
    const conversation = await getConversation(tenant.id, channel, phone);

    try {
      await prisma.message.create({
        data: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: "INBOUND",
          channel,
          externalId: meta.externalId ?? null,
          type: input.kind === "reply" ? "interactive" : input.kind === "media" ? input.mediaType : input.kind,
          body: inputToPlainText(input),
          payload: { input } as unknown as Prisma.InputJsonValue,
          status: "RECEIVED",
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        logger.info({ externalId: meta.externalId }, "Duplicate inbound message ignored");
        return { duplicate: true };
      }
      throw err;
    }

    const ctx: BotCtx = {
      tenant,
      citizen,
      channel,
      state: conversation.state,
      data: (conversation.data ?? {}) as ConvData,
      language: (conversation.language as Lang | null) ?? null,
      out: [],
    };
    try {
      await runEngine(ctx, input);
    } catch (err) {
      logger.error({ err }, "Bot engine error");
      ctx.out.push({
        kind: "text",
        body:
          ctx.language === "en"
            ? "⚠️ Sorry, something went wrong on our side. Please type *menu* to start again."
            : "⚠️ క్షమించండి, మా వైపు సమస్య వచ్చింది. మళ్లీ ప్రారంభించడానికి *menu* టైప్ చేయండి.",
      });
      ctx.state = "idle";
      ctx.data = {};
    }

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        state: ctx.state,
        data: ctx.data as Prisma.InputJsonValue,
        language: ctx.language,
        lastInboundAt: new Date(),
      },
    });
    const sent = await deliver({ tenant, conversation: updated, contents: ctx.out });
    return { duplicate: false, conversationId: conversation.id, outboundIds: sent.map((m) => m.id) };
  });
}
