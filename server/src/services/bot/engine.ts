import crypto from "node:crypto";
import { Channel, Citizen, GuidanceType, Tenant } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../lib/prisma";
import { audit } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { formatIST, daysAgo } from "../../lib/time";
import { maskPhone } from "../../lib/privacy";
import { normalizeTicket, TICKET_PATTERN } from "../../lib/ticket";
import { OPEN_STATUSES, STATUS_LABEL, tenantSettings } from "../../lib/domain";
import { similarity } from "../ai";
import {
  citizenAddInfo,
  citizenConfirmResolution,
  citizenReopen,
  createGrievance,
} from "../grievance";
import type { InboundInput, ListRow, OutboundContent } from "../whatsapp/types";
import { Lang, MsgKey, t } from "./i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Draft {
  name?: string;
  nameChange?: boolean;
  mandalId?: string;
  villageId?: string | null;
  villageText?: string | null;
  page?: number;
  categoryId?: string;
  description?: string;
  dupId?: string | null;
  possibleDuplicateOfId?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attachmentIds?: string[];
  urgency?: "NORMAL" | "URGENT" | "SAFETY";
}

export interface ConvData {
  draft?: Draft;
  resumeState?: string;
  gType?: GuidanceType;
  apptPurpose?: string;
  apptDate?: string;
  targetGid?: string;
}

export interface BotCtx {
  tenant: Tenant;
  citizen: Citizen;
  channel: Channel;
  state: string;
  data: ConvData;
  language: Lang | null;
  out: OutboundContent[];
}

const lang = (c: BotCtx): Lang => c.language ?? "te";
const say = (c: BotCtx, key: MsgKey, vars: Record<string, string | number> = {}): void => {
  c.out.push({ kind: "text", body: t(lang(c), key, vars) });
};

const GREETINGS = new Set([
  "hi", "hii", "hello", "hey", "menu", "start", "help", "namaste", "namaskaram", "0", "home",
  "నమస్కారం", "నమస్తే", "హాయ్", "హలో", "మెనూ", "మెను",
]);
const CANCEL = new Set(["cancel", "exit", "quit", "రద్దు", "రద్దు చేయండి"]);
const STOP = new Set(["stop", "unsubscribe", "opt out", "optout", "ఆపు", "ఆపండి"]);
const OPTIN = new Set(["start", "subscribe", "opt in", "optin"]);

const COMPLAINT_STEP_LABEL: Record<string, { en: string; te: string }> = {
  c_name: { en: "name", te: "పేరు" },
  c_mandal: { en: "mandal", te: "మండలం" },
  c_village: { en: "village", te: "గ్రామం" },
  c_village_text: { en: "village", te: "గ్రామం" },
  c_category: { en: "category", te: "విభాగం" },
  c_description: { en: "description", te: "వివరణ" },
  c_duplicate: { en: "similar complaint check", te: "ఇలాంటి ఫిర్యాదు" },
  c_landmark: { en: "landmark", te: "గుర్తు ప్రదేశం" },
  c_location: { en: "location", te: "ప్రదేశం" },
  c_media: { en: "photos", te: "ఫోటోలు" },
  c_urgency: { en: "urgency", te: "అత్యవసరత" },
  c_confirm: { en: "confirmation", te: "నిర్ధారణ" },
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFC").replace(/[!.?,।]+$/g, "").replace(/\s+/g, " ").trim();
}

function fuzzyPick<T>(items: T[], text: string, names: (x: T) => (string | null | undefined)[]): T | null {
  const q = norm(text).replace(/\s/g, "");
  if (q.length < 2) return null;
  const hits = items.filter((it) =>
    names(it).some((n) => {
      if (!n) return false;
      const m = norm(n).replace(/\s/g, "");
      return m === q || (q.length >= 3 && (m.includes(q) || q.includes(m)));
    }),
  );
  return hits.length === 1 ? hits[0] : null;
}

/** Fits any number of options into WhatsApp's 10-row list limit with paging. */
function paged(
  c: BotCtx,
  rows: ListRow[],
  page: number,
  prefix: string,
  extra?: ListRow,
): ListRow[] {
  const cap = 10 - (extra ? 1 : 0);
  if (rows.length <= cap) return extra ? [...rows, extra] : rows;
  const size = cap - 1;
  const pages = Math.ceil(rows.length / size);
  const p = ((page % pages) + pages) % pages;
  const slice = rows.slice(p * size, p * size + size);
  const nav: ListRow =
    p < pages - 1
      ? { id: `${prefix}:more:${p + 1}`, title: t(lang(c), "more"), description: t(lang(c), "moreD") }
      : { id: `${prefix}:more:0`, title: t(lang(c), "firstPage") };
  return extra ? [...slice, nav, extra] : [...slice, nav];
}

function list(c: BotCtx, body: string, button: string, rows: ListRow[], footer?: string) {
  c.out.push({
    kind: "list",
    body,
    button,
    footer,
    sections: [{ title: t(lang(c), "menuSection"), rows }],
  });
}

function buttons(c: BotCtx, body: string, btns: { id: string; title: string }[]) {
  c.out.push({ kind: "buttons", body, buttons: btns });
}

function menuButton(c: BotCtx) {
  return { id: "nav:menu", title: t(lang(c), "btnMenu") };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts — what the bot says on entering a state
// ─────────────────────────────────────────────────────────────────────────────

const PROMPTS: Record<string, (c: BotCtx) => Promise<void> | void> = {
  idle: (c) => showWelcome(c),
  lang_select: (c) => {
    buttons(c, t("en", "langPrompt", { office: c.tenant.officeName }), [
      { id: "lang:te", title: "తెలుగు" },
      { id: "lang:en", title: "English" },
    ]);
  },
  c_resume: (c) => {
    const step = COMPLAINT_STEP_LABEL[c.data.resumeState ?? ""]?.[lang(c)] ?? "";
    buttons(c, t(lang(c), "resume", { step }), [
      { id: "resume:continue", title: t(lang(c), "btnContinue") },
      { id: "resume:new", title: t(lang(c), "btnStartNew") },
      menuButton(c),
    ]);
  },
  c_consent: (c) => {
    buttons(c, t(lang(c), "consent", { privacyUrl: privacyUrl(c) }), [
      { id: "consent:yes", title: t(lang(c), "btnAgree") },
      { id: "consent:no", title: t(lang(c), "btnDisagree") },
    ]);
  },
  c_name: (c) => {
    if (c.citizen.name && !c.data.draft?.nameChange) {
      buttons(c, t(lang(c), "askNameKnown", { name: c.citizen.name }), [
        { id: "name:keep", title: t(lang(c), "btnYes") },
        { id: "name:change", title: t(lang(c), "btnChangeName") },
      ]);
    } else say(c, "askName");
  },
  c_mandal: async (c) => {
    const mandals = await prisma.mandal.findMany({ where: { tenantId: c.tenant.id }, orderBy: { name: "asc" } });
    const rows = mandals.map((m) => ({ id: `mandal:${m.id}`, title: lang(c) === "te" && m.nameTe ? m.nameTe : m.name }));
    list(
      c,
      t(lang(c), "askMandal", { district: c.tenant.district, constituency: c.tenant.constituency }),
      t(lang(c), "btnMandal"),
      paged(c, rows, c.data.draft?.page ?? 0, "mandal"),
    );
  },
  c_village: async (c) => {
    const d = c.data.draft!;
    const [mandal, villages] = await Promise.all([
      prisma.mandal.findUnique({ where: { id: d.mandalId! } }),
      prisma.village.findMany({ where: { tenantId: c.tenant.id, mandalId: d.mandalId! }, orderBy: { name: "asc" } }),
    ]);
    const rows = villages.map((v) => ({
      id: `village:${v.id}`,
      title: lang(c) === "te" && v.nameTe ? v.nameTe : v.name,
      description: v.kind === "WARD" ? (lang(c) === "te" ? "వార్డు" : "Ward") : undefined,
    }));
    list(
      c,
      t(lang(c), "askVillage", { mandal: (lang(c) === "te" && mandal?.nameTe) || mandal?.name || "" }),
      t(lang(c), "btnVillage"),
      paged(c, rows, d.page ?? 0, "village", { id: "village:other", title: t(lang(c), "villageOther") }),
    );
  },
  c_village_text: (c) => say(c, "askVillageText"),
  c_category: async (c) => {
    const cats = await prisma.category.findMany({
      where: { tenantId: c.tenant.id, active: true },
      orderBy: { sortOrder: "asc" },
    });
    const rows = cats.map((k) => ({
      id: `cat:${k.id}`,
      title: `${k.emoji} ${lang(c) === "te" ? k.nameTe : k.nameEn}`,
    }));
    list(c, t(lang(c), "askCategory"), t(lang(c), "btnCategory"), paged(c, rows, c.data.draft?.page ?? 0, "cat"));
  },
  c_description: (c) => say(c, "askDescription"),
  c_duplicate: async (c) => {
    const dup = await prisma.grievance.findUnique({
      where: { id: c.data.draft!.dupId! },
      include: { category: true, village: true },
    });
    if (!dup) return go(c, "c_landmark");
    buttons(
      c,
      t(lang(c), "duplicate", {
        category: lang(c) === "te" ? dup.category.nameTe : dup.category.nameEn,
        village: (lang(c) === "te" && dup.village?.nameTe) || dup.village?.name || dup.villageText || "",
        ticket: dup.ticketNumber,
        status: STATUS_LABEL[dup.status][lang(c)],
        date: formatIST(dup.createdAt, false),
      }),
      [
        { id: "dup:mine", title: t(lang(c), "btnRegisterMine") },
        { id: "dup:cancel", title: t(lang(c), "btnCancel") },
      ],
    );
  },
  c_landmark: (c) => buttons(c, t(lang(c), "askLandmark"), [{ id: "skip", title: t(lang(c), "btnSkip") }]),
  c_location: (c) => buttons(c, t(lang(c), "askLocation"), [{ id: "skip", title: t(lang(c), "btnSkip") }]),
  c_media: (c) =>
    buttons(c, t(lang(c), "askMedia", { mb: config.MAX_UPLOAD_MB }), [
      { id: "media:done", title: t(lang(c), "btnDone") },
      { id: "skip", title: t(lang(c), "btnSkip") },
    ]),
  c_urgency: (c) =>
    buttons(c, t(lang(c), "askUrgency"), [
      { id: "urg:NORMAL", title: t(lang(c), "u_NORMAL") },
      { id: "urg:URGENT", title: t(lang(c), "u_URGENT") },
      { id: "urg:SAFETY", title: t(lang(c), "u_SAFETY") },
    ]),
  c_confirm: async (c) => {
    const d = c.data.draft!;
    const L = lang(c);
    const [mandal, village, cat] = await Promise.all([
      prisma.mandal.findUnique({ where: { id: d.mandalId! } }),
      d.villageId ? prisma.village.findUnique({ where: { id: d.villageId } }) : null,
      prisma.category.findUnique({ where: { id: d.categoryId! } }),
    ]);
    const np = t(L, "notProvided");
    buttons(
      c,
      t(L, "confirm", {
        name: d.name ?? "",
        mobile: maskPhone(c.citizen.phone),
        district: c.tenant.district,
        constituency: c.tenant.constituency,
        mandal: (L === "te" && mandal?.nameTe) || mandal?.name || "",
        village: (L === "te" && village?.nameTe) || village?.name || d.villageText || np,
        category: cat ? (L === "te" ? cat.nameTe : cat.nameEn) : "",
        landmark: d.landmark || np,
        location: d.latitude != null ? t(L, "shared") : np,
        attachments: String(d.attachmentIds?.length ?? 0),
        urgency: t(L, `u_${d.urgency ?? "NORMAL"}` as MsgKey),
        description: (d.description ?? "").slice(0, 500),
      }),
      [
        { id: "confirm:submit", title: t(L, "btnSubmit") },
        { id: "confirm:restart", title: t(L, "btnStartOver") },
        { id: "confirm:cancel", title: t(L, "btnCancel") },
      ],
    );
  },
  track_ticket_input: (c) =>
    say(c, "askTicket", { example: `${c.tenant.ticketPrefix}-${new Date().getFullYear()}-000123` }),
  info_reply: (c) => buttons(c, t(lang(c), "awaitingAsk"), [menuButton(c)]),
  fb_rating: (c) =>
    list(c, t(lang(c), "askRating"), t(lang(c), "btnRate"), [
      { id: "rate:5", title: t(lang(c), "rating5") },
      { id: "rate:4", title: t(lang(c), "rating4") },
      { id: "rate:3", title: t(lang(c), "rating3") },
      { id: "rate:2", title: t(lang(c), "rating2") },
      { id: "rate:1", title: t(lang(c), "rating1") },
    ]),
  reopen_reason: (c) => say(c, "askReopen"),
  a_purpose: (c) => say(c, "askApptPurpose"),
  a_date: (c) => {
    const rows: ListRow[] = upcomingWorkingDays(6).map((d) => ({ id: `ad:${d.iso}`, title: d.label[lang(c)] }));
    list(c, t(lang(c), "askApptDate"), t(lang(c), "btnDate"), rows);
  },
  a_slot: (c) =>
    buttons(c, t(lang(c), "askApptSlot"), [
      { id: "slot:MORNING", title: t(lang(c), "slotMorning") },
      { id: "slot:AFTERNOON", title: t(lang(c), "slotAfternoon") },
      { id: "slot:EVENING", title: t(lang(c), "slotEvening") },
    ]),
};

async function go(c: BotCtx, state: string) {
  c.state = state;
  const p = PROMPTS[state];
  if (p) await p(c);
}

function reset(c: BotCtx) {
  c.state = "idle";
  c.data = {};
}

function privacyUrl(c: BotCtx) {
  return `${config.PUBLIC_WEB_URL.replace(/\/$/, "")}/privacy/${c.tenant.slug}`;
}

function showWelcome(c: BotCtx) {
  reset(c);
  const L = lang(c);
  const sample = c.tenant.isSampleBranding ? t(L, "sampleNote") + "\n" : "";
  c.out.push({
    kind: "list",
    body: t(L, "welcome", { office: c.tenant.officeName, sample }).replace(/\n\n+/g, "\n\n"),
    button: t(L, "menuButton"),
    footer: t(L, "menuFooter").replace(/\*/g, ""),
    sections: [
      {
        title: t(L, "menuSection"),
        rows: [
          { id: "menu:register", title: t(L, "m_register"), description: t(L, "m_register_d") },
          { id: "menu:track", title: t(L, "m_track"), description: t(L, "m_track_d") },
          { id: "menu:schemes", title: t(L, "m_schemes"), description: t(L, "m_schemes_d") },
          { id: "menu:certs", title: t(L, "m_certs"), description: t(L, "m_certs_d") },
          { id: "menu:appt", title: t(L, "m_appt"), description: t(L, "m_appt_d") },
          { id: "menu:contact", title: t(L, "m_contact"), description: t(L, "m_contact_d") },
          { id: "menu:lang", title: t(L, "m_lang"), description: t(L, "m_lang_d") },
        ],
      },
    ],
  });
  c.state = "menu";
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu actions
// ─────────────────────────────────────────────────────────────────────────────

const MENU_ORDER = ["register", "track", "schemes", "certs", "appt", "contact", "lang"];

async function menuChoice(c: BotCtx, choice: string) {
  switch (choice) {
    case "register":
      return startComplaint(c);
    case "track":
      return startTrack(c);
    case "schemes":
      return startGuidance(c, "SCHEME");
    case "certs":
      return startGuidance(c, "CERTIFICATE");
    case "appt":
      c.data = {};
      return go(c, "a_purpose");
    case "contact": {
      reset(c);
      const L = lang(c);
      buttons(
        c,
        t(L, "contact", {
          office: c.tenant.officeName,
          sample: c.tenant.isSampleBranding ? t(L, "sampleNote") : "",
          address: c.tenant.officeAddress ?? "—",
          hours: c.tenant.officeHours ?? "—",
          phone: c.tenant.officePhone ?? "—",
          privacyUrl: privacyUrl(c),
        }),
        [menuButton(c)],
      );
      return;
    }
    case "lang":
      c.data = {};
      return go(c, "lang_select");
    default:
      return showWelcome(c);
  }
}

async function startComplaint(c: BotCtx) {
  c.data = { draft: { attachmentIds: [] } };
  const s = tenantSettings(c.tenant);
  const consentCurrent = await prisma.consentRecord.findFirst({
    where: { citizenId: c.citizen.id, type: "PROCESSING_GRANTED", noticeVersion: s.privacyNoticeVersion },
  });
  return go(c, consentCurrent ? "c_name" : "c_consent");
}

async function startTrack(c: BotCtx) {
  reset(c);
  const L = lang(c);
  const mine = await prisma.grievance.findMany({
    where: { tenantId: c.tenant.id, citizenId: c.citizen.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { category: true },
  });
  if (!mine.length) {
    buttons(c, t(L, "noTickets"), [
      { id: "menu:register", title: t(L, "m_register").slice(0, 20) },
      menuButton(c),
    ]);
    return;
  }
  const rows: ListRow[] = mine.map((g) => ({
    id: `trk:${g.id}`,
    title: g.ticketNumber,
    description: `${L === "te" ? g.category.nameTe : g.category.nameEn} · ${STATUS_LABEL[g.status][L]}`,
  }));
  rows.push({ id: "trk:type", title: t(L, "typeTicketRow") });
  list(c, t(L, "trackPick"), t(L, "btnTickets"), rows);
  c.state = "track_select";
}

async function showTicket(c: BotCtx, gid: string) {
  const L = lang(c);
  const g = await prisma.grievance.findFirst({
    where: { id: gid, tenantId: c.tenant.id, citizenId: c.citizen.id },
    include: {
      category: true,
      village: true,
      team: true,
      updates: { where: { visibility: "CITIZEN" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  reset(c);
  if (!g) return say(c, "ticketNotFound", { ticket: "" });
  const last = g.updates[0];
  say(c, "ticketStatus", {
    ticket: g.ticketNumber,
    category: L === "te" ? g.category.nameTe : g.category.nameEn,
    village: (L === "te" && g.village?.nameTe) || g.village?.name || g.villageText || "—",
    created: formatIST(g.createdAt),
    status: STATUS_LABEL[g.status][L],
    team: g.team?.name ?? t(L, "notAssigned"),
    last: last ? `${formatIST(last.createdAt)} — ${last.message.slice(0, 200)}` : t(L, "noUpdates"),
  });
  if (g.status === "RESOLVED") {
    buttons(c, t(L, "resolvedAsk"), [
      { id: `fb:yes:${g.id}`, title: t(L, "btnSolved") },
      { id: `fb:no:${g.id}`, title: t(L, "btnNotSolved") },
      menuButton(c),
    ]);
  } else if (g.status === "AWAITING_INFO") {
    c.data = { targetGid: g.id };
    await go(c, "info_reply");
  } else {
    buttons(c, "👇", [
      { id: "menu:track", title: t(L, "btnMyComplaints") },
      menuButton(c),
    ]);
  }
}

async function startGuidance(c: BotCtx, type: GuidanceType) {
  reset(c);
  const L = lang(c);
  const items = await prisma.guidanceArticle.findMany({
    where: { tenantId: c.tenant.id, type, status: { not: "ARCHIVED" } },
    orderBy: { sortOrder: "asc" },
    take: 10,
  });
  if (!items.length) {
    buttons(c, t(L, "noGuidance"), [menuButton(c)]);
    return;
  }
  list(
    c,
    t(L, type === "SCHEME" ? "guidancePickScheme" : "guidancePickCert"),
    t(L, "btnView"),
    items.map((a) => ({
      id: `gd:${a.id}`,
      title: L === "te" ? a.titleTe : a.titleEn,
      description: (L === "te" ? a.summaryTe : a.summaryEn).slice(0, 72),
    })),
  );
  c.state = "g_list";
  c.data = { gType: type };
}

async function showGuidance(c: BotCtx, id: string) {
  const L = lang(c);
  const a = await prisma.guidanceArticle.findFirst({ where: { id, tenantId: c.tenant.id, status: { not: "ARCHIVED" } } });
  reset(c);
  if (!a) return showWelcome(c);
  const steps = (L === "te" ? a.stepsTe : a.stepsEn).map((s, i) => `${i + 1}. ${s}`).join("\n");
  const docs = (L === "te" ? a.documentsTe : a.documentsEn).map((s) => `• ${s}`).join("\n");
  buttons(
    c,
    t(L, "guidanceBody", {
      title: L === "te" ? a.titleTe : a.titleEn,
      summary: L === "te" ? a.summaryTe : a.summaryEn,
      steps,
      docs,
      source: a.officialSourceName,
      url: a.officialSourceUrl,
      verified: a.status === "VERIFIED" && a.lastVerifiedAt ? formatIST(a.lastVerifiedAt, false) : t(L, "notVerified"),
    }),
    [
      {
        id: a.type === "SCHEME" ? "menu:schemes" : "menu:certs",
        title: t(L, a.type === "SCHEME" ? "btnOtherSchemes" : "btnOtherCerts"),
      },
      menuButton(c),
    ],
  );
}

const TE_DAYS = ["ఆది", "సోమ", "మంగళ", "బుధ", "గురు", "శుక్ర", "శని"];
const TE_MONTHS = ["జన", "ఫిబ్ర", "మార్చి", "ఏప్రి", "మే", "జూన్", "జులై", "ఆగ", "సెప్టెం", "అక్టో", "నవం", "డిసెం"];

/** Next N office days (Mon–Sat) in IST, starting tomorrow. */
export function upcomingWorkingDays(n: number) {
  const out: { iso: string; label: { en: string; te: string } }[] = [];
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  for (let i = 1; out.length < n && i < 14; i++) {
    const d = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + i));
    if (d.getUTCDay() === 0) continue;
    const en = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
    const te = `${TE_DAYS[d.getUTCDay()]}వారం, ${d.getUTCDate()} ${TE_MONTHS[d.getUTCMonth()]}`;
    out.push({ iso: d.toISOString().slice(0, 10), label: { en, te } });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// State handlers — what the bot does with an input in a given state
// ─────────────────────────────────────────────────────────────────────────────

type Handler = (c: BotCtx, i: InboundInput) => Promise<void> | void;

const textOf = (i: InboundInput) => (i.kind === "text" ? i.text.trim() : "");
const replyOf = (i: InboundInput) => (i.kind === "reply" ? i.id : "");

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,59}$/u;

async function reprompt(c: BotCtx, hint?: MsgKey) {
  if (hint) say(c, hint);
  await go(c, c.state);
}

const HANDLERS: Record<string, Handler> = {
  menu: async (c, i) => {
    const txt = norm(textOf(i));
    const n = Number(txt);
    if (Number.isInteger(n) && n >= 1 && n <= MENU_ORDER.length) return menuChoice(c, MENU_ORDER[n - 1]);
    return showWelcome(c);
  },

  lang_select: async (c, i) => {
    const txt = norm(textOf(i));
    if (["english", "en", "2", "ఇంగ్లీష్"].includes(txt)) return setLanguage(c, "en");
    if (["telugu", "te", "1", "తెలుగు"].includes(txt)) return setLanguage(c, "te");
    return go(c, "lang_select");
  },

  c_resume: async (c, i) => {
    const r = replyOf(i);
    if (r === "resume:continue") return go(c, c.data.resumeState ?? "c_name");
    if (r === "resume:new") return startComplaint(c);
    return go(c, "c_resume");
  },

  c_consent: async (c, i) => {
    const r = replyOf(i);
    const txt = norm(textOf(i));
    const s = tenantSettings(c.tenant);
    if (r === "consent:yes" || ["yes", "agree", "i agree", "అవును", "అంగీకరిస్తున్నాను"].includes(txt)) {
      await prisma.$transaction([
        prisma.consentRecord.create({
          data: { tenantId: c.tenant.id, citizenId: c.citizen.id, type: "PROCESSING_GRANTED", channel: c.channel, noticeVersion: s.privacyNoticeVersion },
        }),
        prisma.citizen.update({ where: { id: c.citizen.id }, data: { consentAt: new Date() } }),
      ]);
      return go(c, "c_name");
    }
    if (r === "consent:no" || ["no", "వద్దు"].includes(txt)) {
      await prisma.consentRecord.create({
        data: { tenantId: c.tenant.id, citizenId: c.citizen.id, type: "PROCESSING_DECLINED", channel: c.channel, noticeVersion: s.privacyNoticeVersion },
      });
      say(c, "consentDeclined");
      return showWelcome(c);
    }
    return go(c, "c_consent");
  },

  c_name: async (c, i) => {
    const d = c.data.draft!;
    const r = replyOf(i);
    if (r === "name:keep" && c.citizen.name) {
      d.name = c.citizen.name;
      d.page = 0;
      return go(c, "c_mandal");
    }
    if (r === "name:change") {
      d.nameChange = true;
      return say(c, "askName");
    }
    const txt = textOf(i).replace(/\s+/g, " ");
    if (txt && NAME_RE.test(txt) && (txt.match(/\p{L}/gu) ?? []).length >= 2) {
      d.name = txt;
      d.page = 0;
      return go(c, "c_mandal");
    }
    return say(c, "badName");
  },

  c_mandal: async (c, i) => {
    const d = c.data.draft!;
    const r = replyOf(i);
    if (r.startsWith("mandal:more:")) {
      d.page = Number(r.split(":")[2]) || 0;
      return go(c, "c_mandal");
    }
    let mandalId: string | null = null;
    if (r.startsWith("mandal:")) {
      const m = await prisma.mandal.findFirst({ where: { id: r.slice(7), tenantId: c.tenant.id } });
      mandalId = m?.id ?? null;
    } else if (textOf(i)) {
      const all = await prisma.mandal.findMany({ where: { tenantId: c.tenant.id } });
      mandalId = fuzzyPick(all, textOf(i), (m) => [m.name, m.nameTe])?.id ?? null;
    }
    if (!mandalId) return reprompt(c, "chooseFromList");
    d.mandalId = mandalId;
    d.villageId = null;
    d.villageText = null;
    d.page = 0;
    return go(c, "c_village");
  },

  c_village: async (c, i) => {
    const d = c.data.draft!;
    const r = replyOf(i);
    if (r.startsWith("village:more:")) {
      d.page = Number(r.split(":")[2]) || 0;
      return go(c, "c_village");
    }
    if (r === "village:other") return go(c, "c_village_text");
    if (r.startsWith("village:")) {
      const v = await prisma.village.findFirst({ where: { id: r.slice(8), tenantId: c.tenant.id, mandalId: d.mandalId } });
      if (!v) return reprompt(c, "chooseFromList");
      d.villageId = v.id;
      d.page = 0;
      return go(c, "c_category");
    }
    const txt = textOf(i);
    if (txt) {
      const all = await prisma.village.findMany({ where: { tenantId: c.tenant.id, mandalId: d.mandalId } });
      const v = fuzzyPick(all, txt, (x) => [x.name, x.nameTe]);
      if (v) d.villageId = v.id;
      else if (txt.length >= 2 && txt.length <= 60) d.villageText = txt;
      else return reprompt(c, "chooseFromList");
      d.page = 0;
      return go(c, "c_category");
    }
    return reprompt(c, "chooseFromList");
  },

  c_village_text: async (c, i) => {
    const txt = textOf(i);
    if (txt.length < 2 || txt.length > 60) return go(c, "c_village_text");
    c.data.draft!.villageText = txt;
    c.data.draft!.villageId = null;
    c.data.draft!.page = 0;
    return go(c, "c_category");
  },

  c_category: async (c, i) => {
    const d = c.data.draft!;
    const r = replyOf(i);
    if (r.startsWith("cat:more:")) {
      d.page = Number(r.split(":")[2]) || 0;
      return go(c, "c_category");
    }
    let catId: string | null = null;
    if (r.startsWith("cat:")) {
      catId = (await prisma.category.findFirst({ where: { id: r.slice(4), tenantId: c.tenant.id, active: true } }))?.id ?? null;
    } else if (textOf(i)) {
      const cats = await prisma.category.findMany({ where: { tenantId: c.tenant.id, active: true } });
      catId = fuzzyPick(cats, textOf(i), (k) => [k.nameEn, k.nameTe, k.code])?.id ?? null;
    }
    if (!catId) return reprompt(c, "chooseFromList");
    d.categoryId = catId;
    return go(c, "c_description");
  },

  c_description: async (c, i) => {
    const d = c.data.draft!;
    if (i.kind === "media") return acceptMedia(c, i, false);
    if (i.kind === "location") {
      d.latitude = i.latitude;
      d.longitude = i.longitude;
      say(c, "locationSaved");
      return go(c, "c_description");
    }
    const txt = textOf(i);
    if (txt.length < 15) return say(c, "shortDescription");
    d.description = txt.slice(0, 2000);
    // Duplicate suggestion: open complaint, same place & category, last 30 days
    const candidates = await prisma.grievance.findMany({
      where: {
        tenantId: c.tenant.id,
        categoryId: d.categoryId,
        status: { in: OPEN_STATUSES },
        createdAt: { gte: daysAgo(30) },
        citizenId: { not: c.citizen.id },
        ...(d.villageId ? { villageId: d.villageId } : { mandalId: d.mandalId, villageText: d.villageText ?? undefined }),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, description: true },
    });
    const best = candidates
      .map((g) => ({ id: g.id, score: similarity(g.description, d.description!) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      d.dupId = best.id;
      return go(c, "c_duplicate");
    }
    return go(c, "c_landmark");
  },

  c_duplicate: async (c, i) => {
    const r = replyOf(i);
    if (r === "dup:mine") {
      c.data.draft!.possibleDuplicateOfId = c.data.draft!.dupId;
      return go(c, "c_landmark");
    }
    if (r === "dup:cancel") {
      say(c, "cancelled");
      return showWelcome(c);
    }
    return go(c, "c_duplicate");
  },

  c_landmark: async (c, i) => {
    const d = c.data.draft!;
    if (replyOf(i) === "skip") return go(c, "c_location");
    if (i.kind === "location") {
      d.latitude = i.latitude;
      d.longitude = i.longitude;
      say(c, "locationSaved");
      return go(c, "c_media");
    }
    if (i.kind === "media") return acceptMedia(c, i, false);
    const txt = textOf(i);
    if (txt.length < 2) return go(c, "c_landmark");
    d.landmark = txt.slice(0, 160);
    return go(c, "c_location");
  },

  c_location: async (c, i) => {
    const d = c.data.draft!;
    if (i.kind === "location") {
      d.latitude = i.latitude;
      d.longitude = i.longitude;
      say(c, "locationSaved");
      return go(c, "c_media");
    }
    if (replyOf(i) === "skip" || ["skip", "no", "దాటవేయండి"].includes(norm(textOf(i)))) return go(c, "c_media");
    if (i.kind === "media") return acceptMedia(c, i, false);
    return go(c, "c_location");
  },

  c_media: async (c, i) => {
    const r = replyOf(i);
    if (r === "media:done" || r === "skip" || ["done", "skip", "పూర్తయింది"].includes(norm(textOf(i)))) {
      return go(c, "c_urgency");
    }
    if (i.kind === "media") return acceptMedia(c, i, true);
    if (i.kind === "location") {
      c.data.draft!.latitude = i.latitude;
      c.data.draft!.longitude = i.longitude;
      say(c, "locationSaved");
      return;
    }
    return go(c, "c_media");
  },

  c_urgency: async (c, i) => {
    const r = replyOf(i);
    let u: Draft["urgency"] | null = null;
    if (r.startsWith("urg:")) u = r.slice(4) as Draft["urgency"];
    const txt = norm(textOf(i));
    if (["normal", "సాధారణం"].includes(txt)) u = "NORMAL";
    if (["urgent", "అత్యవసరం"].includes(txt)) u = "URGENT";
    if (!u || !["NORMAL", "URGENT", "SAFETY"].includes(u)) return go(c, "c_urgency");
    c.data.draft!.urgency = u;
    if (u === "SAFETY") say(c, "safetyNote");
    return go(c, "c_confirm");
  },

  c_confirm: async (c, i) => {
    const r = replyOf(i);
    if (r === "confirm:submit") return submitComplaint(c);
    if (r === "confirm:restart") return startComplaint(c);
    if (r === "confirm:cancel") {
      say(c, "cancelled");
      return showWelcome(c);
    }
    return go(c, "c_confirm");
  },

  track_select: async (c, i) => {
    const r = replyOf(i);
    if (r === "trk:type") return go(c, "track_ticket_input");
    if (r.startsWith("trk:")) return showTicket(c, r.slice(4));
    if (textOf(i)) return lookupTicket(c, textOf(i));
    return startTrack(c);
  },

  track_ticket_input: async (c, i) => {
    if (!textOf(i)) return go(c, "track_ticket_input");
    return lookupTicket(c, textOf(i));
  },

  info_reply: async (c, i) => {
    const gid = c.data.targetGid;
    const g = gid ? await prisma.grievance.findFirst({ where: { id: gid, tenantId: c.tenant.id, citizenId: c.citizen.id } }) : null;
    if (!g) return showWelcome(c);
    if (i.kind === "media" && i.attachmentId) {
      await prisma.attachment.updateMany({
        where: { id: i.attachmentId, tenantId: c.tenant.id, grievanceId: null },
        data: { grievanceId: g.id },
      });
      await citizenAddInfo(c.tenant.id, g.id, c.citizen.id, `[Citizen sent a ${i.mediaType}${i.fileName ? `: ${i.fileName}` : ""}]`);
      return say(c, "attachedToCase", { ticket: g.ticketNumber });
    }
    const txt = textOf(i);
    if (txt.length < 2) return go(c, "info_reply");
    await citizenAddInfo(c.tenant.id, g.id, c.citizen.id, txt);
    reset(c);
    buttons(c, t(lang(c), "infoAdded", { ticket: g.ticketNumber }), [menuButton(c)]);
  },

  fb_rating: async (c, i) => {
    const r = replyOf(i);
    const n = r.startsWith("rate:") ? Number(r.slice(5)) : Number(norm(textOf(i)));
    if (!Number.isInteger(n) || n < 1 || n > 5) return go(c, "fb_rating");
    const g = await citizenConfirmResolution(c.tenant.id, c.data.targetGid!, c.citizen.id, n);
    reset(c);
    if (!g) return showWelcome(c);
    buttons(c, t(lang(c), "thanksFeedback", { ticket: g.ticketNumber }), [menuButton(c)]);
  },

  reopen_reason: async (c, i) => {
    const txt = textOf(i);
    if (txt.length < 5) return go(c, "reopen_reason");
    const g = await citizenReopen(c.tenant.id, c.data.targetGid!, c.citizen.id, txt);
    reset(c);
    if (!g) return showWelcome(c);
    buttons(c, t(lang(c), "reopened", { ticket: g.ticketNumber }), [menuButton(c)]);
  },

  g_list: async (c, i) => {
    const r = replyOf(i);
    if (r.startsWith("gd:")) return showGuidance(c, r.slice(3));
    return startGuidance(c, c.data.gType ?? "SCHEME");
  },

  a_purpose: async (c, i) => {
    const txt = textOf(i);
    if (txt.length < 5) return say(c, "shortPurpose");
    c.data.apptPurpose = txt.slice(0, 500);
    return go(c, "a_date");
  },

  a_date: async (c, i) => {
    const r = replyOf(i);
    const valid = upcomingWorkingDays(6).map((d) => d.iso);
    if (!r.startsWith("ad:") || !valid.includes(r.slice(3))) return go(c, "a_date");
    c.data.apptDate = r.slice(3);
    return go(c, "a_slot");
  },

  a_slot: async (c, i) => {
    const r = replyOf(i);
    const slot = r.startsWith("slot:") ? r.slice(5) : "";
    if (!["MORNING", "AFTERNOON", "EVENING"].includes(slot) || !c.data.apptDate || !c.data.apptPurpose) {
      return go(c, "a_slot");
    }
    const ref = await createAppointment(c, c.data.apptPurpose, c.data.apptDate, slot);
    const L = lang(c);
    const dateLabel = upcomingWorkingDays(6).find((d) => d.iso === c.data.apptDate)?.label[L] ?? c.data.apptDate;
    const slotKey = { MORNING: "slotMorning", AFTERNOON: "slotAfternoon", EVENING: "slotEvening" }[slot] as MsgKey;
    reset(c);
    buttons(c, t(L, "apptRequested", { ref, date: dateLabel, slot: t(L, slotKey) }), [menuButton(c)]);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers with side effects
// ─────────────────────────────────────────────────────────────────────────────

async function setLanguage(c: BotCtx, l: Lang) {
  c.language = l;
  await prisma.citizen.update({ where: { id: c.citizen.id }, data: { preferredLanguage: l } });
  c.citizen.preferredLanguage = l;
  say(c, "langSet");
  showWelcome(c);
}

async function acceptMedia(c: BotCtx, i: Extract<InboundInput, { kind: "media" }>, inMediaStep: boolean) {
  const d = c.data.draft!;
  if (i.error) return say(c, "mediaRejected", { reason: i.error });
  if (!i.attachmentId) return say(c, "unsupported");
  d.attachmentIds ??= [];
  if (d.attachmentIds.length >= 3) return say(c, "mediaLimit");
  d.attachmentIds.push(i.attachmentId);
  if (inMediaStep) {
    buttons(c, t(lang(c), "mediaReceived", { n: d.attachmentIds.length }), [
      { id: "media:done", title: t(lang(c), "btnDone") },
    ]);
  } else {
    say(c, "mediaReceived", { n: d.attachmentIds.length });
    await go(c, c.state);
  }
}

async function lookupTicket(c: BotCtx, raw: string) {
  const ticket = normalizeTicket(raw);
  if (!TICKET_PATTERN.test(ticket)) {
    say(c, "ticketNotFound", { ticket });
    c.state = "track_ticket_input";
    return;
  }
  const g = await prisma.grievance.findFirst({
    where: { tenantId: c.tenant.id, ticketNumber: ticket, citizenId: c.citizen.id },
  });
  if (!g) {
    say(c, "ticketNotFound", { ticket });
    c.state = "track_ticket_input";
    return;
  }
  return showTicket(c, g.id);
}

async function submitComplaint(c: BotCtx) {
  const d = c.data.draft!;
  if (!d.name || !d.mandalId || !d.categoryId || !d.description) {
    // Defensive: incomplete draft (e.g. data edited) — restart cleanly
    return startComplaint(c);
  }
  try {
    const g = await createGrievance({
      tenant: c.tenant,
      citizenId: c.citizen.id,
      source: c.channel === "SIMULATOR" ? "SIMULATOR" : "WHATSAPP",
      categoryId: d.categoryId,
      mandalId: d.mandalId,
      villageId: d.villageId ?? null,
      villageText: d.villageText ?? null,
      landmark: d.landmark ?? null,
      description: d.description,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      urgency: d.urgency ?? "NORMAL",
      attachmentIds: d.attachmentIds ?? [],
      possibleDuplicateOfId: d.possibleDuplicateOfId ?? null,
    });
    await prisma.citizen.update({
      where: { id: c.citizen.id },
      data: { name: d.name, villageId: d.villageId ?? c.citizen.villageId, preferredLanguage: lang(c) },
    });
    c.citizen.name = d.name;
    reset(c);
    buttons(c, t(lang(c), "submitted", { ticket: g.ticketNumber, time: formatIST(g.createdAt) }), [
      { id: "menu:track", title: t(lang(c), "btnMyComplaints") },
      menuButton(c),
    ]);
  } catch (err) {
    logger.error({ err }, "Failed to create grievance from chat");
    say(c, "submitFailed");
    c.state = "c_confirm";
  }
}

async function createAppointment(c: BotCtx, purpose: string, isoDate: string, slot: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = `APT-${crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
    try {
      const a = await prisma.appointment.create({
        data: {
          tenantId: c.tenant.id,
          reference: ref,
          citizenId: c.citizen.id,
          purpose,
          preferredDate: new Date(`${isoDate}T00:00:00+05:30`),
          preferredSlot: slot,
        },
      });
      await audit({ tenantId: c.tenant.id, actorLabel: "citizen", action: "appointment.request", entityType: "Appointment", entityId: a.id });
      return ref;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate appointment reference");
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Runs one inbound input through the conversation state machine. Mutates ctx (state, data, out). */
export async function runEngine(c: BotCtx, input: InboundInput): Promise<void> {
  const raw = textOf(input);
  const txt = norm(raw);

  // Opt-out / opt-in are honoured in every state
  if (input.kind === "text" && STOP.has(txt)) {
    await prisma.$transaction([
      prisma.citizen.update({ where: { id: c.citizen.id }, data: { optedOut: true, optedOutAt: new Date() } }),
      prisma.consentRecord.create({
        data: { tenantId: c.tenant.id, citizenId: c.citizen.id, type: "OPT_OUT", channel: c.channel, noticeVersion: tenantSettings(c.tenant).privacyNoticeVersion },
      }),
    ]);
    c.citizen.optedOut = true;
    reset(c);
    return say(c, "optedOut");
  }
  if (input.kind === "text" && OPTIN.has(txt) && c.citizen.optedOut) {
    await prisma.$transaction([
      prisma.citizen.update({ where: { id: c.citizen.id }, data: { optedOut: false, optedOutAt: null } }),
      prisma.consentRecord.create({
        data: { tenantId: c.tenant.id, citizenId: c.citizen.id, type: "OPT_IN", channel: c.channel, noticeVersion: tenantSettings(c.tenant).privacyNoticeVersion },
      }),
    ]);
    c.citizen.optedOut = false;
    say(c, "optedIn");
    if (!c.language) return go(c, "lang_select");
    return showWelcome(c);
  }

  // Voice notes: transcribed upstream when speech-to-text is configured
  if (input.kind === "media" && input.mediaType === "audio") {
    if (!input.transcript) {
      say(c, "voiceNotSupported");
      return c.language ? reprompt(c) : go(c, "lang_select");
    }
    say(c, "voiceTranscribed", { text: input.transcript });
    input = { kind: "text", text: input.transcript };
  }

  // Interactive replies that work from any state (buttons on older messages / notifications)
  const r = replyOf(input);
  if (r.startsWith("lang:")) return setLanguage(c, r === "lang:en" ? "en" : "te");

  // First contact: ask for a language before anything else
  if (!c.language) return go(c, "lang_select");

  if (r === "nav:menu") return showWelcome(c);
  if (r.startsWith("menu:")) return menuChoice(c, r.slice(5));
  if (r.startsWith("fb:yes:") || r.startsWith("fb:no:")) {
    const gid = r.split(":")[2];
    const g = await prisma.grievance.findFirst({ where: { id: gid, tenantId: c.tenant.id, citizenId: c.citizen.id } });
    if (!g) return showWelcome(c);
    c.data = { targetGid: g.id };
    if (r.startsWith("fb:yes:")) {
      if (g.status !== "RESOLVED") return showTicket(c, g.id);
      return go(c, "fb_rating");
    }
    if (!["RESOLVED", "CLOSED"].includes(g.status)) return showTicket(c, g.id);
    return go(c, "reopen_reason");
  }
  if (r.startsWith("info:")) {
    c.data = { targetGid: r.slice(5) };
    return go(c, "info_reply");
  }

  if (input.kind === "text" && (GREETINGS.has(txt) || txt === "menu")) {
    if (c.state.startsWith("c_") && c.state !== "c_consent" && c.state !== "c_resume" && c.data.draft) {
      c.data.resumeState = c.state;
      return go(c, "c_resume");
    }
    return showWelcome(c);
  }
  if (input.kind === "text" && CANCEL.has(txt)) {
    say(c, "cancelled");
    return showWelcome(c);
  }
  if (input.kind === "unsupported") {
    say(c, "unsupported");
    return c.state === "idle" ? showWelcome(c) : reprompt(c);
  }

  const handler = HANDLERS[c.state];
  if (!handler) {
    if (input.kind === "media") say(c, "mediaOutOfFlow");
    return showWelcome(c);
  }
  if ((input.kind === "media" || input.kind === "location") && !c.state.startsWith("c_") && c.state !== "info_reply") {
    say(c, "mediaOutOfFlow");
    return reprompt(c);
  }
  await handler(c, input);
}
