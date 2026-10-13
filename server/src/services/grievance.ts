import { Channel, GrievanceStatus, Priority, Tenant, UpdateVisibility } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { formatTicket, nextSequence } from "../lib/ticket";
import { addDays, daysAgo } from "../lib/time";
import { OPEN_STATUSES, STATUS_ROLE, TRANSITIONS, tenantSettings } from "../lib/domain";
import type { AuthUser } from "../middleware/auth";
import { analyzeGrievance, detectLanguage, recommendPriority } from "./ai";
import { notifyGrievance } from "./notifications";

export interface CreateGrievanceInput {
  tenant: Tenant;
  citizenId: string;
  source: Channel;
  categoryId: string;
  mandalId: string;
  villageId?: string | null;
  villageText?: string | null;
  landmark?: string | null;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  urgency: "NORMAL" | "URGENT" | "SAFETY";
  attachmentIds?: string[];
  possibleDuplicateOfId?: string | null;
  actor?: AuthUser | null;
}

export async function createGrievance(input: CreateGrievanceInput) {
  const { tenant } = input;
  const [category, mandal] = await Promise.all([
    prisma.category.findFirst({ where: { id: input.categoryId, tenantId: tenant.id } }),
    prisma.mandal.findFirst({ where: { id: input.mandalId, tenantId: tenant.id } }),
  ]);
  if (!category || !mandal) throw badRequest("Unknown category or mandal for this workspace");
  if (input.villageId) {
    const v = await prisma.village.findFirst({ where: { id: input.villageId, tenantId: tenant.id, mandalId: mandal.id } });
    if (!v) throw badRequest("Unknown village for this mandal");
  }

  const similarOpen = await prisma.grievance.count({
    where: {
      tenantId: tenant.id,
      categoryId: category.id,
      status: { in: OPEN_STATUSES },
      createdAt: { gte: daysAgo(14) },
      ...(input.villageId ? { villageId: input.villageId } : { mandalId: mandal.id }),
    },
  });
  const { priority, reasons } = recommendPriority({
    description: input.description,
    urgency: input.urgency,
    categoryDefault: category.defaultPriority,
    categoryName: category.nameEn,
    similarOpenInVillage: similarOpen,
  });

  const year = new Date().getFullYear();
  const grievance = await prisma.$transaction(async (tx) => {
    const seq = await nextSequence(tx, tenant.id, year);
    const g = await tx.grievance.create({
      data: {
        tenantId: tenant.id,
        ticketNumber: formatTicket(tenant.ticketPrefix, year, seq),
        citizenId: input.citizenId,
        source: input.source,
        categoryId: category.id,
        mandalId: mandal.id,
        villageId: input.villageId ?? null,
        villageText: input.villageText ?? null,
        landmark: input.landmark ?? null,
        description: input.description.trim(),
        descriptionLanguage: detectLanguage(input.description),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        urgency: input.urgency,
        priority,
        priorityReasons: reasons,
        possibleDuplicateOfId: input.possibleDuplicateOfId ?? null,
      },
    });
    if (input.attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: { id: { in: input.attachmentIds }, tenantId: tenant.id, grievanceId: null },
        data: { grievanceId: g.id },
      });
    }
    await tx.grievanceUpdate.create({
      data: {
        tenantId: tenant.id,
        grievanceId: g.id,
        authorId: input.actor?.id ?? null,
        visibility: "CITIZEN",
        kind: "SYSTEM",
        message:
          input.source === "STAFF_ENTRY"
            ? "Complaint recorded by office staff on behalf of the citizen."
            : `Complaint received via ${input.source === "SIMULATOR" ? "WhatsApp simulator (demo)" : "WhatsApp"}.`,
        toStatus: "RECEIVED",
      },
    });
    await audit(
      {
        tenantId: tenant.id,
        actor: input.actor,
        actorLabel: input.actor ? undefined : `citizen:${input.source.toLowerCase()}`,
        action: "grievance.create",
        entityType: "Grievance",
        entityId: g.id,
        details: { ticket: g.ticketNumber, priority, source: input.source },
      },
      tx,
    );
    return g;
  });

  // Advisory AI enrichment runs out of band so the citizen gets an immediate confirmation.
  void analyzeGrievance(grievance.id).catch((err) => logger.warn({ err }, "analyzeGrievance failed"));
  return grievance;
}

async function loadForActor(tenantId: string, id: string, actor: AuthUser) {
  const g = await prisma.grievance.findFirst({ where: { id, tenantId } });
  if (!g) throw notFound("Grievance not found");
  if (actor.role === "FIELD_OFFICER" && g.assigneeId !== actor.id) throw notFound("Grievance not found");
  return g;
}

export interface TransitionInput {
  to: GrievanceStatus;
  /** Message shown to the citizen (optional) */
  citizenMessage?: string;
  /** Internal note for staff (optional) */
  internalNote?: string;
  resolutionNotes?: string;
}

export async function transitionStatus(tenantId: string, id: string, actor: AuthUser, input: TransitionInput) {
  const g = await loadForActor(tenantId, id, actor);
  const allowed = TRANSITIONS[g.status];
  if (!allowed.includes(input.to)) {
    throw badRequest(`Cannot move a case from ${g.status} to ${input.to}`, { allowed });
  }
  if (!STATUS_ROLE[input.to].includes(actor.role)) {
    throw forbidden(`Your role cannot set status ${input.to}`);
  }
  if (input.to === "ASSIGNED" && !g.teamId) throw badRequest("Assign a team before setting status to ASSIGNED");
  if (input.to === "RESOLVED" && !input.resolutionNotes?.trim()) {
    throw badRequest("Resolution notes are required to mark a case resolved");
  }
  if ((input.to === "CLOSED" || input.to === "AWAITING_INFO") && !(input.citizenMessage || input.internalNote)?.trim()) {
    throw badRequest(input.to === "CLOSED" ? "A closure reason is required" : "Describe the information needed");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.grievance.update({
      where: { id: g.id },
      data: {
        status: input.to,
        ...(input.to === "RESOLVED"
          ? { resolvedAt: now, resolvedById: actor.id, resolutionNotes: input.resolutionNotes!.trim() }
          : {}),
        ...(input.to === "CLOSED" ? { closedAt: now } : {}),
        ...(input.to === "REOPENED"
          ? { reopenCount: { increment: 1 }, resolvedAt: null, closedAt: null, citizenConfirmed: null }
          : {}),
      },
    });
    await tx.grievanceUpdate.create({
      data: {
        tenantId,
        grievanceId: g.id,
        authorId: actor.id,
        visibility: "CITIZEN",
        kind: "STATUS_CHANGE",
        message: input.citizenMessage?.trim() || input.resolutionNotes?.trim() || `Status changed to ${input.to}`,
        fromStatus: g.status,
        toStatus: input.to,
      },
    });
    if (input.internalNote?.trim()) {
      await tx.grievanceUpdate.create({
        data: { tenantId, grievanceId: g.id, authorId: actor.id, visibility: "INTERNAL", kind: "NOTE", message: input.internalNote.trim() },
      });
    }
    await audit(
      {
        tenantId,
        actor,
        action: "grievance.status",
        entityType: "Grievance",
        entityId: g.id,
        details: { from: g.status, to: input.to, ticket: g.ticketNumber },
      },
      tx,
    );
    return u;
  });

  const note =
    input.to === "RESOLVED" ? input.resolutionNotes : input.citizenMessage ?? (input.to === "AWAITING_INFO" ? input.internalNote : null);
  void notifyGrievance(g.id, input.to, note);
  return updated;
}

export interface AssignInput {
  teamId: string;
  assigneeId?: string | null;
  dueAt?: Date | null;
  note?: string;
}

export async function assignGrievance(tenantId: string, id: string, actor: AuthUser, input: AssignInput) {
  if (actor.role !== "OFFICE_ADMIN") throw forbidden();
  const g = await loadForActor(tenantId, id, actor);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const team = await prisma.team.findFirst({ where: { id: input.teamId, tenantId, active: true } });
  if (!team) throw badRequest("Unknown team");
  if (input.assigneeId) {
    const officer = await prisma.user.findFirst({
      where: { id: input.assigneeId, tenantId, role: "FIELD_OFFICER", active: true },
    });
    if (!officer) throw badRequest("Assignee must be an active field officer in this workspace");
  }
  const sla = tenantSettings(tenant).slaDays[g.priority];
  const dueAt = input.dueAt ?? g.dueAt ?? addDays(new Date(), sla);
  const moveToAssigned = ["RECEIVED", "VERIFICATION", "REOPENED", "AWAITING_INFO"].includes(g.status);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.grievance.update({
      where: { id: g.id },
      data: {
        teamId: team.id,
        assigneeId: input.assigneeId ?? null,
        dueAt,
        ...(moveToAssigned ? { status: "ASSIGNED" as const } : {}),
      },
    });
    await tx.grievanceUpdate.create({
      data: {
        tenantId,
        grievanceId: g.id,
        authorId: actor.id,
        visibility: "INTERNAL",
        kind: "ASSIGNMENT",
        message: `Assigned to ${team.name}${input.assigneeId ? "" : " (no field officer yet)"}; due ${dueAt.toISOString().slice(0, 10)}.${
          input.note ? ` ${input.note}` : ""
        }`,
        ...(moveToAssigned ? { fromStatus: g.status, toStatus: "ASSIGNED" as const } : {}),
      },
    });
    if (moveToAssigned) {
      await tx.grievanceUpdate.create({
        data: {
          tenantId,
          grievanceId: g.id,
          authorId: actor.id,
          visibility: "CITIZEN",
          kind: "STATUS_CHANGE",
          message: `Assigned to ${team.name}`,
          fromStatus: g.status,
          toStatus: "ASSIGNED",
        },
      });
    }
    await audit(
      {
        tenantId,
        actor,
        action: "grievance.assign",
        entityType: "Grievance",
        entityId: g.id,
        details: { teamId: team.id, assigneeId: input.assigneeId ?? null, dueAt: dueAt.toISOString() },
      },
      tx,
    );
    return u;
  });
  if (moveToAssigned) void notifyGrievance(g.id, "ASSIGNED");
  return updated;
}

export async function setPriority(tenantId: string, id: string, actor: AuthUser, priority: Priority, reason: string) {
  if (actor.role !== "OFFICE_ADMIN") throw forbidden();
  const g = await loadForActor(tenantId, id, actor);
  return prisma.$transaction(async (tx) => {
    const u = await tx.grievance.update({ where: { id: g.id }, data: { priority, priorityOverriddenBy: actor.id } });
    await tx.grievanceUpdate.create({
      data: {
        tenantId,
        grievanceId: g.id,
        authorId: actor.id,
        visibility: "INTERNAL",
        kind: "PRIORITY",
        message: `Priority changed ${g.priority} → ${priority}: ${reason}`,
      },
    });
    await audit({ tenantId, actor, action: "grievance.priority", entityType: "Grievance", entityId: g.id, details: { from: g.priority, to: priority, reason } }, tx);
    return u;
  });
}

export async function addNote(
  tenantId: string,
  id: string,
  actor: AuthUser,
  input: { message: string; visibility: UpdateVisibility; kind?: string },
) {
  if (actor.role === "MLA" || actor.role === "PLATFORM_ADMIN") throw forbidden();
  const g = await loadForActor(tenantId, id, actor);
  const kind = input.kind ?? "NOTE";
  const update = await prisma.$transaction(async (tx) => {
    const u = await tx.grievanceUpdate.create({
      data: { tenantId, grievanceId: g.id, authorId: actor.id, visibility: input.visibility, kind, message: input.message.trim() },
    });
    await tx.grievance.update({ where: { id: g.id }, data: { updatedAt: new Date() } });
    await audit({ tenantId, actor, action: `grievance.${kind.toLowerCase()}`, entityType: "Grievance", entityId: g.id, details: { visibility: input.visibility } }, tx);
    return u;
  });
  if (input.visibility === "CITIZEN") void notifyGrievance(g.id, "NOTE", input.message);
  return update;
}

export async function scheduleFieldVisit(tenantId: string, id: string, actor: AuthUser, when: Date) {
  const g = await loadForActor(tenantId, id, actor);
  if (actor.role !== "FIELD_OFFICER" && actor.role !== "OFFICE_ADMIN") throw forbidden();
  return prisma.$transaction(async (tx) => {
    const u = await tx.grievance.update({ where: { id: g.id }, data: { fieldVisitAt: when } });
    await tx.grievanceUpdate.create({
      data: { tenantId, grievanceId: g.id, authorId: actor.id, visibility: "INTERNAL", kind: "FIELD_VISIT", message: `Field visit scheduled for ${when.toISOString().slice(0, 16).replace("T", " ")} UTC` },
    });
    await audit({ tenantId, actor, action: "grievance.field_visit", entityType: "Grievance", entityId: g.id, details: { when: when.toISOString() } }, tx);
    return u;
  });
}

/** Field officer reports work complete. Only the office can mark the case RESOLVED. */
export async function requestResolution(tenantId: string, id: string, actor: AuthUser, notes: string) {
  if (actor.role !== "FIELD_OFFICER") throw forbidden();
  const g = await loadForActor(tenantId, id, actor);
  if (!["IN_PROGRESS", "ASSIGNED"].includes(g.status)) throw badRequest("Only active cases can be submitted for resolution");
  return prisma.$transaction(async (tx) => {
    const u = await tx.grievance.update({ where: { id: g.id }, data: { resolutionRequestedAt: new Date(), resolutionNotes: notes.trim() } });
    await tx.grievanceUpdate.create({
      data: { tenantId, grievanceId: g.id, authorId: actor.id, visibility: "INTERNAL", kind: "RESOLUTION_REQUEST", message: `Work reported complete — awaiting office confirmation. ${notes.trim()}` },
    });
    await audit({ tenantId, actor, action: "grievance.resolution_request", entityType: "Grievance", entityId: g.id }, tx);
    return u;
  });
}

// ── Citizen-initiated actions (from WhatsApp) ─────────────────────────────

export async function citizenConfirmResolution(tenantId: string, grievanceId: string, citizenId: string, rating?: number) {
  const g = await prisma.grievance.findFirst({ where: { id: grievanceId, tenantId, citizenId } });
  if (!g) return null;
  return prisma.$transaction(async (tx) => {
    const u = await tx.grievance.update({
      where: { id: g.id },
      data: {
        citizenConfirmed: true,
        ...(rating ? { feedbackRating: rating } : {}),
        ...(g.status === "RESOLVED" ? { status: "CLOSED" as const, closedAt: new Date() } : {}),
      },
    });
    await tx.grievanceUpdate.create({
      data: {
        tenantId,
        grievanceId: g.id,
        visibility: "CITIZEN",
        kind: "CITIZEN_FEEDBACK",
        message: rating ? `Citizen confirmed the resolution and rated the support ${rating}/5.` : "Citizen confirmed the resolution.",
        ...(g.status === "RESOLVED" ? { fromStatus: "RESOLVED" as const, toStatus: "CLOSED" as const } : {}),
      },
    });
    await audit({ tenantId, actorLabel: "citizen", action: "grievance.citizen_confirm", entityType: "Grievance", entityId: g.id, details: { rating } }, tx);
    return u;
  });
}

export async function citizenReopen(tenantId: string, grievanceId: string, citizenId: string, reason: string) {
  const g = await prisma.grievance.findFirst({ where: { id: grievanceId, tenantId, citizenId } });
  if (!g || !["RESOLVED", "CLOSED"].includes(g.status)) return null;
  return prisma.$transaction(async (tx) => {
    const u = await tx.grievance.update({
      where: { id: g.id },
      data: { status: "REOPENED", reopenCount: { increment: 1 }, citizenConfirmed: false, resolvedAt: null, closedAt: null },
    });
    await tx.grievanceUpdate.create({
      data: { tenantId, grievanceId: g.id, visibility: "CITIZEN", kind: "REOPEN", message: `Citizen reported the problem is not solved: ${reason.trim()}`, fromStatus: g.status, toStatus: "REOPENED" },
    });
    await audit({ tenantId, actorLabel: "citizen", action: "grievance.citizen_reopen", entityType: "Grievance", entityId: g.id }, tx);
    return u;
  });
}

export async function citizenAddInfo(tenantId: string, grievanceId: string, citizenId: string, text: string) {
  const g = await prisma.grievance.findFirst({ where: { id: grievanceId, tenantId, citizenId } });
  if (!g) return null;
  await prisma.$transaction([
    prisma.grievanceUpdate.create({
      data: { tenantId, grievanceId: g.id, visibility: "CITIZEN", kind: "CITIZEN_REPLY", message: text.trim().slice(0, 2000) },
    }),
    prisma.grievance.update({ where: { id: g.id }, data: { updatedAt: new Date() } }),
  ]);
  return g;
}

// ── Escalation sweep ──────────────────────────────────────────────────────

/** Escalates overdue open cases: level 1 when overdue, level 2 after the tenant's threshold. Idempotent. */
export async function runEscalationSweep(now = new Date(), tenantId?: string) {
  const tenants = await prisma.tenant.findMany({ where: { active: true, ...(tenantId ? { id: tenantId } : {}) } });
  let escalated = 0;
  for (const tenant of tenants) {
    const s = tenantSettings(tenant);
    const overdue = await prisma.grievance.findMany({
      where: { tenantId: tenant.id, status: { in: OPEN_STATUSES }, dueAt: { lt: now }, escalationLevel: { lt: 2 } },
      select: { id: true, dueAt: true, escalationLevel: true, ticketNumber: true },
    });
    for (const g of overdue) {
      const hours = (now.getTime() - g.dueAt!.getTime()) / 3600_000;
      const level = hours >= s.escalationAfterOverdueHours ? 2 : 1;
      if (level <= g.escalationLevel) continue;
      await prisma.$transaction(async (tx) => {
        await tx.grievance.update({ where: { id: g.id }, data: { escalationLevel: level } });
        await tx.grievanceUpdate.create({
          data: {
            tenantId: tenant.id,
            grievanceId: g.id,
            visibility: "INTERNAL",
            kind: "ESCALATION",
            message:
              level === 1
                ? `Overdue — escalated to level 1 (office administrator review).`
                : `Overdue by more than ${s.escalationAfterOverdueHours}h — escalated to level 2 (MLA attention).`,
          },
        });
        await audit({ tenantId: tenant.id, actorLabel: "system:escalation", action: "grievance.escalate", entityType: "Grievance", entityId: g.id, details: { level, ticket: g.ticketNumber } }, tx);
      });
      escalated++;
    }
  }
  return escalated;
}
