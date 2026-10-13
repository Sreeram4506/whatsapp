import { Router } from "express";
import multer from "multer";
import { GrievanceStatus, Prisma, Priority } from "@prisma/client";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { OPEN_STATUSES, STATUS_ROLE, TRANSITIONS, tenantSettings } from "../lib/domain";
import { formatPhone, maskName, maskPhone } from "../lib/privacy";
import { AuthUser, requireRole, tenantOf } from "../middleware/auth";
import { paramId, parseBody, parseQuery } from "../middleware/validate";
import { draftCitizenReply } from "../services/ai";
import {
  addNote,
  assignGrievance,
  createGrievance,
  requestResolution,
  scheduleFieldVisit,
  setPriority,
  transitionStatus,
} from "../services/grievance";
import { putObject, readObject, safeFileName, validateUpload } from "../services/storage";

export const grievanceRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

const STATUSES = Object.keys(TRANSITIONS) as GrievanceStatus[];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

async function contactPolicy(user: AuthUser) {
  if (user.role === "OFFICE_ADMIN" || user.role === "FIELD_OFFICER") return { names: true, phones: true };
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId! } });
  const allowed = tenantSettings(tenant).mlaCanViewCitizenContact;
  return { names: allowed, phones: allowed };
}

/** Field officers only ever see cases assigned to them — enforced in every query. */
function scopeWhere(user: AuthUser): Prisma.GrievanceWhereInput {
  if (!user.tenantId) throw forbidden("This action requires a workspace account");
  const base: Prisma.GrievanceWhereInput = { tenantId: user.tenantId };
  if (user.role === "FIELD_OFFICER") base.assigneeId = user.id;
  return base;
}

const listQuery = z.object({
  status: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  categoryId: z.string().max(40).optional(),
  mandalId: z.string().max(40).optional(),
  villageId: z.string().max(40).optional(),
  teamId: z.string().max(40).optional(),
  assigneeId: z.string().max(40).optional(),
  source: z.enum(["WHATSAPP", "SIMULATOR", "STAFF_ENTRY"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  escalated: z.enum(["true", "false"]).optional(),
  open: z.enum(["true", "false"]).optional(),
  pendingResolution: z.enum(["true", "false"]).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  sort: z.enum(["created_desc", "created_asc", "priority", "due", "updated"]).default("created_desc"),
});

grievanceRouter.get("/", async (req, res) => {
  const user = req.user!;
  const q = parseQuery(listQuery, req);
  const where: Prisma.GrievanceWhereInput = { ...scopeWhere(user) };
  if (q.status) {
    const list = q.status.split(",").filter((s): s is GrievanceStatus => STATUSES.includes(s as GrievanceStatus));
    if (list.length) where.status = { in: list };
  }
  if (q.open === "true") where.status = { in: OPEN_STATUSES };
  if (q.priority) where.priority = q.priority;
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.mandalId) where.mandalId = q.mandalId;
  if (q.villageId) where.villageId = q.villageId;
  if (q.teamId) where.teamId = q.teamId === "none" ? null : q.teamId;
  if (q.assigneeId && user.role !== "FIELD_OFFICER") where.assigneeId = q.assigneeId;
  if (q.source) where.source = q.source;
  if (q.overdue === "true") Object.assign(where, { dueAt: { lt: new Date() }, status: { in: OPEN_STATUSES } });
  if (q.escalated === "true") where.escalationLevel = { gt: 0 };
  if (q.pendingResolution === "true") Object.assign(where, { resolutionRequestedAt: { not: null }, status: { in: ["ASSIGNED", "IN_PROGRESS"] } });
  if (q.q) {
    const term = q.q.trim();
    where.OR = [
      { ticketNumber: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { landmark: { contains: term, mode: "insensitive" } },
      { villageText: { contains: term, mode: "insensitive" } },
      { village: { name: { contains: term, mode: "insensitive" } } },
      ...(user.role !== "MLA" ? [{ citizen: { name: { contains: term, mode: "insensitive" as const } } }] : []),
    ];
  }
  const orderBy: Prisma.GrievanceOrderByWithRelationInput[] =
    q.sort === "created_asc"
      ? [{ createdAt: "asc" }]
      : q.sort === "priority"
        ? [{ priority: "desc" }, { createdAt: "asc" }]
        : q.sort === "due"
          ? [{ dueAt: { sort: "asc", nulls: "last" } }]
          : q.sort === "updated"
            ? [{ updatedAt: "desc" }]
            : [{ createdAt: "desc" }];

  const [total, items, policy] = await Promise.all([
    prisma.grievance.count({ where }),
    prisma.grievance.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        category: { select: { nameEn: true, nameTe: true, emoji: true, code: true } },
        village: { select: { name: true } },
        mandal: { select: { name: true } },
        team: { select: { name: true } },
        assignee: { select: { name: true } },
        citizen: { select: { name: true, phone: true } },
        _count: { select: { attachments: true } },
      },
    }),
    contactPolicy(user),
  ]);
  const now = new Date();
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: items.map((g) => ({
      id: g.id,
      ticketNumber: g.ticketNumber,
      status: g.status,
      priority: g.priority,
      urgency: g.urgency,
      source: g.source,
      category: g.category,
      village: g.village?.name ?? g.villageText,
      mandal: g.mandal.name,
      team: g.team?.name ?? null,
      assignee: g.assignee?.name ?? null,
      citizenName: policy.names ? g.citizen.name : maskName(g.citizen.name),
      citizenPhone: maskPhone(g.citizen.phone),
      summary: g.aiSummary ?? g.description.slice(0, 140),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      dueAt: g.dueAt,
      overdue: !!(g.dueAt && g.dueAt < now && OPEN_STATUSES.includes(g.status)),
      escalationLevel: g.escalationLevel,
      attachments: g._count.attachments,
      resolutionRequested: !!g.resolutionRequestedAt && ["ASSIGNED", "IN_PROGRESS"].includes(g.status),
      possibleDuplicate: !!g.possibleDuplicateOfId,
    })),
  });
});

grievanceRouter.post("/", requireRole("OFFICE_ADMIN"), async (req, res) => {
  const user = req.user!;
  const tenantId = tenantOf(req);
  const body = parseBody(
    z.object({
      citizenName: z.string().min(2).max(80),
      citizenPhone: z.string().regex(/^\d{10,15}$/),
      language: z.enum(["te", "en"]),
      consentConfirmed: z.literal(true, { errorMap: () => ({ message: "Citizen consent must be confirmed" }) }),
      categoryId: z.string().min(1),
      mandalId: z.string().min(1),
      villageId: z.string().optional().nullable(),
      villageText: z.string().max(60).optional().nullable(),
      landmark: z.string().max(160).optional().nullable(),
      description: z.string().min(15).max(2000),
      urgency: z.enum(["NORMAL", "URGENT", "SAFETY"]).default("NORMAL"),
    }),
    req,
  );
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const phone = body.citizenPhone.length === 10 ? `91${body.citizenPhone}` : body.citizenPhone;
  const citizen = await prisma.citizen.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    update: { name: body.citizenName, preferredLanguage: body.language },
    create: { tenantId, phone, name: body.citizenName, preferredLanguage: body.language, consentAt: new Date() },
  });
  await prisma.consentRecord.create({
    data: { tenantId, citizenId: citizen.id, type: "PROCESSING_GRANTED", channel: "STAFF_ENTRY", noticeVersion: tenantSettings(tenant).privacyNoticeVersion },
  });
  const g = await createGrievance({
    tenant,
    citizenId: citizen.id,
    source: "STAFF_ENTRY",
    categoryId: body.categoryId,
    mandalId: body.mandalId,
    villageId: body.villageId || null,
    villageText: body.villageText || null,
    landmark: body.landmark || null,
    description: body.description,
    urgency: body.urgency,
    actor: user,
  });
  res.status(201).json({ id: g.id, ticketNumber: g.ticketNumber });
});

grievanceRouter.get("/:id", async (req, res) => {
  const user = req.user!;
  const id = paramId(req);
  const g = await prisma.grievance.findFirst({
    where: { id, ...scopeWhere(user) },
    include: {
      category: true,
      village: true,
      mandal: true,
      team: true,
      assignee: { select: { id: true, name: true, phone: true } },
      citizen: { select: { id: true, name: true, phone: true, preferredLanguage: true, optedOut: true, consentAt: true, erasedAt: true } },
      updates: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, source: true } },
    },
  });
  if (!g) throw notFound("Grievance not found");
  const policy = await contactPolicy(user);
  const [duplicateOf, aiTeam, messages, related] = await Promise.all([
    g.possibleDuplicateOfId
      ? prisma.grievance.findFirst({ where: { id: g.possibleDuplicateOfId, tenantId: g.tenantId }, select: { id: true, ticketNumber: true, status: true } })
      : null,
    g.aiSuggestedTeamId ? prisma.team.findFirst({ where: { id: g.aiSuggestedTeamId, tenantId: g.tenantId }, select: { id: true, name: true } }) : null,
    user.role === "OFFICE_ADMIN"
      ? prisma.message.findMany({
          where: { tenantId: g.tenantId, grievanceId: g.id, direction: "OUTBOUND" },
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, status: true, channel: true, error: true, createdAt: true },
        })
      : [],
    prisma.grievance.count({ where: { tenantId: g.tenantId, possibleDuplicateOfId: g.id } }),
  ]);
  const allowedTransitions = TRANSITIONS[g.status].filter((s) => STATUS_ROLE[s].includes(user.role));
  const now = new Date();
  res.json({
    ...g,
    citizen: {
      id: g.citizen.id,
      name: g.citizen.erasedAt ? "[erased]" : policy.names ? g.citizen.name : maskName(g.citizen.name),
      phoneMasked: maskPhone(g.citizen.phone),
      canReveal: policy.phones && !g.citizen.erasedAt,
      preferredLanguage: g.citizen.preferredLanguage,
      optedOut: g.citizen.optedOut,
      consentAt: g.citizen.consentAt,
    },
    assignee: g.assignee ? { id: g.assignee.id, name: g.assignee.name } : null,
    updates: g.updates.map((u) => ({ ...u, author: u.author ? { name: u.author.name, role: u.author.role } : null })),
    duplicateOf,
    relatedReports: related,
    aiSuggestedTeam: aiTeam,
    messages,
    overdue: !!(g.dueAt && g.dueAt < now && OPEN_STATUSES.includes(g.status)),
    allowedTransitions,
    permissions: {
      canAssign: user.role === "OFFICE_ADMIN",
      canEditPriority: user.role === "OFFICE_ADMIN",
      canAddCitizenNote: user.role === "OFFICE_ADMIN",
      canAddInternalNote: user.role === "OFFICE_ADMIN" || user.role === "FIELD_OFFICER",
      canUpload: user.role === "OFFICE_ADMIN" || user.role === "FIELD_OFFICER",
      canRequestResolution: user.role === "FIELD_OFFICER",
      canScheduleVisit: user.role === "OFFICE_ADMIN" || user.role === "FIELD_OFFICER",
      readOnly: user.role === "MLA",
    },
  });
});

grievanceRouter.post("/:id/reveal-contact", async (req, res) => {
  const user = req.user!;
  const id = paramId(req);
  const policy = await contactPolicy(user);
  if (!policy.phones) throw forbidden("You are not authorised to view citizen contact details");
  const g = await prisma.grievance.findFirst({ where: { id, ...scopeWhere(user) }, include: { citizen: true } });
  if (!g || g.citizen.erasedAt) throw notFound();
  await audit({ tenantId: g.tenantId, actor: user, action: "citizen.contact_revealed", entityType: "Citizen", entityId: g.citizenId, details: { grievance: g.ticketNumber }, ip: req.ip });
  res.json({ name: g.citizen.name, phone: formatPhone(g.citizen.phone) });
});

grievanceRouter.post("/:id/status", async (req, res) => {
  const body = parseBody(
    z.object({
      to: z.enum(STATUSES as [GrievanceStatus, ...GrievanceStatus[]]),
      citizenMessage: z.string().max(1000).optional(),
      internalNote: z.string().max(2000).optional(),
      resolutionNotes: z.string().max(2000).optional(),
    }),
    req,
  );
  const g = await transitionStatus(tenantOf(req), paramId(req), req.user!, body);
  res.json({ id: g.id, status: g.status });
});

grievanceRouter.post("/:id/assign", requireRole("OFFICE_ADMIN"), async (req, res) => {
  const body = parseBody(
    z.object({
      teamId: z.string().min(1),
      assigneeId: z.string().min(1).nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
      note: z.string().max(500).optional(),
    }),
    req,
  );
  const g = await assignGrievance(tenantOf(req), paramId(req), req.user!, {
    teamId: body.teamId,
    assigneeId: body.assigneeId ?? null,
    dueAt: body.dueAt ? new Date(body.dueAt) : null,
    note: body.note,
  });
  res.json({ id: g.id, status: g.status, dueAt: g.dueAt });
});

grievanceRouter.post("/:id/priority", requireRole("OFFICE_ADMIN"), async (req, res) => {
  const body = parseBody(z.object({ priority: z.enum(PRIORITIES), reason: z.string().min(3).max(300) }), req);
  const g = await setPriority(tenantOf(req), paramId(req), req.user!, body.priority as Priority, body.reason);
  res.json({ id: g.id, priority: g.priority });
});

grievanceRouter.post("/:id/category", requireRole("OFFICE_ADMIN"), async (req, res) => {
  const tenantId = tenantOf(req);
  const { categoryId } = parseBody(z.object({ categoryId: z.string().min(1) }), req);
  const id = paramId(req);
  const [g, cat] = await Promise.all([
    prisma.grievance.findFirst({ where: { id, tenantId }, include: { category: true } }),
    prisma.category.findFirst({ where: { id: categoryId, tenantId } }),
  ]);
  if (!g || !cat) throw notFound();
  await prisma.$transaction(async (tx) => {
    await tx.grievance.update({ where: { id: g.id }, data: { categoryId: cat.id } });
    await tx.grievanceUpdate.create({ data: { tenantId, grievanceId: g.id, authorId: req.user!.id, visibility: "INTERNAL", kind: "NOTE", message: `Category changed ${g.category.nameEn} → ${cat.nameEn}` } });
    await audit({ tenantId, actor: req.user, action: "grievance.category", entityType: "Grievance", entityId: g.id, details: { from: g.category.code, to: cat.code } }, tx);
  });
  res.json({ ok: true });
});

grievanceRouter.post("/:id/notes", requireRole("OFFICE_ADMIN", "FIELD_OFFICER"), async (req, res) => {
  const body = parseBody(z.object({ message: z.string().min(2).max(2000), visibility: z.enum(["INTERNAL", "CITIZEN"]) }), req);
  if (body.visibility === "CITIZEN" && req.user!.role !== "OFFICE_ADMIN") throw forbidden("Only office administrators can message citizens");
  const u = await addNote(tenantOf(req), paramId(req), req.user!, body);
  res.status(201).json(u);
});

grievanceRouter.post("/:id/inspection", requireRole("FIELD_OFFICER", "OFFICE_ADMIN"), async (req, res) => {
  const body = parseBody(z.object({ notes: z.string().min(5).max(3000) }), req);
  const u = await addNote(tenantOf(req), paramId(req), req.user!, { message: body.notes, visibility: "INTERNAL", kind: "INSPECTION" });
  res.status(201).json(u);
});

grievanceRouter.post("/:id/field-visit", requireRole("FIELD_OFFICER", "OFFICE_ADMIN"), async (req, res) => {
  const body = parseBody(z.object({ when: z.string().datetime() }), req);
  const g = await scheduleFieldVisit(tenantOf(req), paramId(req), req.user!, new Date(body.when));
  res.json({ id: g.id, fieldVisitAt: g.fieldVisitAt });
});

grievanceRouter.post("/:id/request-resolution", requireRole("FIELD_OFFICER"), async (req, res) => {
  const body = parseBody(z.object({ notes: z.string().min(5).max(2000) }), req);
  const g = await requestResolution(tenantOf(req), paramId(req), req.user!, body.notes);
  res.json({ id: g.id, resolutionRequestedAt: g.resolutionRequestedAt });
});

grievanceRouter.get("/:id/ai-draft", requireRole("OFFICE_ADMIN"), async (req, res) => {
  const { intent } = parseQuery(z.object({ intent: z.string().max(300).optional() }), req);
  const d = await draftCitizenReply(paramId(req), tenantOf(req), intent);
  if (!d) throw notFound();
  res.json(d);
});

grievanceRouter.post("/:id/attachments", requireRole("OFFICE_ADMIN", "FIELD_OFFICER"), upload.single("file"), async (req, res) => {
  const user = req.user!;
  const tenantId = tenantOf(req);
  const id = paramId(req);
  const kind = z.enum(["BEFORE", "AFTER", "EVIDENCE"]).parse(req.body?.kind ?? "EVIDENCE");
  const g = await prisma.grievance.findFirst({ where: { id, ...scopeWhere(user) } });
  if (!g) throw notFound();
  if (!req.file) throw badRequest("No file uploaded");
  const mime = validateUpload(req.file.buffer, req.file.mimetype);
  const stored = await putObject(tenantId, req.file.buffer, mime);
  const att = await prisma.attachment.create({
    data: { tenantId, grievanceId: g.id, uploadedById: user.id, kind, fileName: safeFileName(req.file.originalname), mimeType: mime, source: "STAFF", ...stored },
  });
  await prisma.grievanceUpdate.create({
    data: { tenantId, grievanceId: g.id, authorId: user.id, visibility: "INTERNAL", kind: "EVIDENCE", message: `Uploaded ${kind.toLowerCase()} evidence: ${att.fileName}` },
  });
  await audit({ tenantId, actor: user, action: "attachment.upload", entityType: "Attachment", entityId: att.id, details: { grievance: g.ticketNumber, kind } });
  res.status(201).json({ id: att.id, kind: att.kind, fileName: att.fileName, mimeType: att.mimeType, sizeBytes: att.sizeBytes, createdAt: att.createdAt });
});

/** Private attachment download — tenant + role scoped, never a public URL. */
export const attachmentRouter = Router();
attachmentRouter.get("/:id", async (req, res) => {
  const user = req.user!;
  const tenantId = tenantOf(req);
  const att = await prisma.attachment.findFirst({ where: { id: paramId(req), tenantId }, include: { grievance: { select: { assigneeId: true } } } });
  if (!att || !att.grievanceId) throw notFound();
  if (user.role === "FIELD_OFFICER" && att.grievance?.assigneeId !== user.id) throw notFound();
  const buf = await readObject(att.storageKey);
  res.setHeader("content-type", att.mimeType);
  res.setHeader("content-disposition", `${req.query.download ? "attachment" : "inline"}; filename="${att.fileName.replace(/"/g, "")}"`);
  res.setHeader("cache-control", "private, no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.send(buf);
});
