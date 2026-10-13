import { Prisma, Priority } from "@prisma/client";

/** Starter configuration for a new MLA workspace. Every item is editable afterwards. */
export const DEFAULT_TEAMS = [
  { name: "Roads & Buildings", department: "Roads & Buildings (R&B) / Panchayat Raj Engineering" },
  { name: "Water & Sanitation", department: "Rural Water Supply & Sanitation / Municipal Public Health" },
  { name: "Electricity", department: "Electricity Distribution Company (DISCOM) liaison" },
  { name: "Welfare & Pensions", department: "Village/Ward Secretariat welfare liaison" },
  { name: "Health & Education", department: "Health and School Education liaison" },
  { name: "General Grievances", department: "MLA office — general cell" },
];

export const DEFAULT_CATEGORIES: {
  code: string;
  nameEn: string;
  nameTe: string;
  emoji: string;
  team: string;
  priority: Priority;
  infra: boolean;
}[] = [
  { code: "ROADS", nameEn: "Roads & bridges", nameTe: "రోడ్లు & వంతెనలు", emoji: "🛣️", team: "Roads & Buildings", priority: "MEDIUM", infra: true },
  { code: "DRAINAGE", nameEn: "Drainage & sewage", nameTe: "మురుగు కాలువలు", emoji: "🚧", team: "Water & Sanitation", priority: "MEDIUM", infra: true },
  { code: "WATER", nameEn: "Drinking water", nameTe: "తాగునీరు", emoji: "🚰", team: "Water & Sanitation", priority: "HIGH", infra: true },
  { code: "ELECTRICITY", nameEn: "Electricity & lights", nameTe: "విద్యుత్ & వీధి దీపాలు", emoji: "💡", team: "Electricity", priority: "MEDIUM", infra: true },
  { code: "SANITATION", nameEn: "Sanitation & garbage", nameTe: "పారిశుద్ధ్యం & చెత్త", emoji: "🧹", team: "Water & Sanitation", priority: "LOW", infra: true },
  { code: "HEALTH", nameEn: "Healthcare", nameTe: "ఆరోగ్యం", emoji: "🏥", team: "Health & Education", priority: "HIGH", infra: false },
  { code: "EDUCATION", nameEn: "Education & schools", nameTe: "విద్య & పాఠశాలలు", emoji: "🏫", team: "Health & Education", priority: "MEDIUM", infra: false },
  { code: "PENSION", nameEn: "Pensions & welfare", nameTe: "పింఛన్లు & సంక్షేమం", emoji: "👵", team: "Welfare & Pensions", priority: "MEDIUM", infra: false },
  { code: "HOUSING", nameEn: "Housing & land", nameTe: "ఇళ్లు & స్థలాలు", emoji: "🏠", team: "General Grievances", priority: "LOW", infra: false },
  { code: "OTHER", nameEn: "Other issue", nameTe: "ఇతర సమస్య", emoji: "📌", team: "General Grievances", priority: "LOW", infra: false },
];

export async function applyTenantTemplate(tx: Prisma.TransactionClient, tenantId: string) {
  const teams = new Map<string, string>();
  for (const t of DEFAULT_TEAMS) {
    const team = await tx.team.create({ data: { tenantId, ...t } });
    teams.set(t.name, team.id);
  }
  let i = 0;
  for (const c of DEFAULT_CATEGORIES) {
    await tx.category.create({
      data: {
        tenantId,
        code: c.code,
        nameEn: c.nameEn,
        nameTe: c.nameTe,
        emoji: c.emoji,
        defaultTeamId: teams.get(c.team),
        defaultPriority: c.priority,
        isInfrastructure: c.infra,
        sortOrder: ++i,
      },
    });
  }
  return teams;
}
