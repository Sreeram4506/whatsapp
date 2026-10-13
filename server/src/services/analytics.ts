import { GrievanceStatus, Priority } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { DONE_STATUSES, OPEN_STATUSES, STATUS_LABEL } from "../lib/domain";
import { daysAgo, isoDayIST, startOfTodayIST } from "../lib/time";
import { narrate } from "./ai";

const MIN_RESOLUTION_SAMPLE = 5;
const isOpen = (s: GrievanceStatus) => OPEN_STATUSES.includes(s);
const isDone = (s: GrievanceStatus) => DONE_STATUSES.includes(s);
const round1 = (n: number) => Math.round(n * 10) / 10;

async function loadRows(tenantId: string, opts: { since?: Date; mandalId?: string } = {}) {
  return prisma.grievance.findMany({
    where: {
      tenantId,
      ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
      ...(opts.mandalId ? { mandalId: opts.mandalId } : {}),
    },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      priority: true,
      createdAt: true,
      resolvedAt: true,
      closedAt: true,
      dueAt: true,
      escalationLevel: true,
      reopenCount: true,
      feedbackRating: true,
      landmark: true,
      aiSummary: true,
      description: true,
      categoryId: true,
      teamId: true,
      villageId: true,
      villageText: true,
      mandalId: true,
      latitude: true,
      longitude: true,
      category: { select: { code: true, nameEn: true, emoji: true, isInfrastructure: true } },
      village: { select: { name: true } },
      mandal: { select: { name: true } },
      team: { select: { name: true, department: true } },
    },
  });
}
type Row = Awaited<ReturnType<typeof loadRows>>[number];

function villageName(r: Row) {
  return r.village?.name ?? (r.villageText ? `${r.villageText} (unlisted)` : "Unspecified");
}

function avgResolutionDays(rows: Row[]) {
  const done = rows.filter((r) => r.resolvedAt);
  if (done.length < MIN_RESOLUTION_SAMPLE) {
    return { value: null as number | null, sampleSize: done.length, sufficient: false, minimum: MIN_RESOLUTION_SAMPLE };
  }
  const days = done.map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 86400_000);
  return { value: round1(days.reduce((a, b) => a + b, 0) / days.length), sampleSize: done.length, sufficient: true, minimum: MIN_RESOLUTION_SAMPLE };
}

function groupCount<K extends string>(rows: Row[], key: (r: Row) => K) {
  const m = new Map<K, Row[]>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboard(tenantId: string, opts: { days: number; mandalId?: string }) {
  const now = new Date();
  const since = daysAgo(opts.days);
  const [all, tenant, pendingAppointments] = await Promise.all([
    loadRows(tenantId, { mandalId: opts.mandalId }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.appointment.count({ where: { tenantId, status: "REQUESTED" } }),
  ]);
  const inRange = all.filter((r) => r.createdAt >= since);
  const open = all.filter((r) => isOpen(r.status));
  const today = startOfTodayIST();
  const ratings = all.filter((r) => r.feedbackRating != null).map((r) => r.feedbackRating!);

  const kpis = {
    total: all.length,
    newToday: all.filter((r) => r.createdAt >= today).length,
    pending: open.length,
    highPriorityOpen: open.filter((r) => r.priority === "HIGH" || r.priority === "CRITICAL").length,
    criticalOpen: open.filter((r) => r.priority === "CRITICAL").length,
    overdue: open.filter((r) => r.dueAt && r.dueAt < now).length,
    escalated: open.filter((r) => r.escalationLevel > 0).length,
    resolved: all.filter((r) => isDone(r.status)).length,
    reopened: all.filter((r) => r.reopenCount > 0).length,
    avgResolutionDays: avgResolutionDays(inRange),
    satisfaction: ratings.length
      ? { average: round1(ratings.reduce((a, b) => a + b, 0) / ratings.length), responses: ratings.length }
      : { average: null, responses: 0 },
    pendingAppointments,
  };

  const byCategory = [...groupCount(inRange, (r) => r.category.code)].map(([code, rs]) => ({
    code,
    name: rs[0].category.nameEn,
    emoji: rs[0].category.emoji,
    total: rs.length,
    open: rs.filter((r) => isOpen(r.status)).length,
    resolved: rs.filter((r) => isDone(r.status)).length,
    resolutionRate: rs.length ? Math.round((rs.filter((r) => isDone(r.status)).length / rs.length) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  const byMandal = [...groupCount(inRange, (r) => r.mandal.name)].map(([name, rs]) => ({
    name,
    total: rs.length,
    open: rs.filter((r) => isOpen(r.status)).length,
    resolved: rs.filter((r) => isDone(r.status)).length,
  })).sort((a, b) => b.total - a.total);

  const villages = [...groupCount(all, (r) => `${villageName(r)}|${r.mandal.name}`)].map(([k, rs]) => {
    const [village, mandal] = k.split("|");
    return {
      village,
      mandal,
      open: rs.filter((r) => isOpen(r.status)).length,
      overdue: rs.filter((r) => isOpen(r.status) && r.dueAt && r.dueAt < now).length,
      total: rs.length,
    };
  });
  const topVillages = villages.sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 10);

  // Daily trend (IST days), zero-filled
  const trendMap = new Map<string, { date: string; received: number; resolved: number }>();
  for (let i = opts.days - 1; i >= 0; i--) {
    const d = isoDayIST(daysAgo(i, now));
    trendMap.set(d, { date: d, received: 0, resolved: 0 });
  }
  for (const r of all) {
    const c = trendMap.get(isoDayIST(r.createdAt));
    if (c) c.received++;
    if (r.resolvedAt) {
      const rr = trendMap.get(isoDayIST(r.resolvedAt));
      if (rr) rr.resolved++;
    }
  }

  const statusDist = (Object.keys(STATUS_LABEL) as GrievanceStatus[]).map((s) => ({
    status: s,
    label: STATUS_LABEL[s].en,
    count: all.filter((r) => r.status === s).length,
  }));

  const teamWorkload = [...groupCount(open, (r) => r.team?.name ?? "Unassigned")].map(([team, rs]) => ({
    team,
    department: rs[0].team?.department ?? "Awaiting assignment",
    open: rs.length,
    inProgress: rs.filter((r) => r.status === "IN_PROGRESS").length,
    overdue: rs.filter((r) => r.dueAt && r.dueAt < now).length,
    highPriority: rs.filter((r) => r.priority === "HIGH" || r.priority === "CRITICAL").length,
  })).sort((a, b) => b.open - a.open);

  const repeated = [...groupCount(inRange.filter((r) => r.category.isInfrastructure), (r) => `${villageName(r)}|${r.category.nameEn}|${r.mandal.name}`)]
    .filter(([, rs]) => rs.length >= 3)
    .map(([k, rs]) => {
      const [village, category, mandal] = k.split("|");
      return { village, mandal, category, complaints: rs.length, open: rs.filter((r) => isOpen(r.status)).length, latest: rs.map((r) => r.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] };
    })
    .sort((a, b) => b.complaints - a.complaints)
    .slice(0, 12);

  return {
    range: { days: opts.days, since: since.toISOString(), mandalId: opts.mandalId ?? null },
    kpis,
    byCategory,
    byMandal,
    topVillages,
    trend: [...trendMap.values()],
    statusDist,
    teamWorkload,
    repeated,
    dataNotes: {
      isDemoData: tenant.isDemoData,
      recordsInWorkspace: all.length,
      recordsInRange: inRange.length,
      generatedAt: now.toISOString(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Village intelligence
// ─────────────────────────────────────────────────────────────────────────────

export async function getVillageIntelligence(tenantId: string, days: number) {
  const now = new Date();
  const [rows, villages] = await Promise.all([
    loadRows(tenantId),
    prisma.village.findMany({ where: { tenantId }, include: { mandal: true }, orderBy: { name: "asc" } }),
  ]);
  const since = daysAgo(days);
  const byVillage = groupCount(rows, (r) => r.villageId ?? `text:${r.villageText ?? "?"}:${r.mandalId}`);
  const result = villages.map((v) => {
    const rs = byVillage.get(v.id) ?? [];
    const open = rs.filter((r) => isOpen(r.status));
    const recent = rs.filter((r) => r.createdAt >= since);
    const cats = [...groupCount(recent, (r) => r.category.nameEn)].map(([name, x]) => ({ name, count: x.length })).sort((a, b) => b.count - a.count);
    const overdue = open.filter((r) => r.dueAt && r.dueAt < now).length;
    const critical = open.filter((r) => r.priority === "CRITICAL").length;
    const high = open.filter((r) => r.priority === "HIGH").length;
    const reopened = rs.filter((r) => r.reopenCount > 0 && isOpen(r.status)).length;
    // Transparent visit-priority score
    const score = open.length + high * 2 + critical * 4 + overdue * 2 + reopened * 1.5;
    const reasons: string[] = [];
    if (critical) reasons.push(`${critical} critical open`);
    if (high) reasons.push(`${high} high-priority open`);
    if (overdue) reasons.push(`${overdue} overdue`);
    if (reopened) reasons.push(`${reopened} reopened`);
    const recurring = cats.filter((c) => c.count >= 3).map((c) => `${c.name} (${c.count} in ${days}d)`);
    return {
      id: v.id,
      village: v.name,
      villageTe: v.nameTe,
      kind: v.kind,
      mandal: v.mandal.name,
      total: rs.length,
      open: open.length,
      overdue,
      critical,
      high,
      resolved: rs.filter((r) => isDone(r.status)).length,
      recentCount: recent.length,
      topCategories: cats.slice(0, 3),
      recurring,
      score: round1(score),
      reasons,
      latitude: v.latitude,
      longitude: v.longitude,
      coordsVerifiedBy: v.coordsVerifiedBy,
    };
  });
  const unlisted = [...byVillage.entries()].filter(([k]) => k.startsWith("text:")).map(([, rs]) => ({ village: rs[0].villageText, mandal: rs[0].mandal.name, total: rs.length, open: rs.filter((r) => isOpen(r.status)).length }));

  const geoComplaints = rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({ id: r.id, ticket: r.ticketNumber, lat: r.latitude!, lng: r.longitude!, category: r.category.nameEn, status: r.status, priority: r.priority, village: villageName(r) }));

  return {
    villages: result.sort((a, b) => b.score - a.score),
    unlisted,
    geoComplaints,
    notes: {
      coordinates: "Map pins come only from locations citizens chose to share, or village coordinates entered and verified by office staff. No coordinates are generated.",
      scoreFormula: "score = open + 2×high + 4×critical + 2×overdue + 1.5×reopened",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ask Constituency AI
// ─────────────────────────────────────────────────────────────────────────────

export interface AskTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}
export interface AskResult {
  intent: string;
  title: string;
  narrative: string;
  narrativeSource: "ai" | "rules";
  provider: string;
  tables: AskTable[];
  recordsConsidered: number;
  isDemoData: boolean;
  caveats: string[];
  generatedAt: string;
}

const CATEGORY_WORDS: Record<string, string[]> = {
  ROADS: ["road", "roads", "pothole", "రోడ్డు", "రహదారి"],
  DRAINAGE: ["drain", "drainage", "sewage", "మురుగు", "డ్రైనేజీ"],
  WATER: ["water", "drinking", "తాగునీరు", "నీటి"],
  ELECTRICITY: ["electric", "power", "street light", "streetlight", "విద్యుత్", "కరెంట్"],
  EDUCATION: ["school", "education", "పాఠశాల"],
  HEALTH: ["health", "hospital", "phc", "ఆసుపత్రి"],
  PENSION: ["pension", "పింఛన్", "పెన్షన్"],
  SANITATION: ["sanitation", "garbage", "చెత్త"],
  HOUSING: ["housing", "house", "ఇల్లు"],
};

function detectIntent(q: string): string {
  const s = q.toLowerCase();
  if (/monday|weekly review|grievance review|సమీక్ష/.test(s)) return "monday_review";
  if (/field visit|visit briefing|briefing for|పర్యటన/.test(s)) return "village_briefing";
  if (/depart|workload|team|శాఖ/.test(s)) return "department_workload";
  if (/urgent|follow[- ]?up|overdue|escalat|అత్యవసర/.test(s)) return "urgent_followup";
  if (/village|villages|గ్రామ/.test(s) && /unresolved|highest|most|pending|open/.test(s)) return "top_villages";
  if (Object.values(CATEGORY_WORDS).some((ws) => ws.some((w) => s.includes(w)))) return "category_summary";
  if (/this week|main problems|top problems|reported|ఈ వారం/.test(s)) return "weekly_problems";
  return "overview";
}

const daysOpen = (r: Row) => Math.floor((Date.now() - r.createdAt.getTime()) / 86400_000);
const PRI_RANK: Record<Priority, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export async function askConstituency(tenantId: string, question: string, opts: { villageId?: string } = {}): Promise<AskResult> {
  const [rows, tenant] = await Promise.all([loadRows(tenantId), prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })]);
  const now = new Date();
  const intent = detectIntent(question);
  const open = rows.filter((r) => isOpen(r.status));
  const caveats: string[] = [];
  if (tenant.isDemoData) caveats.push("This workspace contains fictional demonstration data.");
  if (!rows.length) caveats.push("No grievances have been recorded yet, so there is nothing to analyse.");

  let title = "";
  let facts: Record<string, unknown> = {};
  let ruleText = "";
  const tables: AskTable[] = [];

  const week = rows.filter((r) => r.createdAt >= daysAgo(7));
  const prevWeek = rows.filter((r) => r.createdAt >= daysAgo(14) && r.createdAt < daysAgo(7));

  if (intent === "top_villages") {
    title = "Villages with the most unresolved grievances";
    const v = [...groupCount(open, (r) => `${villageName(r)}|${r.mandal.name}`)]
      .map(([k, rs]) => ({ village: k.split("|")[0], mandal: k.split("|")[1], open: rs.length, overdue: rs.filter((r) => r.dueAt && r.dueAt < now).length, high: rs.filter((r) => PRI_RANK[r.priority] >= 3).length }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 8);
    tables.push({ title, columns: ["Village", "Mandal", "Open", "High/Critical", "Overdue"], rows: v.map((x) => [x.village, x.mandal, x.open, x.high, x.overdue]) });
    facts = { totalOpen: open.length, villages: v };
    ruleText = v.length
      ? `${v[0].village} (${v[0].mandal}) has the most unresolved grievances (${v[0].open} open, ${v[0].overdue} overdue). ` +
        `The top ${v.length} villages together account for ${v.reduce((a, b) => a + b.open, 0)} of ${open.length} open grievances.`
      : "There are no unresolved grievances.";
  } else if (intent === "urgent_followup") {
    title = "Grievances needing urgent follow-up";
    const urgent = open
      .filter((r) => PRI_RANK[r.priority] >= 3 || (r.dueAt && r.dueAt < now) || r.escalationLevel > 0)
      .sort((a, b) => PRI_RANK[b.priority] - PRI_RANK[a.priority] || b.escalationLevel - a.escalationLevel || daysOpen(b) - daysOpen(a))
      .slice(0, 12);
    tables.push({
      title,
      columns: ["Ticket", "Category", "Village", "Priority", "Status", "Days open", "Overdue", "Escalation"],
      rows: urgent.map((r) => [r.ticketNumber, r.category.nameEn, villageName(r), r.priority, STATUS_LABEL[r.status].en, daysOpen(r), r.dueAt && r.dueAt < now ? "Yes" : "No", r.escalationLevel ? `L${r.escalationLevel}` : "—"]),
    });
    const crit = open.filter((r) => r.priority === "CRITICAL").length;
    const overdue = open.filter((r) => r.dueAt && r.dueAt < now).length;
    facts = { criticalOpen: crit, overdueOpen: overdue, escalated: open.filter((r) => r.escalationLevel > 0).length, listed: urgent.map((r) => ({ ticket: r.ticketNumber, category: r.category.nameEn, village: villageName(r), priority: r.priority, daysOpen: daysOpen(r) })) };
    ruleText = `${crit} critical and ${overdue} overdue grievances are open; ${open.filter((r) => r.escalationLevel > 0).length} have been escalated. The list below is ordered by priority, escalation and age.`;
  } else if (intent === "department_workload") {
    title = "Pending workload by department / team";
    const t = [...groupCount(open, (r) => r.team?.name ?? "Unassigned")]
      .map(([team, rs]) => ({ team, department: rs[0].team?.department ?? "—", open: rs.length, overdue: rs.filter((r) => r.dueAt && r.dueAt < now).length, oldest: Math.max(...rs.map(daysOpen)) }))
      .sort((a, b) => b.open - a.open);
    tables.push({ title, columns: ["Team", "Department", "Open", "Overdue", "Oldest (days)"], rows: t.map((x) => [x.team, x.department, x.open, x.overdue, x.oldest]) });
    facts = { teams: t };
    ruleText = t.length ? `${t[0].team} carries the largest pending workload (${t[0].open} open, ${t[0].overdue} overdue).` + (t.find((x) => x.team === "Unassigned") ? ` ${t.find((x) => x.team === "Unassigned")!.open} grievances are still unassigned.` : "") : "No pending workload.";
  } else if (intent === "category_summary") {
    const s = question.toLowerCase();
    const codes = Object.entries(CATEGORY_WORDS).filter(([, ws]) => ws.some((w) => s.includes(w))).map(([c]) => c);
    const sel = open.filter((r) => codes.includes(r.category.code));
    title = `Unresolved ${[...new Set(sel.map((r) => r.category.nameEn))].join(" & ") || "selected category"} grievances`;
    const byV = [...groupCount(sel, (r) => `${r.category.nameEn}|${villageName(r)}`)].map(([k, rs]) => ({ category: k.split("|")[0], village: k.split("|")[1], open: rs.length, oldest: Math.max(...rs.map(daysOpen)), highest: rs.map((r) => r.priority).sort((a, b) => PRI_RANK[b] - PRI_RANK[a])[0] })).sort((a, b) => b.open - a.open);
    tables.push({ title: "By village", columns: ["Category", "Village", "Open", "Highest priority", "Oldest (days)"], rows: byV.map((x) => [x.category, x.village, x.open, x.highest, x.oldest]) });
    tables.push({ title: "Oldest open items", columns: ["Ticket", "Category", "Village", "Summary", "Days open"], rows: sel.sort((a, b) => daysOpen(b) - daysOpen(a)).slice(0, 8).map((r) => [r.ticketNumber, r.category.nameEn, villageName(r), (r.aiSummary ?? r.description).slice(0, 90), daysOpen(r)]) });
    facts = { categories: codes, openCount: sel.length, overdue: sel.filter((r) => r.dueAt && r.dueAt < now).length, byVillage: byV.slice(0, 10) };
    ruleText = sel.length ? `${sel.length} grievances in these categories are unresolved across ${new Set(sel.map(villageName)).size} villages; ${sel.filter((r) => r.dueAt && r.dueAt < now).length} are overdue. ${byV[0] ? `${byV[0].village} has the most (${byV[0].open} ${byV[0].category}).` : ""}` : "No unresolved grievances in these categories.";
  } else if (intent === "weekly_problems") {
    title = "Main problems reported in the last 7 days";
    const cats = [...groupCount(week, (r) => r.category.nameEn)].map(([name, rs]) => ({ name, thisWeek: rs.length, previousWeek: prevWeek.filter((p) => p.category.nameEn === name).length })).sort((a, b) => b.thisWeek - a.thisWeek);
    tables.push({ title, columns: ["Category", "Last 7 days", "Previous 7 days", "Change"], rows: cats.map((c) => [c.name, c.thisWeek, c.previousWeek, c.thisWeek - c.previousWeek >= 0 ? `+${c.thisWeek - c.previousWeek}` : `${c.thisWeek - c.previousWeek}`]) });
    facts = { receivedLast7Days: week.length, receivedPrevious7Days: prevWeek.length, categories: cats };
    ruleText = week.length ? `${week.length} grievances were received in the last 7 days (previous week: ${prevWeek.length}). The most reported category was ${cats[0].name} (${cats[0].thisWeek}).` : "No grievances were received in the last 7 days.";
  } else if (intent === "village_briefing") {
    const villages = await prisma.village.findMany({ where: { tenantId }, include: { mandal: true } });
    const s = question.toLowerCase();
    const v = (opts.villageId && villages.find((x) => x.id === opts.villageId)) || villages.find((x) => s.includes(x.name.toLowerCase()) || (x.nameTe && question.includes(x.nameTe)));
    if (!v) {
      title = "Field visit briefing";
      ruleText = "Please select a village to prepare a field visit briefing.";
      caveats.push("No village was identified in the question.");
    } else {
      title = `Field visit briefing — ${v.name} (${v.mandal.name} mandal)`;
      const rs = rows.filter((r) => r.villageId === v.id);
      const vo = rs.filter((r) => isOpen(r.status)).sort((a, b) => PRI_RANK[b.priority] - PRI_RANK[a.priority] || daysOpen(b) - daysOpen(a));
      tables.push({ title: "Open grievances to inspect", columns: ["Ticket", "Category", "Priority", "Status", "Landmark", "Summary", "Days open"], rows: vo.map((r) => [r.ticketNumber, r.category.nameEn, r.priority, STATUS_LABEL[r.status].en, r.landmark ?? "—", (r.aiSummary ?? r.description).slice(0, 90), daysOpen(r)]) });
      const recentResolved = rs.filter((r) => r.resolvedAt && r.resolvedAt >= daysAgo(60));
      tables.push({ title: "Resolved in the last 60 days", columns: ["Ticket", "Category", "Resolved on"], rows: recentResolved.map((r) => [r.ticketNumber, r.category.nameEn, isoDayIST(r.resolvedAt!)]) });
      const cats = [...groupCount(rs, (r) => r.category.nameEn)].map(([n, x]) => ({ category: n, total: x.length, open: x.filter((r) => isOpen(r.status)).length }));
      facts = { village: v.name, mandal: v.mandal.name, totalGrievances: rs.length, open: vo.length, overdue: vo.filter((r) => r.dueAt && r.dueAt < now).length, categories: cats, resolvedLast60Days: recentResolved.length };
      ruleText = `${v.name} has ${vo.length} open grievances (${vo.filter((r) => r.dueAt && r.dueAt < now).length} overdue) out of ${rs.length} recorded. ` + (vo[0] ? `Start with ${vo[0].ticketNumber} (${vo[0].category.nameEn}, ${vo[0].priority}). ` : "") + `${recentResolved.length} were resolved in the last 60 days — consider confirming those with residents during the visit.`;
    }
  } else if (intent === "monday_review") {
    title = "Monday grievance review";
    const resolvedWeek = rows.filter((r) => r.resolvedAt && r.resolvedAt >= daysAgo(7));
    const overdue = open.filter((r) => r.dueAt && r.dueAt < now);
    const crit = open.filter((r) => r.priority === "CRITICAL").sort((a, b) => daysOpen(b) - daysOpen(a)).slice(0, 6);
    const appts = await prisma.appointment.count({ where: { tenantId, status: "REQUESTED" } });
    const topCats = [...groupCount(week, (r) => r.category.nameEn)].map(([n, x]) => [n, x.length] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topV = [...groupCount(open, (r) => villageName(r))].map(([n, x]) => [n, x.length] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    tables.push({ title: "Week at a glance", columns: ["Measure", "Value"], rows: [["Received (last 7 days)", week.length], ["Received (previous 7 days)", prevWeek.length], ["Resolved (last 7 days)", resolvedWeek.length], ["Open now", open.length], ["Overdue now", overdue.length], ["Escalated", open.filter((r) => r.escalationLevel > 0).length], ["Reopened by citizens (open)", open.filter((r) => r.reopenCount > 0).length], ["Appointment requests pending", appts]] });
    tables.push({ title: "Critical open grievances", columns: ["Ticket", "Category", "Village", "Days open", "Team"], rows: crit.map((r) => [r.ticketNumber, r.category.nameEn, villageName(r), daysOpen(r), r.team?.name ?? "Unassigned"]) });
    tables.push({ title: "Top categories this week", columns: ["Category", "Received"], rows: topCats });
    tables.push({ title: "Villages with most open grievances", columns: ["Village", "Open"], rows: topV });
    facts = { receivedLast7: week.length, receivedPrev7: prevWeek.length, resolvedLast7: resolvedWeek.length, openNow: open.length, overdueNow: overdue.length, criticalOpen: crit.length, pendingAppointments: appts, topCategories: topCats, topVillages: topV };
    ruleText = `Last week the office received ${week.length} grievances (previous week ${prevWeek.length}) and resolved ${resolvedWeek.length}. ${open.length} remain open, of which ${overdue.length} are overdue. ` + (topCats[0] ? `${topCats[0][0]} was the most reported category. ` : "") + (topV[0] ? `${topV[0][0]} has the most open grievances (${topV[0][1]}). ` : "") + `${appts} appointment requests await confirmation.`;
  } else {
    title = "Constituency overview";
    const cats = [...groupCount(open, (r) => r.category.nameEn)].map(([n, x]) => [n, x.length] as [string, number]).sort((a, b) => b[1] - a[1]);
    tables.push({ title: "Open grievances by category", columns: ["Category", "Open"], rows: cats });
    facts = { totalRecorded: rows.length, open: open.length, resolvedOrClosed: rows.filter((r) => isDone(r.status)).length, overdue: open.filter((r) => r.dueAt && r.dueAt < now).length, openByCategory: cats };
    ruleText = `${rows.length} grievances recorded; ${open.length} open and ${rows.filter((r) => isDone(r.status)).length} resolved or closed. ` + (cats[0] ? `${cats[0][0]} has the most open grievances (${cats[0][1]}).` : "") + `\n\nTry asking: "Which villages have the highest number of unresolved issues?", "Which complaints need urgent follow-up?", "Prepare the Monday grievance review."`;
    caveats.push("The question did not match a specific analysis, so a general overview is shown.");
  }

  const n = await narrate(question, facts, ruleText);
  if (n.source === "ai") caveats.push("The narrative is an AI-generated interpretation of the computed figures in the tables. Verify before acting.");
  return {
    intent,
    title,
    narrative: n.text,
    narrativeSource: n.source,
    provider: n.provider,
    tables,
    recordsConsidered: rows.length,
    isDemoData: tenant.isDemoData,
    caveats,
    generatedAt: now.toISOString(),
  };
}
