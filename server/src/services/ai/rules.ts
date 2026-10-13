import { Priority } from "@prisma/client";
import { PRIORITY_ORDER } from "../../lib/domain";

/** Telugu Unicode block U+0C00–U+0C7F */
export function detectLanguage(text: string): "te" | "en" {
  const te = (text.match(/[ఀ-౿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return te > 0 && te >= latin * 0.3 ? "te" : "en";
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ROADS: ["road", "pothole", "potholes", "bridge", "culvert", "rasta", "రోడ్డు", "రహదారి", "గుంత", "గుంతలు", "వంతెన"],
  DRAINAGE: ["drain", "drainage", "sewage", "gutter", "overflow", "stagnant", "మురుగు", "కాలువ", "డ్రైనేజీ", "నీరు నిలిచి"],
  WATER: ["drinking water", "water supply", "tap", "borewell", "bore well", "pipeline", "tanker", "తాగునీరు", "నీటి సరఫరా", "నల్లా", "బోరు", "కుళాయి"],
  ELECTRICITY: ["electricity", "power", "current", "transformer", "street light", "streetlight", "voltage", "wire", "కరెంట్", "విద్యుత్", "ట్రాన్స్‌ఫార్మర్", "వీధి దీపం", "వీధి దీపాలు"],
  EDUCATION: ["school", "teacher", "college", "classroom", "mid-day meal", "students", "పాఠశాల", "బడి", "ఉపాధ్యాయ", "విద్యార్థులు"],
  HEALTH: ["hospital", "phc", "doctor", "medicine", "ambulance", "health", "nurse", "ఆసుపత్రి", "వైద్య", "మందులు", "అంబులెన్స్"],
  PENSION: ["pension", "old age", "widow", "pension amount", "పింఛన్", "పెన్షన్", "వృద్ధాప్య"],
  SANITATION: ["garbage", "waste", "dustbin", "cleaning", "mosquito", "చెత్త", "పారిశుద్ధ్యం", "దోమలు"],
  HOUSING: ["house", "housing", "patta", "site", "ఇల్లు", "ఇళ్ల", "పట్టా", "స్థలం"],
};

export function suggestCategory(text: string): { code: string; matched: string[] } | null {
  const t = text.toLowerCase();
  let best: { code: string; matched: string[] } | null = null;
  for (const [code, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = words.filter((w) => t.includes(w.toLowerCase()));
    if (matched.length && (!best || matched.length > best.matched.length)) best = { code, matched };
  }
  return best;
}

const SAFETY_WORDS = [
  "live wire", "electric shock", "electrocut", "sparking", "fallen wire", "collapse", "collapsed", "open manhole",
  "flood", "fire", "accident", "dangerous", "snake", "కరెంట్ షాక్", "తీగ తెగి", "తీగలు తెగి", "కూలిపో", "వరద",
  "మ్యాన్‌హోల్", "ప్రమాదం", "ప్రమాదకర", "నిప్పు",
];
const ESSENTIAL_WORDS = [
  "no water", "no drinking water", "without water", "contaminated", "dirty water", "no power", "no electricity",
  "hospital", "ambulance", "medicine", "pregnant", "నీళ్లు రావడం లేదు", "నీరు రావడం లేదు",
  "కలుషిత", "తాగునీరు లేదు", "తాగునీరు రావడం లేదు", "కరెంట్ లేదు", "ఆసుపత్రి", "గర్భిణి",
];
const VULNERABLE_WORDS = [
  "elderly", "old age", "senior citizen", "widow", "disabled", "handicapped", "pregnant",
  "వృద్ధ", "వితంతు", "దివ్యాంగ", "వికలాంగ", "గర్భిణి",
];

function raise(p: Priority, levels = 1): Priority {
  const i = Math.min(PRIORITY_ORDER.length - 1, PRIORITY_ORDER.indexOf(p) + levels);
  return PRIORITY_ORDER[i];
}
function atLeast(p: Priority, min: Priority): Priority {
  return PRIORITY_ORDER.indexOf(p) >= PRIORITY_ORDER.indexOf(min) ? p : min;
}

export interface PriorityInput {
  description: string;
  urgency: "NORMAL" | "URGENT" | "SAFETY";
  categoryDefault: Priority;
  categoryName: string;
  similarOpenInVillage: number; // open complaints in same village+category in last 14 days
}

/**
 * Transparent priority rules. Every rule that fires adds a human-readable reason, which is
 * stored with the case and shown to staff. Staff can always override.
 */
export function recommendPriority(input: PriorityInput): { priority: Priority; reasons: string[] } {
  const t = input.description.toLowerCase();
  const reasons: string[] = [`Category default for ${input.categoryName}: ${input.categoryDefault}`];
  let p = input.categoryDefault;

  const safety = SAFETY_WORDS.filter((w) => t.includes(w.toLowerCase()));
  if (safety.length) {
    p = "CRITICAL";
    reasons.push(`Possible public-safety risk mentioned ("${safety.slice(0, 3).join('", "')}") → CRITICAL`);
  } else if (input.urgency === "SAFETY") {
    p = atLeast(p, "HIGH");
    reasons.push("Citizen flagged a safety risk → at least HIGH");
  }
  if (input.urgency === "URGENT") {
    p = atLeast(p, "HIGH");
    reasons.push("Citizen marked the complaint as urgent → at least HIGH");
  }
  const essential = ESSENTIAL_WORDS.filter((w) => t.includes(w.toLowerCase()));
  if (essential.length && p !== "CRITICAL") {
    p = atLeast(p, "HIGH");
    reasons.push(`Essential service affected ("${essential.slice(0, 3).join('", "')}") → at least HIGH`);
  }
  const vulnerable = VULNERABLE_WORDS.filter((w) => t.includes(w.toLowerCase()));
  if (vulnerable.length && p !== "CRITICAL") {
    p = raise(p);
    reasons.push(`Vulnerable person mentioned ("${vulnerable[0]}") → raised one level`);
  }
  if (input.similarOpenInVillage >= 3 && p !== "CRITICAL") {
    p = raise(p);
    reasons.push(`${input.similarOpenInVillage} similar open complaints in the same village (14 days) → raised one level`);
  }
  return { priority: p, reasons };
}

/** Deterministic extractive summary: first sentence, trimmed. */
export function extractiveSummary(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const first = clean.split(/(?<=[.!?।])\s/)[0] ?? clean;
  const s = first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first;
  return s;
}

/** Token-overlap similarity for duplicate suggestions (language-agnostic, deterministic). */
export function similarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
