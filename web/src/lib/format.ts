export const fmtDate = (d: string | Date | null | undefined, withTime = false) => {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
    timeZone: "Asia/Kolkata",
  }).format(new Date(d));
};

export const fmtTime = (d: string | Date) =>
  new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    .format(new Date(d))
    .toLowerCase();

export const relative = (d: string | Date) => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
};

export const daysSince = (d: string | Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export const STATUS_META: Record<string, { label: string; tone: string }> = {
  RECEIVED: { label: "Received", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  VERIFICATION: { label: "Verification", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  ASSIGNED: { label: "Assigned", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  IN_PROGRESS: { label: "In progress", tone: "bg-teal-50 text-teal-800 ring-teal-200" },
  AWAITING_INFO: { label: "Awaiting info", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  RESOLVED: { label: "Resolved", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  CLOSED: { label: "Closed", tone: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  REOPENED: { label: "Reopened", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export const PRIORITY_META: Record<string, { label: string; tone: string; dot: string }> = {
  CRITICAL: { label: "Critical", tone: "bg-red-50 text-red-700 ring-red-200", dot: "bg-critical" },
  HIGH: { label: "High", tone: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-serious" },
  MEDIUM: { label: "Medium", tone: "bg-yellow-50 text-yellow-800 ring-yellow-200", dot: "bg-warning" },
  LOW: { label: "Low", tone: "bg-slate-50 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const ROLE_LABEL: Record<string, string> = {
  PLATFORM_ADMIN: "Platform administrator",
  OFFICE_ADMIN: "Office administrator",
  MLA: "MLA (executive view)",
  FIELD_OFFICER: "Field officer",
};

export const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  SIMULATOR: "WhatsApp (simulated)",
  STAFF_ENTRY: "Office entry",
};

export const DELIVERY_META: Record<string, { label: string; tone: string }> = {
  SIMULATED: { label: "Simulated (not sent)", tone: "bg-violet-50 text-violet-700 ring-violet-200" },
  SENT: { label: "Sent", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  DELIVERED: { label: "Delivered", tone: "bg-teal-50 text-teal-700 ring-teal-200" },
  READ: { label: "Read", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FAILED: { label: "Failed", tone: "bg-red-50 text-red-700 ring-red-200" },
  NOT_CONFIGURED: { label: "Not sent — WhatsApp not configured", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  SUPPRESSED: { label: "Suppressed (opted out)", tone: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  QUEUED: { label: "Queued", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  RECEIVED: { label: "Received", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
};
