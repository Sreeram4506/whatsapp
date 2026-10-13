import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import { STATUS_LABEL, tenantSettings } from "../lib/domain";
import { normalizeTicket } from "../lib/ticket";
import { publicLimiter } from "../middleware/rateLimit";
import { parseBody } from "../middleware/validate";
import { getProvider } from "../services/ai";
import { credsForTenant } from "../services/whatsapp/cloudApi";
import { sttConfigured } from "../services/ai/stt";

export const publicRouter = Router();

const publicTenant = (t: Awaited<ReturnType<typeof prisma.tenant.findFirst>> & object) => ({
  slug: t.slug,
  officeName: t.officeName,
  mlaName: t.mlaName,
  mlaDesignation: t.mlaDesignation,
  constituency: t.constituency,
  district: t.district,
  state: t.state,
  isSampleBranding: t.isSampleBranding,
  isDemoData: t.isDemoData,
  brandColor: t.brandColor,
  ticketPrefix: t.ticketPrefix,
  officeAddress: t.officeAddress,
  officeHours: t.officeHours,
  officePhone: t.officePhone,
  whatsappDisplayNumber: t.whatsappDisplayNumber,
  whatsappLive: !!credsForTenant(t),
  privacyNoticeVersion: tenantSettings(t).privacyNoticeVersion,
  retentionMonths: tenantSettings(t).retentionMonths,
});

publicRouter.get("/status", (_req, res) => {
  const ai = getProvider();
  res.json({
    simulatorEnabled: config.SIMULATOR_ENABLED,
    ai: { provider: ai.id, label: ai.label, live: ai.live },
    speechToText: sttConfigured(),
    whatsappWebhookConfigured: !!(config.WHATSAPP_VERIFY_TOKEN && config.WHATSAPP_APP_SECRET),
    graphApiVersion: config.WHATSAPP_GRAPH_API_VERSION,
    // These credentials are public whenever enabled; production must use an isolated demo database.
    demoAccounts:
      config.DEMO_LOGIN_HINTS
        ? {
            password: "Demo@2026",
            publicDemo: config.isProd,
            accounts: [
              { key: "admin", email: "admin@seethapuram.demo", label: "Office Administrator" },
              { key: "mla", email: "mla@seethapuram.demo", label: "MLA (executive view)" },
              { key: "field", email: "ravi@seethapuram.demo", label: "Field Officer · Roads" },
              { key: "field-water", email: "lakshmi@seethapuram.demo", label: "Field Officer · Water" },
              { key: "tenant-b", email: "admin@lankapalli.demo", label: "Admin of another MLA workspace" },
              { key: "platform", email: "platform@constituencyos.demo", label: "Platform Administrator" },
            ],
          }
        : null,
  });
});

publicRouter.get("/tenants", async (_req, res) => {
  const tenants = await prisma.tenant.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  res.json({ tenants: tenants.map(publicTenant) });
});

publicRouter.get("/tenants/:slug", async (req, res) => {
  const t = await prisma.tenant.findFirst({ where: { slug: String(req.params.slug), active: true } });
  if (!t) throw notFound("Workspace not found");
  res.json({ tenant: publicTenant(t) });
});

/** Citizen self-service lookup: ticket number + last 4 digits of the registered mobile. */
publicRouter.post("/track", publicLimiter, async (req, res) => {
  const body = parseBody(
    z.object({ slug: z.string().min(1).max(60), ticket: z.string().min(5).max(30), phoneLast4: z.string().regex(/^\d{4}$/) }),
    req,
  );
  const tenant = await prisma.tenant.findFirst({ where: { slug: body.slug, active: true } });
  const g = tenant
    ? await prisma.grievance.findFirst({
        where: { tenantId: tenant.id, ticketNumber: normalizeTicket(body.ticket) },
        include: {
          citizen: { select: { phone: true } },
          category: true,
          village: true,
          mandal: true,
          team: { select: { name: true } },
          updates: { where: { visibility: "CITIZEN" }, orderBy: { createdAt: "asc" }, select: { createdAt: true, message: true, toStatus: true, kind: true } },
        },
      })
    : null;
  // Same response for "no such ticket" and "wrong phone digits" to avoid ticket enumeration.
  if (!g || !g.citizen.phone.endsWith(body.phoneLast4)) throw notFound("No complaint matches these details");
  res.json({
    ticket: g.ticketNumber,
    status: g.status,
    statusLabel: STATUS_LABEL[g.status],
    category: { en: g.category.nameEn, te: g.category.nameTe },
    village: g.village?.name ?? g.villageText ?? null,
    mandal: g.mandal.name,
    team: g.team?.name ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    timeline: g.updates,
  });
});
