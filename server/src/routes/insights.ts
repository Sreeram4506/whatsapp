import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { toCsv } from "../lib/csv";
import { badRequest } from "../lib/errors";
import { DONE_STATUSES, OPEN_STATUSES, STATUS_LABEL, tenantSettings } from "../lib/domain";
import { maskPhone, suppress } from "../lib/privacy";
import { isoDayIST } from "../lib/time";
import { requireRole, tenantOf } from "../middleware/auth";
import { paramId, parseBody, parseQuery } from "../middleware/validate";
import { askConstituency, getDashboard, getVillageIntelligence } from "../services/analytics";
import { getProvider } from "../services/ai";

export const insightsRouter = Router();
const leaders = requireRole("MLA", "OFFICE_ADMIN");

insightsRouter.get("/dashboard", leaders, async (req, res) => {
  const q = parseQuery(z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d)).default(30), mandalId: z.string().max(40).optional() }), req);
  res.json(await getDashboard(tenantOf(req), q));
});

insightsRouter.post("/ai/ask", leaders, async (req, res) => {
  const body = parseBody(z.object({ question: z.string().min(3).max(500), villageId: z.string().max(40).optional() }), req);
  const result = await askConstituency(tenantOf(req), body.question, { villageId: body.villageId });
  await audit({ tenantId: tenantOf(req), actor: req.user, action: "ai.ask", entityType: "Insight", details: { intent: result.intent, source: result.narrativeSource } });
  res.json(result);
});

insightsRouter.get("/ai/status", leaders, (_req, res) => {
  const p = getProvider();
  res.json({ provider: p.id, label: p.label, live: p.live });
});

insightsRouter.get("/villages/intelligence", leaders, async (req, res) => {
  const q = parseQuery(z.object({ days: z.coerce.number().int().min(7).max(365).default(90) }), req);
  res.json(await getVillageIntelligence(tenantOf(req), q.days));
});

/** Office staff may record verified village coordinates (e.g. from survey records). Never auto-generated. */
insightsRouter.patch("/villages/:id", requireRole("OFFICE_ADMIN"), async (req, res) => {
  const tenantId = tenantOf(req);
  const body = parseBody(
    z.object({ latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), source: z.string().min(3).max(120) }),
    req,
  );
  const v = await prisma.village.findFirst({ where: { id: paramId(req), tenantId } });
  if (!v) throw badRequest("Unknown village");
  await prisma.village.update({
    where: { id: v.id },
    data: { latitude: body.latitude, longitude: body.longitude, coordsVerifiedBy: body.latitude == null ? null : `${req.user!.name} — ${body.source}` },
  });
  await audit({ tenantId, actor: req.user, action: "village.coordinates", entityType: "Village", entityId: v.id, details: body });
  res.json({ ok: true });
});

// ── Reports ──────────────────────────────────────────────────────────────────

const exportQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  status: z.string().optional(),
  categoryId: z.string().max(40).optional(),
  mandalId: z.string().max(40).optional(),
});

insightsRouter.get("/reports/grievances.csv", leaders, async (req, res) => {
  const user = req.user!;
  const tenantId = tenantOf(req);
  const q = parseQuery(exportQuery, req);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const includeNames = user.role === "OFFICE_ADMIN" || tenantSettings(tenant).mlaCanViewCitizenContact;
  const rows = await prisma.grievance.findMany({
    where: {
      tenantId,
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:30`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59+05:30`) } : {}) } } : {}),
      ...(q.status ? { status: { in: q.status.split(",") as never } } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.mandalId ? { mandalId: q.mandalId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: { category: true, village: true, mandal: true, team: true, assignee: true, citizen: true },
  });
  const csv = toCsv(
    ["Ticket", "Created (IST date)", "Status", "Priority", "Category", "Mandal", "Village/Ward", "Landmark", "Team", "Field officer", "Due date", "Resolved date", "Escalation level", "Reopened", "Citizen rating", "Source", "Citizen name", "Citizen phone (masked)", "Summary"],
    rows.map((g) => [
      g.ticketNumber,
      isoDayIST(g.createdAt),
      STATUS_LABEL[g.status].en,
      g.priority,
      g.category.nameEn,
      g.mandal.name,
      g.village?.name ?? g.villageText ?? "",
      g.landmark ?? "",
      g.team?.name ?? "",
      g.assignee?.name ?? "",
      g.dueAt ? isoDayIST(g.dueAt) : "",
      g.resolvedAt ? isoDayIST(g.resolvedAt) : "",
      g.escalationLevel,
      g.reopenCount,
      g.feedbackRating ?? "",
      g.source,
      includeNames ? (g.citizen.erasedAt ? "[erased]" : g.citizen.name ?? "") : "[restricted]",
      maskPhone(g.citizen.phone),
      (g.aiSummary ?? g.description).replace(/\s+/g, " ").slice(0, 300),
    ]),
  );
  await audit({ tenantId, actor: user, action: "report.export_csv", entityType: "Report", details: { rows: rows.length, filters: q } });
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="grievances-${tenant.slug}-${isoDayIST(new Date())}.csv"`);
  res.send(csv);
});

/** Privacy-preserving aggregate: counts below 3 are suppressed. */
insightsRouter.get("/reports/aggregate.csv", leaders, async (req, res) => {
  const tenantId = tenantOf(req);
  const { by } = parseQuery(z.object({ by: z.enum(["village", "category", "mandal"]).default("village") }), req);
  const rows = await prisma.grievance.findMany({
    where: { tenantId },
    select: { status: true, category: { select: { nameEn: true } }, village: { select: { name: true } }, villageText: true, mandal: { select: { name: true } } },
  });
  const key = (r: (typeof rows)[number]) =>
    by === "category" ? r.category.nameEn : by === "mandal" ? r.mandal.name : `${r.village?.name ?? r.villageText ?? "Unspecified"} (${r.mandal.name})`;
  const m = new Map<string, { total: number; open: number; done: number }>();
  for (const r of rows) {
    const k = key(r);
    const e = m.get(k) ?? { total: 0, open: 0, done: 0 };
    e.total++;
    if (OPEN_STATUSES.includes(r.status)) e.open++;
    if (DONE_STATUSES.includes(r.status)) e.done++;
    m.set(k, e);
  }
  const csv = toCsv(
    [by[0].toUpperCase() + by.slice(1), "Total", "Open", "Resolved/Closed", "Resolution rate %"],
    [...m.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([k, e]) => [k, suppress(e.total), suppress(e.open), suppress(e.done), e.total >= 3 ? Math.round((e.done / e.total) * 100) : "—"]),
  );
  await audit({ tenantId, actor: req.user, action: "report.export_aggregate", entityType: "Report", details: { by } });
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="aggregate-by-${by}-${isoDayIST(new Date())}.csv"`);
  res.send(csv);
});

/** Briefings for the printable report page (daily / weekly / Monday review). */
insightsRouter.get("/reports/briefing", leaders, async (req, res) => {
  const tenantId = tenantOf(req);
  const { type } = parseQuery(z.object({ type: z.enum(["daily", "weekly", "monday"]).default("monday") }), req);
  const question =
    type === "monday"
      ? "Prepare the Monday grievance review."
      : type === "weekly"
        ? "What are the main problems reported this week?"
        : "Which complaints need urgent follow-up?";
  const [result, dashboard, tenant] = await Promise.all([
    askConstituency(tenantId, question),
    getDashboard(tenantId, { days: type === "daily" ? 7 : 30 }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);
  await audit({ tenantId, actor: req.user, action: "report.briefing", entityType: "Report", details: { type } });
  res.json({
    type,
    tenant: { officeName: tenant.officeName, constituency: tenant.constituency, district: tenant.district, isSampleBranding: tenant.isSampleBranding, isDemoData: tenant.isDemoData },
    kpis: dashboard.kpis,
    byCategory: dashboard.byCategory,
    teamWorkload: dashboard.teamWorkload,
    briefing: result,
  });
});
