/** Masks a phone number for display to staff who are not authorised to see it in full. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.startsWith("bsuid:")) return "WhatsApp username user (no number shared)";
  if (phone.startsWith("erased-")) return "[erased]";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  return `+${digits.slice(0, 2)} ${"•".repeat(Math.max(0, digits.length - 6))}${digits.slice(-4)}`;
}

export function formatPhone(phone: string): string {
  if (phone.startsWith("bsuid:")) return "No phone number shared (WhatsApp username)";
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

export function maskName(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .map((p) => (p.length ? p[0] + "•".repeat(Math.min(4, Math.max(1, p.length - 1))) : p))
    .join(" ");
}

/** k-anonymity style suppression for aggregated public/MLA reports */
export const SMALL_COUNT_THRESHOLD = 3;
export function suppress(n: number): number | string {
  return n > 0 && n < SMALL_COUNT_THRESHOLD ? `<${SMALL_COUNT_THRESHOLD}` : n;
}
