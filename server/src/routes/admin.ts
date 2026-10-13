import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { badRequest, conflict, notFound } from "../lib/errors";
import { DONE_STATUSES, tenantSettings } from "../lib/domain";
import { maskPhone } from "../lib/privacy";
import { requireRole, tenantOf } from "../middleware/auth";
import { paramId, parseBody, parseQuery } from "../middleware/validate";
import { runEscalationSweep } from "../services/grievance";
import { notifyAppointment } from "../services/notifications";
import { retryMessage } from "../services/whatsapp/dispatcher";
import { credsForTenant } from "../services/whatsapp/cloudApi";
import { getProvider } from "../services/ai";
import { sttConfigured } from "../services/ai/stt";
import { removeObject } from "../services/storage";

export const adminRouter = Router();
const admin = requireRole("OFFICE_ADMIN");
const leaders = requireRole("OFFICE_ADMIN", "MLA");

export function tempPassword() {
  return `Cos-${crypto.randomBytes(6).toString("base64url")}9!`;
}

// ── Reference data for forms & filters ─────────────────────────────────────

adminRouter.get("/meta", async (req, res) => {
  const tenantId = tenantOf(req);
  const [categories, teams, mandals, officers] = await Promise.all([
    prisma.category.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, include: { defaultTeam: { select: { id: true, name: true } } } }),
    prisma.team.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.mandal.findMany({ where: { tenantId }, orderBy: { name: "asc" }, include: { villages: { orderBy: { name: "asc" }, select: { id: true, name: true, nameTe: true, kind: true } } } }),
    req.user!.role === "FIELD_OFFICER"
      ? []
      : prisma.user.findMany({ where: { tenantId, role: "FIELD_OFFICER", active: true }, select: { id: true, name: true, teamId: true }, orderBy: { name: "asc" } }),
  ]);
  res.json({ categories, teams, mandals, officers });
});

// ── Staff management ───────────────────────────────────────────────────────

adminRouter.get("/users", admin, async (req, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: tenantOf(req) },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, phone: true, team: { select: { id: true, name: true } }, _count: { select: { assignedGrievances: true } } },
  });
  res.json({ users });
});

const roleEnum = z.enum(["OFFICE_ADMIN", "MLA", "FIELD_OFFICER"]);

adminRouter.post("/users", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(
    z.object({ name: z.string().min(2).max(80), email: z.string().email().max(200), role: roleEnum, teamId: z.string().nullable().optional(), phone: z.string().max(20).optional() }),
    req,
  );
  if (body.teamId && !(await prisma.team.findFirst({ where: { id: body.teamId, tenantId } }))) throw badRequest("Unknown team");
  const pw = tempPassword();
  const user = await prisma.user.create({
    data: { tenantId, name: body.name, email: body.email.toLowerCase(), role: body.role, teamId: body.teamId ?? null, phone: body.phone, passwordHash: await bcrypt.hash(pw, 12) },
  });
  await audit({ tenantId, actor: req.user, action: "user.create", entityType: "User", entityId: user.id, details: { role: user.role, email: user.email } });
  res.status(201).json({ id: user.id, temporaryPassword: pw, note: "Share this temporary password securely. It is shown only once." });
});

adminRouter.patch("/users/:id", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const id = paramId(req);
  const body = parseBody(z.object({ role: roleEnum.optional(), teamId: z.string().nullable().optional(), active: z.boolean().optional(), name: z.string().min(2).max(80).optional() }), req);
  const u = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!u) throw notFound();
  if (id === req.user!.id && (body.active === false || (body.role && body.role !== "OFFICE_ADMIN"))) {
    throw badRequest("You cannot deactivate or demote your own account");
  }
  if (body.teamId && !(await prisma.team.findFirst({ where: { id: body.teamId, tenantId } }))) throw badRequest("Unknown team");
  const updated = await prisma.user.update({ where: { id }, data: body });
  await audit({ tenantId, actor: req.user, action: "user.update", entityType: "User", entityId: id, details: body });
  res.json({ id: updated.id });
});

adminRouter.post("/users/:id/reset-password", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const u = await prisma.user.findFirst({ where: { id: paramId(req), tenantId } });
  if (!u) throw notFound();
  const pw = tempPassword();
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(pw, 12) } });
  await audit({ tenantId, actor: req.user, action: "user.reset_password", entityType: "User", entityId: u.id });
  res.json({ temporaryPassword: pw });
});

// ── Teams & categories (tenant configuration) ──────────────────────────────

adminRouter.post("/teams", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(z.object({ name: z.string().min(2).max(60), department: z.string().min(2).max(120), description: z.string().max(300).optional() }), req);
  const t = await prisma.team.create({ data: { tenantId, ...body } });
  await audit({ tenantId, actor: req.user, action: "team.create", entityType: "Team", entityId: t.id });
  res.status(201).json(t);
});

adminRouter.patch("/teams/:id", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(z.object({ name: z.string().min(2).max(60).optional(), department: z.string().min(2).max(120).optional(), active: z.boolean().optional() }), req);
  const t = await prisma.team.findFirst({ where: { id: paramId(req), tenantId } });
  if (!t) throw notFound();
  await prisma.team.update({ where: { id: t.id }, data: body });
  await audit({ tenantId, actor: req.user, action: "team.update", entityType: "Team", entityId: t.id, details: body });
  res.json({ ok: true });
});

const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

adminRouter.post("/categories", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(
    z.object({
      code: z.string().regex(/^[A-Z_]{2,20}$/),
      nameEn: z.string().min(2).max(22),
      nameTe: z.string().min(2).max(22),
      emoji: z.string().max(4).default("📌"),
      defaultTeamId: z.string().nullable().optional(),
      defaultPriority: priorityEnum.default("MEDIUM"),
      isInfrastructure: z.boolean().default(false),
    }),
    req,
  );
  const count = await prisma.category.count({ where: { tenantId, active: true } });
  const c = await prisma.category.create({ data: { tenantId, ...body, sortOrder: count + 1 } });
  await audit({ tenantId, actor: req.user, action: "category.create", entityType: "Category", entityId: c.id });
  res.status(201).json(c);
});

adminRouter.patch("/categories/:id", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(
    z.object({ nameEn: z.string().min(2).max(22).optional(), nameTe: z.string().min(2).max(22).optional(), defaultTeamId: z.string().nullable().optional(), defaultPriority: priorityEnum.optional(), active: z.boolean().optional(), isInfrastructure: z.boolean().optional() }),
    req,
  );
  const c = await prisma.category.findFirst({ where: { id: paramId(req), tenantId } });
  if (!c) throw notFound();
  if (body.defaultTeamId && !(await prisma.team.findFirst({ where: { id: body.defaultTeamId, tenantId } }))) throw badRequest("Unknown team");
  await prisma.category.update({ where: { id: c.id }, data: body });
  await audit({ tenantId, actor: req.user, action: "category.update", entityType: "Category", entityId: c.id, details: body });
  res.json({ ok: true });
});

// ── Workspace settings & integrations ──────────────────────────────────────

adminRouter.get("/settings", leaders, async (req, res) => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantOf(req) } });
  const ai = getProvider();
  res.json({
    tenant: {
      officeName: t.officeName,
      mlaName: t.mlaName,
      constituency: t.constituency,
      district: t.district,
      isSampleBranding: t.isSampleBranding,
      isDemoData: t.isDemoData,
      officeAddress: t.officeAddress,
      officeHours: t.officeHours,
      officePhone: t.officePhone,
      defaultLanguage: t.defaultLanguage,
      ticketPrefix: t.ticketPrefix,
      whatsappPhoneNumberId: t.whatsappPhoneNumberId,
      whatsappDisplayNumber: t.whatsappDisplayNumber,
      whatsappBusinessAccountId: t.whatsappBusinessAccountId,
      whatsappTokenEnvKey: t.whatsappTokenEnvKey,
    },
    settings: tenantSettings(t),
    integrations: {
      whatsapp: {
        phoneNumberIdSet: !!t.whatsappPhoneNumberId,
        accessTokenAvailable: !!credsForTenant(t),
        webhookVerifyTokenSet: !!config.WHATSAPP_VERIFY_TOKEN,
        appSecretSet: !!config.WHATSAPP_APP_SECRET,
        statusTemplateSet: !!config.WHATSAPP_TEMPLATE_STATUS_UPDATE,
        graphApiVersion: config.WHATSAPP_GRAPH_API_VERSION,
        mode: credsForTenant(t) ? "LIVE" : "NOT_CONFIGURED",
      },
      simulator: { enabled: config.SIMULATOR_ENABLED },
      ai: { provider: ai.id, label: ai.label, live: ai.live },
      speechToText: { configured: sttConfigured() },
    },
  });
});

adminRouter.patch("/settings", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(
    z.object({
      officeAddress: z.string().max(300).nullable().optional(),
      officeHours: z.string().max(120).nullable().optional(),
      officePhone: z.string().max(40).nullable().optional(),
      defaultLanguage: z.enum(["te", "en"]).optional(),
      whatsappPhoneNumberId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
      whatsappDisplayNumber: z.string().max(30).nullable().optional(),
      whatsappBusinessAccountId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
      whatsappTokenEnvKey: z.string().regex(/^[A-Z][A-Z0-9_]{2,60}$/).nullable().optional(),
      settings: z
        .object({
          slaDays: z.object({ CRITICAL: z.number().int().min(1).max(60), HIGH: z.number().int().min(1).max(90), MEDIUM: z.number().int().min(1).max(120), LOW: z.number().int().min(1).max(180) }).optional(),
          escalationAfterOverdueHours: z.number().int().min(1).max(720).optional(),
          retentionMonths: z.number().int().min(6).max(120).optional(),
          mlaCanViewCitizenContact: z.boolean().optional(),
        })
        .optional(),
    }),
    req,
  );
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const { settings, ...rest } = body;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { ...rest, ...(settings ? { settings: { ...tenantSettings(t), ...settings } as unknown as Prisma.InputJsonValue } : {}) },
  });
  await audit({ tenantId, actor: req.user, action: "settings.update", entityType: "Tenant", entityId: tenantId, details: body });
  res.json({ ok: true });
});

// ── Audit log ──────────────────────────────────────────────────────────────

adminRouter.get("/audit", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const q = parseQuery(z.object({ entityType: z.string().max(40).optional(), action: z.string().max(60).optional(), entityId: z.string().max(40).optional(), page: z.coerce.number().int().min(1).default(1) }), req);
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * 50, take: 50 }),
  ]);
  res.json({ total, page: q.page, pageSize: 50, items });
});

// ── WhatsApp delivery log ──────────────────────────────────────────────────

adminRouter.get("/messages", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const q = parseQuery(z.object({ status: z.string().max(20).optional(), channel: z.enum(["WHATSAPP", "SIMULATOR"]).optional(), page: z.coerce.number().int().min(1).default(1) }), req);
  const where: Prisma.MessageWhereInput = {
    tenantId,
    direction: "OUTBOUND",
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.channel ? { channel: q.channel } : {}),
  };
  const [total, items, counts] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * 30, take: 30, include: { conversation: { select: { citizenPhone: true } } } }),
    prisma.message.groupBy({ by: ["status"], where: { tenantId, direction: "OUTBOUND" }, _count: true }),
  ]);
  res.json({
    total,
    page: q.page,
    pageSize: 30,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    items: items.map((m) => ({ id: m.id, channel: m.channel, status: m.status, body: m.body, error: m.error, attempts: m.attempts, createdAt: m.createdAt, statusUpdatedAt: m.statusUpdatedAt, to: maskPhone(m.conversation.citizenPhone), grievanceId: m.grievanceId })),
  });
});

adminRouter.post("/messages/:id/retry", admin, async (req, res) => {
  const m = await retryMessage(tenantOf(req), paramId(req));
  if (!m) throw notFound("Only failed WhatsApp messages can be retried");
  await audit({ tenantId: tenantOf(req), actor: req.user, action: "message.retry", entityType: "Message", entityId: m.id, details: { status: m.status } });
  res.json({ id: m.id, status: m.status, error: m.error });
});

// ── Appointments ───────────────────────────────────────────────────────────

adminRouter.get("/appointments", leaders, async (req, res) => {
  const tenantId = tenantOf(req);
  const q = parseQuery(z.object({ status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional() }), req);
  const items = await prisma.appointment.findMany({
    where: { tenantId, ...(q.status ? { status: q.status } : {}) },
    orderBy: [{ status: "asc" }, { preferredDate: "asc" }],
    include: { citizen: { select: { name: true, phone: true } } },
    take: 200,
  });
  const isAdmin = req.user!.role === "OFFICE_ADMIN";
  res.json({ items: items.map((a) => ({ ...a, citizen: { name: isAdmin ? a.citizen.name : null, phone: maskPhone(a.citizen.phone) } })) });
});

adminRouter.patch("/appointments/:id", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(
    z.object({ status: z.enum(["CONFIRMED", "COMPLETED", "CANCELLED"]), scheduledAt: z.string().datetime().optional(), officeNote: z.string().max(500).optional() }),
    req,
  );
  if (body.status === "CONFIRMED" && !body.scheduledAt) throw badRequest("A date and time are required to confirm");
  const a = await prisma.appointment.findFirst({ where: { id: paramId(req), tenantId } });
  if (!a) throw notFound();
  const updated = await prisma.appointment.update({
    where: { id: a.id },
    data: { status: body.status, scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : a.scheduledAt, officeNote: body.officeNote ?? a.officeNote, handledById: req.user!.id },
  });
  await audit({ tenantId, actor: req.user, action: "appointment.update", entityType: "Appointment", entityId: a.id, details: { status: body.status } });
  if (body.status !== "COMPLETED") void notifyAppointment(a.id);
  res.json(updated);
});

// ── Government service guidance ────────────────────────────────────────────

adminRouter.get("/guidance", leaders, async (req, res) => {
  const items = await prisma.guidanceArticle.findMany({ where: { tenantId: tenantOf(req) }, orderBy: [{ type: "asc" }, { sortOrder: "asc" }] });
  res.json({ items });
});

const guidanceBody = z.object({
  type: z.enum(["SCHEME", "CERTIFICATE"]),
  code: z.string().regex(/^[A-Z0-9_]{2,30}$/),
  titleEn: z.string().min(2).max(24),
  titleTe: z.string().min(2).max(24),
  summaryEn: z.string().min(5).max(400),
  summaryTe: z.string().min(5).max(400),
  stepsEn: z.array(z.string().min(2).max(200)).min(1).max(10),
  stepsTe: z.array(z.string().min(2).max(200)).min(1).max(10),
  documentsEn: z.array(z.string().min(2).max(120)).max(12),
  documentsTe: z.array(z.string().min(2).max(120)).max(12),
  officialSourceName: z.string().min(2).max(120),
  officialSourceUrl: z.string().url().refine((u) => u.startsWith("https://"), "Official source must be an https URL"),
});

adminRouter.post("/guidance", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(guidanceBody, req);
  const a = await prisma.guidanceArticle.create({ data: { tenantId, ...body, status: "DRAFT" } });
  await audit({ tenantId, actor: req.user, action: "guidance.create", entityType: "GuidanceArticle", entityId: a.id });
  res.status(201).json(a);
});

adminRouter.patch("/guidance/:id", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(guidanceBody.partial().extend({ status: z.enum(["DRAFT", "ARCHIVED"]).optional() }), req);
  const a = await prisma.guidanceArticle.findFirst({ where: { id: paramId(req), tenantId } });
  if (!a) throw notFound();
  // Any content change invalidates the previous verification.
  const contentChanged = Object.keys(body).some((k) => k !== "status");
  await prisma.guidanceArticle.update({
    where: { id: a.id },
    data: { ...body, ...(contentChanged ? { status: "DRAFT", lastVerifiedAt: null, verifiedById: null } : {}) },
  });
  await audit({ tenantId, actor: req.user, action: "guidance.update", entityType: "GuidanceArticle", entityId: a.id });
  res.json({ ok: true });
});

adminRouter.post("/guidance/:id/verify", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(z.object({ note: z.string().min(5).max(300), sourceChecked: z.literal(true) }), req);
  const a = await prisma.guidanceArticle.findFirst({ where: { id: paramId(req), tenantId } });
  if (!a) throw notFound();
  await prisma.guidanceArticle.update({ where: { id: a.id }, data: { status: "VERIFIED", lastVerifiedAt: new Date(), verifiedById: req.user!.id, verificationNote: body.note } });
  await audit({ tenantId, actor: req.user, action: "guidance.verify", entityType: "GuidanceArticle", entityId: a.id, details: { note: body.note } });
  res.json({ ok: true });
});

// ── Citizens, retention & erasure ──────────────────────────────────────────

adminRouter.get("/citizens", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const q = parseQuery(z.object({ q: z.string().max(60).optional(), page: z.coerce.number().int().min(1).default(1) }), req);
  const where: Prisma.CitizenWhereInput = {
    tenantId,
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { phone: { endsWith: q.q.replace(/\D/g, "") || "__none__" } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.citizen.count({ where }),
    prisma.citizen.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * 30,
      take: 30,
      include: { village: { select: { name: true } }, _count: { select: { grievances: true, appointments: true } } },
    }),
  ]);
  res.json({
    total,
    page: q.page,
    pageSize: 30,
    items: items.map((c) => ({ id: c.id, name: c.erasedAt ? "[erased]" : c.name, phone: maskPhone(c.phone), language: c.preferredLanguage, village: c.village?.name ?? null, optedOut: c.optedOut, consentAt: c.consentAt, erasedAt: c.erasedAt, createdAt: c.createdAt, grievances: c._count.grievances, appointments: c._count.appointments })),
  });
});

async function eraseCitizen(tenantId: string, citizenId: string) {
  const citizen = await prisma.citizen.findUniqueOrThrow({ where: { id: citizenId } });
  const atts = await prisma.attachment.findMany({ where: { tenantId, OR: [{ citizenId }, { grievance: { citizenId } }] } });
  const webhookEvents = await prisma.webhookEvent.findMany({ where: { OR: [{ tenantId }, { tenantId: null }] }, select: { id: true, payload: true } });
  const webhookEventIds = webhookEvents
    .filter((event) => JSON.stringify(event.payload).includes(citizen.phone) || (!!citizen.bsuid && JSON.stringify(event.payload).includes(citizen.bsuid)))
    .map((event) => event.id);
  for (const a of atts) await removeObject(a.storageKey);
  const pseudo = `erased-${crypto.randomBytes(6).toString("hex")}`;
  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } }),
    // Raw webhook payloads carry the sender's number and message text — purge them too.
    prisma.webhookEvent.deleteMany({ where: { id: { in: webhookEventIds } } }),
    prisma.message.deleteMany({ where: { tenantId, conversation: { citizenPhone: citizen.phone } } }),
    prisma.conversation.deleteMany({ where: { tenantId, citizenPhone: citizen.phone } }),
    prisma.grievance.updateMany({
      where: { tenantId, citizenId },
      data: { latitude: null, longitude: null, landmark: null, description: "[Removed at citizen's request / retention policy]", aiSummary: null, feedbackComment: null },
    }),
    prisma.appointment.updateMany({ where: { tenantId, citizenId }, data: { purpose: "[removed]" } }),
    prisma.citizen.update({ where: { id: citizenId }, data: { name: null, phone: pseudo, bsuid: null, villageId: null, erasedAt: new Date(), optedOut: true } }),
  ]);
}

/** Right-to-erasure: removes personal data but keeps anonymised case statistics. */
adminRouter.post("/citizens/:id/erase", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(z.object({ reason: z.string().min(5).max(300), confirm: z.literal("ERASE") }), req);
  const c = await prisma.citizen.findFirst({ where: { id: paramId(req), tenantId } });
  if (!c) throw notFound();
  if (c.erasedAt) throw conflict("Citizen data already erased");
  await eraseCitizen(tenantId, c.id);
  await audit({ tenantId, actor: req.user, action: "citizen.erase", entityType: "Citizen", entityId: c.id, details: { reason: body.reason } });
  res.json({ ok: true });
});

async function retentionCandidates(tenantId: string) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const months = tenantSettings(t).retentionMonths;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  // Citizens whose every grievance was closed before the cutoff and who have no recent activity.
  const citizens = await prisma.citizen.findMany({
    where: {
      tenantId,
      erasedAt: null,
      updatedAt: { lt: cutoff },
      grievances: { every: { status: { in: DONE_STATUSES }, updatedAt: { lt: cutoff } } },
    },
    select: { id: true, createdAt: true, _count: { select: { grievances: true } } },
  });
  return { months, cutoff, citizens };
}

adminRouter.get("/retention/preview", admin, async (req, res) => {
  const r = await retentionCandidates(tenantOf(req));
  res.json({ retentionMonths: r.months, cutoff: r.cutoff, citizensToAnonymise: r.citizens.length });
});

adminRouter.post("/retention/apply", admin, async (req, res) => {
  const tenantId = tenantOf(req);
  parseBody(z.object({ confirm: z.literal("APPLY") }), req);
  const r = await retentionCandidates(tenantId);
  for (const c of r.citizens) await eraseCitizen(tenantId, c.id);
  await audit({ tenantId, actor: req.user, action: "retention.apply", entityType: "Tenant", entityId: tenantId, details: { anonymised: r.citizens.length, cutoff: r.cutoff } });
  res.json({ anonymised: r.citizens.length });
});

adminRouter.post("/escalations/run", admin, async (req, res) => {
  const n = await runEscalationSweep(new Date(), tenantOf(req));
  await audit({ tenantId: tenantOf(req), actor: req.user, action: "escalation.run", entityType: "Tenant", details: { escalated: n } });
  res.json({ escalated: n });
});
