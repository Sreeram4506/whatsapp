import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { STATUS_LABEL } from "../../lib/domain";
import { getProvider } from "./provider";
import { extractiveSummary, suggestCategory } from "./rules";

export { detectLanguage, recommendPriority, similarity } from "./rules";
export { getProvider } from "./provider";

const STAFF_SYSTEM = `You assist the grievance office of an elected representative (MLA) in Andhra Pradesh, India.
You help staff triage citizen complaints written in Telugu or English.
Rules you must follow:
- You only make suggestions. Staff decide. Never state that a complaint is rejected, approved, resolved, or eligible for any benefit.
- Never invent facts, numbers, names, dates, government decisions or official statistics. Use only the information provided.
- Keep personal details out of summaries unless needed to act (no phone numbers).
- Be concise, neutral and respectful.`;

/**
 * Generates advisory AI fields for a grievance. Runs after the citizen has already received
 * their confirmation, so model latency never blocks the WhatsApp conversation.
 */
export async function analyzeGrievance(grievanceId: string): Promise<void> {
  const g = await prisma.grievance.findUnique({
    where: { id: grievanceId },
    include: { category: true, village: true, mandal: true },
  });
  if (!g) return;
  const [categories, teams] = await Promise.all([
    prisma.category.findMany({ where: { tenantId: g.tenantId, active: true }, include: { defaultTeam: true } }),
    prisma.team.findMany({ where: { tenantId: g.tenantId, active: true } }),
  ]);

  // Deterministic baseline (always computed, used when no model is configured or the call fails)
  const kw = suggestCategory(g.description);
  const ruleCat = categories.find((c) => c.code === kw?.code) ?? g.category;
  let summary = extractiveSummary(g.description);
  let suggestedCategory = ruleCat.code;
  let suggestedTeamId = categories.find((c) => c.code === suggestedCategory)?.defaultTeamId ?? null;
  let providerLabel = "rules";

  const provider = getProvider();
  if (provider.live) {
    try {
      const raw = await provider.complete({
        system: STAFF_SYSTEM,
        maxTokens: 1500,
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary_en: { type: "string", description: "One or two sentence English summary for staff" },
            suggested_category_code: { type: "string", enum: categories.map((c) => c.code) },
            suggested_team_name: { type: "string", enum: teams.map((t) => t.name) },
          },
          required: ["summary_en", "suggested_category_code", "suggested_team_name"],
        },
        prompt: `Complaint (language: ${g.descriptionLanguage}):
"""${g.description}"""
Citizen-selected category: ${g.category.nameEn} (${g.category.code})
Location: ${g.village?.name ?? g.villageText ?? "unspecified"}, ${g.mandal.name} mandal. Landmark: ${g.landmark ?? "none"}
Available categories: ${categories.map((c) => `${c.code}=${c.nameEn}`).join("; ")}
Available office teams: ${teams.map((t) => `${t.name} (${t.department})`).join("; ")}
Return a staff summary in English, the most fitting category code and the most fitting team.`,
      });
      const parsed = JSON.parse(raw) as {
        summary_en?: string;
        suggested_category_code?: string;
        suggested_team_name?: string;
      };
      if (parsed.summary_en) summary = parsed.summary_en.slice(0, 600);
      if (parsed.suggested_category_code && categories.some((c) => c.code === parsed.suggested_category_code)) {
        suggestedCategory = parsed.suggested_category_code;
      }
      const team = teams.find((t) => t.name === parsed.suggested_team_name);
      if (team) suggestedTeamId = team.id;
      providerLabel = provider.label;
    } catch (err) {
      logger.warn({ err: (err as Error).message, grievanceId }, "AI analysis failed — using rule-based suggestions");
    }
  }

  await prisma.grievance.update({
    where: { id: g.id },
    data: {
      aiSummary: summary,
      aiSuggestedCategory: suggestedCategory,
      aiSuggestedTeamId: suggestedTeamId,
      aiProvider: providerLabel,
      aiGeneratedAt: new Date(),
    },
  });
}

export async function draftCitizenReply(grievanceId: string, tenantId: string, staffIntent?: string) {
  const g = await prisma.grievance.findFirst({
    where: { id: grievanceId, tenantId },
    include: { category: true, citizen: true, village: true, team: true },
  });
  if (!g) return null;
  const lang = g.citizen.preferredLanguage === "te" ? "te" : "en";
  const status = STATUS_LABEL[g.status][lang];
  const fallback =
    lang === "te"
      ? `నమస్కారం. మీ ఫిర్యాదు ${g.ticketNumber} (${g.category.nameTe}) ప్రస్తుత స్థితి: ${status}. ${staffIntent ? staffIntent + " " : ""}మరిన్ని వివరాలు అందిన వెంటనే తెలియజేస్తాము. – ఎమ్మెల్యే కార్యాలయం`
      : `Namaste. Your complaint ${g.ticketNumber} (${g.category.nameEn}) is currently: ${status}. ${staffIntent ? staffIntent + " " : ""}We will update you as soon as there is progress. – MLA Office`;

  const provider = getProvider();
  if (!provider.live) return { text: fallback, source: "template" as const, provider: provider.label };
  try {
    const text = await provider.complete({
      system: STAFF_SYSTEM,
      maxTokens: 800,
      prompt: `Draft a short WhatsApp reply (max 600 characters) to a citizen in ${lang === "te" ? "Telugu" : "English"}.
Ticket: ${g.ticketNumber}. Category: ${g.category.nameEn}. Village: ${g.village?.name ?? g.villageText ?? "-"}.
Current status: ${STATUS_LABEL[g.status].en}. Team: ${g.team?.name ?? "not yet assigned"}.
Staff wants to communicate: ${staffIntent || "a polite status update"}.
Do not promise dates, outcomes or benefits. Do not include phone numbers. Sign off as the MLA office.
Return only the message text.`,
    });
    return { text: text.slice(0, 1000), source: "ai" as const, provider: provider.label };
  } catch {
    return { text: fallback, source: "template" as const, provider: "rules (AI call failed)" };
  }
}

/**
 * Turns already-computed facts into a short narrative. The model never sees raw citizen records —
 * only aggregates — and is instructed not to add numbers that are not in the facts.
 */
export async function narrate(question: string, facts: unknown, ruleNarrative: string) {
  const provider = getProvider();
  if (!provider.live) return { text: ruleNarrative, source: "rules" as const, provider: provider.label };
  try {
    const text = await provider.complete({
      system: `${STAFF_SYSTEM}
You write briefings for the MLA from aggregated grievance data. Use ONLY numbers present in the FACTS JSON.
If the facts are insufficient to answer, say so plainly. Use short paragraphs or bullet points. Max 220 words.`,
      maxTokens: 1500,
      prompt: `QUESTION: ${question}\n\nFACTS (computed from the office database):\n${JSON.stringify(facts, null, 1)}`,
    });
    return { text, source: "ai" as const, provider: provider.label };
  } catch {
    return { text: ruleNarrative, source: "rules" as const, provider: "rules (AI call failed)" };
  }
}
