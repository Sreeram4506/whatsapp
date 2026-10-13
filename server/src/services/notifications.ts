import { Channel, GrievanceStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { formatIST } from "../lib/time";
import { STATUS_LABEL } from "../lib/domain";
import { t, Lang, MsgKey } from "./bot/i18n";
import { deliver, getConversation } from "./whatsapp/dispatcher";
import type { OutboundContent } from "./whatsapp/types";

function channelFor(source: Channel): Channel {
  return source === "SIMULATOR" ? "SIMULATOR" : "WHATSAPP";
}

/**
 * Sends a citizen-facing update about a grievance through the channel the citizen used.
 * Never throws — notification failures are recorded on the Message row and must not roll back case work.
 */
export async function notifyGrievance(
  grievanceId: string,
  event: GrievanceStatus | "NOTE",
  note?: string | null,
): Promise<void> {
  try {
    const g = await prisma.grievance.findUnique({
      where: { id: grievanceId },
      include: { tenant: true, citizen: true, team: true },
    });
    if (!g || g.citizen.erasedAt) return;
    const lang: Lang = g.citizen.preferredLanguage === "en" ? "en" : "te";
    const key = `n_${event}` as MsgKey;
    const vars = {
      ticket: g.ticketNumber,
      team: g.team ? `${g.team.name}` : lang === "te" ? "సంబంధిత బృందం" : "responsible team",
      note: note?.trim() || "",
    };
    let content: OutboundContent;
    try {
      content = { kind: "text", body: t(lang, key, vars).trim() };
    } catch {
      return; // no citizen message for this event (e.g. RECEIVED)
    }
    if (event === "RESOLVED") {
      content = {
        kind: "buttons",
        body: t(lang, "n_RESOLVED", vars).trim(),
        buttons: [
          { id: `fb:yes:${g.id}`, title: t(lang, "btnSolved") },
          { id: `fb:no:${g.id}`, title: t(lang, "btnNotSolved") },
        ],
      };
    } else if (event === "AWAITING_INFO") {
      content = {
        kind: "buttons",
        body: t(lang, "n_AWAITING_INFO", vars).trim(),
        buttons: [{ id: `info:${g.id}`, title: lang === "te" ? "ఇప్పుడు సమాధానం" : "Reply now" }],
      };
    }
    const conversation = await getConversation(g.tenantId, channelFor(g.source), g.citizen.phone);
    await deliver({
      tenant: g.tenant,
      conversation,
      contents: [content],
      grievanceId: g.id,
      proactive: true,
      optedOut: g.citizen.optedOut,
      language: lang,
      templateParams: [g.ticketNumber, event === "NOTE" ? (note ?? "") : STATUS_LABEL[event][lang]],
    });
  } catch (err) {
    logger.error({ err, grievanceId }, "Failed to notify citizen");
  }
}

export async function notifyAppointment(appointmentId: string): Promise<void> {
  try {
    const a = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { tenant: true, citizen: true },
    });
    if (!a || a.citizen.erasedAt) return;
    if (a.status !== "CONFIRMED" && a.status !== "CANCELLED") return;
    const lang: Lang = a.citizen.preferredLanguage === "en" ? "en" : "te";
    const body =
      a.status === "CONFIRMED"
        ? t(lang, "n_APPT_CONFIRMED", {
            ref: a.reference,
            when: a.scheduledAt ? formatIST(a.scheduledAt) : "",
            note: a.officeNote ?? "",
          })
        : t(lang, "n_APPT_CANCELLED", { ref: a.reference, note: a.officeNote ?? "" });
    // Appointments are requested over chat; use the channel of the citizen's most recent conversation.
    const convo = await prisma.conversation.findFirst({
      where: { tenantId: a.tenantId, citizenPhone: a.citizen.phone },
      orderBy: { updatedAt: "desc" },
    });
    const conversation = convo ?? (await getConversation(a.tenantId, "WHATSAPP", a.citizen.phone));
    await deliver({
      tenant: a.tenant,
      conversation,
      contents: [{ kind: "text", body: body.trim() }],
      proactive: true,
      optedOut: a.citizen.optedOut,
      language: lang,
      templateParams: [a.reference, a.status === "CONFIRMED" && a.scheduledAt ? formatIST(a.scheduledAt) : a.status],
    });
  } catch (err) {
    logger.error({ err, appointmentId }, "Failed to notify appointment");
  }
}
