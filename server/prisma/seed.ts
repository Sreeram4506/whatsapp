/**
 * Seeds FICTIONAL demonstration data. Every person, phone number, village and complaint here is
 * invented for demos. Workspaces are flagged isSampleBranding + isDemoData and the UI labels them.
 *
 * Seeded grievances use source SIMULATOR so that status notifications are only ever "delivered"
 * to the in-browser simulator — never to real WhatsApp numbers, even if credentials are configured.
 *
 * Demo sign-in password for every seeded account: Demo@2026  (local development only)
 */
import bcrypt from "bcryptjs";
import { GrievanceStatus, Priority, PrismaClient, UpdateVisibility } from "@prisma/client";
import { applyTenantTemplate } from "../src/services/tenantTemplate";
import { recommendPriority, extractiveSummary } from "../src/services/ai/rules";
import { DEFAULT_SETTINGS } from "../src/lib/domain";
import { formatTicket } from "../src/lib/ticket";

const prisma = new PrismaClient();
export const DEMO_PASSWORD = "Demo@2026";

// Deterministic PRNG so every reseed produces the same demo story
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(20261012);
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const H = 3600_000;
const D = 24 * H;

const LANDMARKS: [string, string][] = [
  ["the bus stand", "బస్టాండ్"],
  ["Rama temple", "రామాలయం"],
  ["ZP high school", "జడ్పీ హైస్కూల్"],
  ["panchayat office", "పంచాయతీ కార్యాలయం"],
  ["the water tank", "వాటర్ ట్యాంక్"],
  ["the ration shop", "రేషన్ షాపు"],
  ["village secretariat", "గ్రామ సచివాలయం"],
  ["anganwadi centre", "అంగన్‌వాడీ కేంద్రం"],
  ["market yard", "మార్కెట్ యార్డ్"],
  ["new colony", "కొత్త కాలనీ"],
  ["the church", "చర్చి"],
  ["Hanuman temple", "ఆంజనేయ స్వామి గుడి"],
];

const TEXTS: Record<string, { en: string[]; te: string[] }> = {
  ROADS: {
    en: [
      "The road from {lm} to the main road has big potholes. Two-wheelers are falling at night. It has been like this for {n} months.",
      "Road surface completely damaged after the rains near {lm}. School buses are unable to come inside the village.",
      "The culvert near {lm} is cracked and partly broken. Heavy vehicles are still using it and it looks dangerous.",
      "CC road work started {n} months ago near {lm} but stopped halfway. Gravel is lying on the road.",
      "Village internal road near {lm} becomes muddy and not motorable during rain. Elderly people find it very difficult to walk.",
    ],
    te: [
      "{lm} దగ్గర రోడ్డు మీద పెద్ద పెద్ద గుంతలు ఉన్నాయి. రాత్రి వేళ బైక్‌లు పడిపోతున్నాయి. {n} నెలలుగా ఇలాగే ఉంది.",
      "వర్షాల తర్వాత {lm} దగ్గర రోడ్డు పూర్తిగా దెబ్బతిన్నది. స్కూల్ బస్సులు గ్రామంలోకి రావడం లేదు.",
      "{lm} దగ్గర సీసీ రోడ్డు పని సగంలో ఆగిపోయింది. కంకర రోడ్డు మీదే పడి ఉంది.",
      "{lm} దగ్గర కల్వర్టు పగిలిపోయింది. భారీ వాహనాలు వెళ్తున్నాయి, ప్రమాదకరంగా ఉంది.",
    ],
  },
  DRAINAGE: {
    en: [
      "Drainage near {lm} is blocked and sewage water is overflowing onto the street. Mosquitoes have increased a lot.",
      "Side drains near {lm} were not cleaned for {n} months. Water is stagnant in front of houses and smells very bad.",
      "Drainage water enters houses near {lm} whenever it rains. Please construct a proper drain.",
    ],
    te: [
      "{lm} దగ్గర మురుగు కాలువ పూడిపోయి మురుగు నీరు రోడ్డు మీదకు వస్తోంది. దోమలు బాగా పెరిగాయి.",
      "{n} నెలలుగా {lm} దగ్గర కాలువలు శుభ్రం చేయలేదు. ఇళ్ల ముందు నీరు నిలిచి దుర్వాసన వస్తోంది.",
      "వర్షం పడినప్పుడు {lm} దగ్గర మురుగు నీరు ఇళ్లలోకి వస్తోంది. సరైన డ్రైనేజీ నిర్మించండి.",
    ],
  },
  WATER: {
    en: [
      "No drinking water supply in our street near {lm} for the last {n} days. We are buying water cans every day.",
      "Tap water near {lm} is coming muddy and smells bad. Children are falling sick. Please check the pipeline.",
      "Pipeline leakage near {lm} — clean water is being wasted on the road for weeks.",
      "Borewell hand pump near {lm} is not working. Around 40 families depend on it.",
    ],
    te: [
      "{lm} దగ్గర మా వీధిలో గత {n} రోజులుగా తాగునీరు రావడం లేదు. రోజూ నీళ్ల క్యాన్లు కొనాల్సి వస్తోంది.",
      "{lm} దగ్గర కుళాయి నీరు బురదగా, దుర్వాసనతో వస్తోంది. పిల్లలు అనారోగ్యానికి గురవుతున్నారు.",
      "{lm} దగ్గర పైప్‌లైన్ లీకేజీ వల్ల వారాలుగా నీరు వృథా అవుతోంది.",
      "{lm} దగ్గర బోరు పంపు పనిచేయడం లేదు. సుమారు 40 కుటుంబాలు దీని మీదే ఆధారపడ్డాయి.",
    ],
  },
  ELECTRICITY: {
    en: [
      "Street lights near {lm} are not working for {n} weeks. Women are afraid to walk at night.",
      "Transformer near {lm} is sparking frequently and there are voltage fluctuations. Appliances are getting damaged.",
      "A live wire is hanging low near {lm}. It is dangerous for children going to school.",
      "Frequent power cuts in our area near {lm}, sometimes 5-6 hours a day. Farmers cannot run motors.",
    ],
    te: [
      "{lm} దగ్గర వీధి దీపాలు {n} వారాలుగా వెలగడం లేదు. రాత్రి మహిళలు నడవడానికి భయపడుతున్నారు.",
      "{lm} దగ్గర ట్రాన్స్‌ఫార్మర్ తరచూ మెరుస్తోంది, వోల్టేజ్ హెచ్చుతగ్గులు ఉన్నాయి.",
      "{lm} దగ్గర విద్యుత్ తీగ కిందకు వేలాడుతోంది. బడికి వెళ్లే పిల్లలకు ప్రమాదకరం.",
      "{lm} ప్రాంతంలో రోజుకు 5-6 గంటలు కరెంట్ కోతలు ఉన్నాయి. రైతులు మోటార్లు నడపలేకపోతున్నారు.",
    ],
  },
  SANITATION: {
    en: [
      "Garbage is not being collected near {lm} for {n} days. Dogs are spreading it everywhere.",
      "Public toilet near {lm} is not maintained and is unusable.",
    ],
    te: [
      "{lm} దగ్గర {n} రోజులుగా చెత్త సేకరించడం లేదు. కుక్కలు చెత్తను చెల్లాచెదురు చేస్తున్నాయి.",
      "{lm} దగ్గర పబ్లిక్ టాయిలెట్ నిర్వహణ లేక ఉపయోగించలేని స్థితిలో ఉంది.",
    ],
  },
  HEALTH: {
    en: [
      "The health centre near {lm} has no doctor available in the evenings. Patients are being sent to the town hospital.",
      "Medicines for BP and sugar are not available at the health centre near {lm} for the last {n} weeks.",
      "Ambulance took more than an hour to reach our village last week. Please improve emergency response.",
    ],
    te: [
      "{lm} దగ్గర ఉన్న ఆరోగ్య కేంద్రంలో సాయంత్రం వైద్యులు అందుబాటులో ఉండటం లేదు.",
      "గత {n} వారాలుగా {lm} దగ్గర ఆరోగ్య కేంద్రంలో బీపీ, షుగర్ మందులు అందుబాటులో లేవు.",
    ],
  },
  EDUCATION: {
    en: [
      "Government school near {lm} has only two teachers for five classes. Children's studies are suffering.",
      "School compound wall near {lm} collapsed partly and the classroom roof is leaking during rain.",
      "Mid-day meal quality has gone down at the school near {lm}. Parents are worried.",
    ],
    te: [
      "{lm} దగ్గర ప్రభుత్వ పాఠశాలలో ఐదు తరగతులకు ఇద్దరు ఉపాధ్యాయులే ఉన్నారు.",
      "{lm} దగ్గర పాఠశాల ప్రహరీ గోడ కొంత కూలిపోయింది, వర్షానికి తరగతి గది పైకప్పు కారుతోంది.",
    ],
  },
  PENSION: {
    en: [
      "My old age pension has not been credited for the last {n} months. I am 72 years old and depend on it.",
      "Applied for widow pension {n} months ago at the village secretariat, no update yet.",
      "Pension stopped after my eKYC failed. I need help to update it.",
    ],
    te: [
      "గత {n} నెలలుగా నా వృద్ధాప్య పింఛన్ రావడం లేదు. నా వయసు 72 సంవత్సరాలు.",
      "{n} నెలల క్రితం సచివాలయంలో వితంతు పింఛన్‌కు దరఖాస్తు చేశాను, ఇంకా సమాచారం లేదు.",
    ],
  },
  HOUSING: {
    en: [
      "Our house site patta application is pending for over a year. Please let us know the status.",
      "House allotted under the housing scheme is incomplete; construction stopped at lintel level.",
    ],
    te: ["మా ఇంటి స్థలం పట్టా దరఖాస్తు ఏడాది నుంచి పెండింగ్‌లో ఉంది. దయచేసి స్థితి తెలపండి."],
  },
  OTHER: {
    en: [
      "Stray dog menace near {lm}. Several children have been bitten this month.",
      "Bus service to our village was stopped. Students are walking 4 km to the main road.",
    ],
    te: [
      "{lm} దగ్గర వీధి కుక్కల బెడద ఎక్కువైంది. ఈ నెలలో పలువురు పిల్లలను కరిచాయి.",
      "మా గ్రామానికి బస్సు సర్వీసు ఆపేశారు. విద్యార్థులు 4 కి.మీ. నడిచి వెళ్తున్నారు.",
    ],
  },
};

const RESOLUTION: Record<string, string[]> = {
  ROADS: ["Potholes filled and the stretch patched (approx. 120 m).", "Damaged culvert repaired and reopened to traffic.", "Pending CC road work completed by the contractor."],
  DRAINAGE: ["Drain cleared, silt removed and sprayed against mosquitoes.", "Blockage removed; monthly cleaning added to the schedule."],
  WATER: ["Pipeline leak repaired and supply restored.", "Hand pump repaired; water quality tested.", "Contaminated line flushed and chlorinated; supply normal."],
  ELECTRICITY: ["Street lights replaced with LED fittings.", "Transformer serviced by the DISCOM line staff.", "Low-hanging line re-strung at safe height."],
  SANITATION: ["Garbage cleared; collection route updated.", "Toilet cleaned and caretaker assigned."],
  HEALTH: ["Evening duty roster shared with the health centre; doctor posted.", "Medicine stock replenished at the health centre."],
  EDUCATION: ["Roof leak repaired before reopening.", "Matter taken up with the education office; additional teacher deputed."],
  PENSION: ["eKYC updated at secretariat; pension credited.", "Application traced and forwarded; sanction confirmed by secretariat."],
  HOUSING: ["Application status obtained from revenue office and shared with citizen."],
  OTHER: ["Matter taken up with the concerned department; action confirmed."],
};

const FIRST = ["Venkata Ramana", "Lakshmi", "Srinivas", "Padma", "Ramesh", "Sujatha", "Nagaraju", "Anjali", "Prasad", "Kavitha", "Suresh", "Durga", "Raju", "Swathi", "Krishna", "Bhavani", "Satyanarayana", "Madhavi", "Ravi Teja", "Sirisha", "Gopal", "Annapurna", "Chandra Sekhar", "Jyothi", "Mahesh", "Vijaya", "Rambabu", "Sarojini", "Kiran", "Hemalatha", "Naveen", "Sravani", "Apparao", "Mani", "Yesu", "Fathima", "Rajesh", "Usha"];

interface VillageSeed {
  name: string;
  te: string;
  kind?: "WARD";
}
interface TenantSeed {
  slug: string;
  officeName: string;
  mlaName: string;
  constituency: string;
  district: string;
  prefix: string;
  address: string;
  mandals: { name: string; te: string; villages: VillageSeed[] }[];
  users: { name: string; email: string; role: "OFFICE_ADMIN" | "MLA" | "FIELD_OFFICER"; team?: string }[];
  grievances: number;
  days: number;
  clusters: { village: string; category: string; count: number }[];
}

const TENANTS: TenantSeed[] = [
  {
    slug: "sample-seethapuram",
    officeName: "MLA Office · Seethapuram (Sample)",
    mlaName: "Sample MLA",
    constituency: "Seethapuram (fictional)",
    district: "Sample District",
    prefix: "COS",
    address: "Sample MLA Camp Office, Main Road, Seethapuram — fictional address",
    mandals: [
      {
        name: "Seethapuram Urban",
        te: "సీతాపురం పట్టణం",
        villages: [
          { name: "Ward 1 – Gandhi Nagar", te: "వార్డు 1 – గాంధీ నగర్", kind: "WARD" },
          { name: "Ward 2 – Market Area", te: "వార్డు 2 – మార్కెట్ ఏరియా", kind: "WARD" },
          { name: "Ward 3 – Railway Colony", te: "వార్డు 3 – రైల్వే కాలనీ", kind: "WARD" },
          { name: "Ward 4 – Nehru Street", te: "వార్డు 4 – నెహ్రూ వీధి", kind: "WARD" },
          { name: "Ward 5 – Bus Stand Area", te: "వార్డు 5 – బస్టాండ్ ఏరియా", kind: "WARD" },
        ],
      },
      {
        name: "Ramapuram",
        te: "రామాపురం",
        villages: [
          { name: "Ramapuram", te: "రామాపురం" },
          { name: "Kothapalli", te: "కొత్తపల్లి" },
          { name: "Chinnapuram", te: "చిన్నాపురం" },
          { name: "Venkatapuram", te: "వెంకటాపురం" },
          { name: "Lakshmipuram", te: "లక్ష్మీపురం" },
          { name: "Gollapalem", te: "గొల్లపాలెం" },
        ],
      },
      {
        name: "Kondavaram",
        te: "కొండవరం",
        villages: [
          { name: "Kondavaram", te: "కొండవరం" },
          { name: "Pedapalli", te: "పెదపల్లి" },
          { name: "Thummalapalle", te: "తుమ్మలపల్లె" },
          { name: "Rayavaram", te: "రాయవరం" },
          { name: "Mallavaram", te: "మల్లవరం" },
        ],
      },
      {
        name: "Nallapadu",
        te: "నల్లపాడు",
        villages: [
          { name: "Nallapadu", te: "నల్లపాడు" },
          { name: "Siripuram", te: "సిరిపురం" },
          { name: "Gopalapuram", te: "గోపాలపురం" },
          { name: "Bandarupalli", te: "బండారుపల్లి" },
          { name: "Kesavaram", te: "కేశవరం" },
        ],
      },
    ],
    users: [
      { name: "Anitha (Office Admin)", email: "admin@seethapuram.demo", role: "OFFICE_ADMIN" },
      { name: "Sample MLA", email: "mla@seethapuram.demo", role: "MLA" },
      { name: "Ravi Kumar", email: "ravi@seethapuram.demo", role: "FIELD_OFFICER", team: "Roads & Buildings" },
      { name: "Lakshmi Devi", email: "lakshmi@seethapuram.demo", role: "FIELD_OFFICER", team: "Water & Sanitation" },
      { name: "Suresh Babu", email: "suresh@seethapuram.demo", role: "FIELD_OFFICER", team: "Electricity" },
      { name: "Padmavathi", email: "padma@seethapuram.demo", role: "FIELD_OFFICER", team: "Welfare & Pensions" },
      { name: "Imran Khan", email: "imran@seethapuram.demo", role: "FIELD_OFFICER", team: "Health & Education" },
    ],
    grievances: 230,
    days: 120,
    clusters: [
      { village: "Kothapalli", category: "DRAINAGE", count: 7 },
      { village: "Ward 3 – Railway Colony", category: "WATER", count: 6 },
      { village: "Pedapalli", category: "ROADS", count: 6 },
      { village: "Gollapalem", category: "ELECTRICITY", count: 5 },
      { village: "Siripuram", category: "WATER", count: 4 },
    ],
  },
  {
    slug: "sample-lankapalli",
    officeName: "MLA Office · Lankapalli (Sample B)",
    mlaName: "Sample MLA B",
    constituency: "Lankapalli (fictional)",
    district: "Sample District",
    prefix: "LNK",
    address: "Sample camp office, Lankapalli — fictional address",
    mandals: [
      { name: "Lankapalli", te: "లంకపల్లి", villages: [{ name: "Lankapalli", te: "లంకపల్లి" }, { name: "Pallipadu", te: "పల్లిపాడు" }, { name: "Vemuru", te: "వేమూరు" }] },
      { name: "Kotturu", te: "కొత్తూరు", villages: [{ name: "Kotturu", te: "కొత్తూరు" }, { name: "Chintalapudi", te: "చింతలపూడి" }] },
    ],
    users: [
      { name: "Office Admin B", email: "admin@lankapalli.demo", role: "OFFICE_ADMIN" },
      { name: "Sample MLA B", email: "mla@lankapalli.demo", role: "MLA" },
      { name: "Field Officer B", email: "field@lankapalli.demo", role: "FIELD_OFFICER", team: "Roads & Buildings" },
    ],
    grievances: 28,
    days: 60,
    clusters: [],
  },
];

function fill(tpl: string, lm: string) {
  return tpl.replace("{lm}", lm).replace("{n}", String(2 + Math.floor(rnd() * 6)));
}

async function seedTenant(spec: TenantSeed, idx: number) {
  rnd = mulberry32(20261012 + idx * 7919);
  const now = Date.now();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: {
      slug: spec.slug,
      officeName: spec.officeName,
      mlaName: spec.mlaName,
      mlaDesignation: "Member of Legislative Assembly (sample profile)",
      constituency: spec.constituency,
      district: spec.district,
      ticketPrefix: spec.prefix,
      isSampleBranding: true,
      isDemoData: true,
      brandColor: "#0f766e",
      officeAddress: spec.address,
      officeHours: "Mon–Sat, 10:00 AM – 5:00 PM",
      officePhone: "Sample number — not in service",
      settings: { ...DEFAULT_SETTINGS },
    },
  });
  const teams = await prisma.$transaction((tx) => applyTenantTemplate(tx, tenant.id));
  const categories = await prisma.category.findMany({ where: { tenantId: tenant.id } });
  const catByCode = new Map(categories.map((c) => [c.code, c]));

  const villages: { id: string; name: string; mandalId: string }[] = [];
  for (const m of spec.mandals) {
    const mandal = await prisma.mandal.create({ data: { tenantId: tenant.id, name: m.name, nameTe: m.te } });
    for (const v of m.villages) {
      const vv = await prisma.village.create({ data: { tenantId: tenant.id, mandalId: mandal.id, name: v.name, nameTe: v.te, kind: v.kind ?? "VILLAGE" } });
      villages.push({ id: vv.id, name: vv.name, mandalId: mandal.id });
    }
  }

  const users = [];
  for (const u of spec.users) {
    users.push(
      await prisma.user.create({
        data: { tenantId: tenant.id, name: u.name, email: u.email, role: u.role, passwordHash: hash, teamId: u.team ? teams.get(u.team) : null },
      }),
    );
  }
  const adminUser = users.find((u) => u.role === "OFFICE_ADMIN")!;
  const officerByTeam = new Map(users.filter((u) => u.teamId).map((u) => [u.teamId!, u]));

  // Citizens (fictional names with initials; fictional numbers in a 91 99999 xxxxx block)
  const citizens = [];
  const nCitizens = Math.round(spec.grievances * 0.7);
  for (let i = 0; i < nCitizens; i++) {
    const v = pick(villages);
    citizens.push(
      await prisma.citizen.create({
        data: {
          tenantId: tenant.id,
          phone: `919999${idx + 1}${String(i).padStart(5, "0")}`,
          name: `${String.fromCharCode(65 + Math.floor(rnd() * 25))}. ${pick(FIRST)}`,
          preferredLanguage: rnd() < 0.6 ? "te" : "en",
          villageId: v.id,
          consentAt: new Date(now - 130 * D),
        },
      }),
    );
  }
  for (const c of citizens) {
    await prisma.consentRecord.create({ data: { tenantId: tenant.id, citizenId: c.id, type: "PROCESSING_GRANTED", channel: "SIMULATOR", noticeVersion: DEFAULT_SETTINGS.privacyNoticeVersion, createdAt: c.consentAt! } });
  }

  // Build grievance specs: clusters first, then random with category weights
  const weights: [string, number][] = [["ROADS", 18], ["DRAINAGE", 15], ["WATER", 17], ["ELECTRICITY", 14], ["SANITATION", 7], ["HEALTH", 6], ["EDUCATION", 6], ["PENSION", 9], ["HOUSING", 4], ["OTHER", 4]];
  const totalW = weights.reduce((a, b) => a + b[1], 0);
  const pickCat = () => {
    let r = rnd() * totalW;
    for (const [c, w] of weights) if ((r -= w) <= 0) return c;
    return "OTHER";
  };
  const specs: { cat: string; village: (typeof villages)[number]; age: number }[] = [];
  for (const cl of spec.clusters) {
    const v = villages.find((x) => x.name === cl.village)!;
    for (let i = 0; i < cl.count; i++) specs.push({ cat: cl.category, village: v, age: between(1, 40) });
  }
  while (specs.length < spec.grievances) {
    // Skew toward recent dates: more complaints in the last weeks
    const age = Math.pow(rnd(), 1.6) * spec.days;
    specs.push({ cat: pickCat(), village: pick(villages), age });
  }
  specs.sort((a, b) => b.age - a.age); // oldest first → ticket numbers ascend with time

  const SLA: Record<Priority, number> = { CRITICAL: 2, HIGH: 5, MEDIUM: 10, LOW: 20 };
  const year = new Date().getFullYear();
  let seq = 0;

  for (const s of specs) {
    const cat = catByCode.get(s.cat)!;
    const citizen = pick(citizens);
    const lang = citizen.preferredLanguage === "te" && rnd() < 0.85 ? "te" : "en";
    const lmPair = pick(LANDMARKS);
    const landmark = lang === "te" ? lmPair[1] : lmPair[0];
    const desc = fill(pick(TEXTS[s.cat][lang]), landmark);
    const urgency = rnd() < 0.08 ? "URGENT" : rnd() < 0.03 ? "SAFETY" : "NORMAL";
    const { priority, reasons } = recommendPriority({ description: desc, urgency, categoryDefault: cat.defaultPriority, categoryName: cat.nameEn, similarOpenInVillage: 0 });
    const created = new Date(now - s.age * D - between(0, 10) * H);
    seq++;

    // Decide lifecycle by age
    type Step = { status: GrievanceStatus; at: Date; visibility: UpdateVisibility; kind: string; message: string; author?: string | null };
    const steps: Step[] = [];
    const teamId = cat.defaultTeamId!;
    const officer = officerByTeam.get(teamId) ?? null;
    let status: GrievanceStatus = "RECEIVED";
    let dueAt: Date | null = null;
    let assigneeId: string | null = null;
    let assignedTeam: string | null = null;
    let resolvedAt: Date | null = null;
    let closedAt: Date | null = null;
    let rating: number | null = null;
    let confirmed: boolean | null = null;
    let reopenCount = 0;
    let resolutionNotes: string | null = null;
    let fieldVisitAt: Date | null = null;
    let resolutionRequestedAt: Date | null = null;
    const t = (days: number) => new Date(Math.min(created.getTime() + days * D, now - 5 * 60_000));
    const ageDays = s.age;
    const roll = rnd();

    const progress =
      ageDays < 0.6 ? 0
      : ageDays < 2 ? (roll < 0.4 ? 1 : 2)
      : ageDays < 6 ? (roll < 0.1 ? 1 : roll < 0.45 ? 2 : roll < 0.8 ? 3 : roll < 0.85 ? 5 : 4)
      : ageDays < 20 ? (roll < 0.05 ? 2 : roll < 0.3 ? 3 : roll < 0.38 ? 5 : 4)
      : roll < 0.04 ? 3 : 4;
    // 0 received · 1 verification · 2 assigned · 3 in progress · 4 resolved/closed · 5 awaiting info

    if (progress >= 1) {
      status = "VERIFICATION";
      steps.push({ status, at: t(between(0.1, 0.5)), visibility: "CITIZEN", kind: "STATUS_CHANGE", message: pick(["Details verified with the citizen over phone.", "Location confirmed with village secretariat staff.", "Complaint reviewed by the office."]), author: adminUser.id });
    }
    if (progress >= 2) {
      status = "ASSIGNED";
      const at = t(between(0.6, 1.6));
      assignedTeam = teamId;
      assigneeId = officer?.id ?? null;
      dueAt = new Date(at.getTime() + SLA[priority] * D);
      steps.push({ status, at, visibility: "INTERNAL", kind: "ASSIGNMENT", message: `Assigned to ${[...teams.entries()].find(([, id]) => id === teamId)![0]}; due ${dueAt.toISOString().slice(0, 10)}.`, author: adminUser.id });
      steps.push({ status, at, visibility: "CITIZEN", kind: "STATUS_CHANGE", message: `Assigned to ${[...teams.entries()].find(([, id]) => id === teamId)![0]}`, author: adminUser.id });
    }
    if (progress === 5) {
      status = "AWAITING_INFO";
      steps.push({ status, at: t(between(1.8, 3)), visibility: "CITIZEN", kind: "STATUS_CHANGE", message: s.cat === "PENSION" ? "Please share your pension ID and Aadhaar-linked bank account details at the village secretariat." : "Please share the exact door number or a nearby landmark so the team can locate the site.", author: adminUser.id });
    }
    if (progress >= 3 && progress !== 5) {
      status = "IN_PROGRESS";
      const at = t(between(1.8, 4));
      fieldVisitAt = at;
      steps.push({ status, at, visibility: "INTERNAL", kind: "INSPECTION", message: pick(["Site inspected; extent of damage recorded with photos.", "Inspected with the village secretary; estimate prepared.", "Spoke to residents; issue confirmed on site."]), author: assigneeId ?? adminUser.id });
      steps.push({ status, at, visibility: "CITIZEN", kind: "STATUS_CHANGE", message: pick(["Field team has inspected the site. Work is being planned.", "Repair work has started.", "The concerned department has been contacted and work is in progress."]), author: assigneeId ?? adminUser.id });
    }
    if ((progress === 2 || progress === 3) && dueAt && dueAt.getTime() < now && rnd() < 0.55) {
      const extended = new Date(now + between(1, 6) * D);
      steps.push({ status, at: new Date(dueAt.getTime() - 6 * H), visibility: "INTERNAL", kind: "NOTE", message: pick(["Due date extended: material procurement pending with the department.", "Due date extended: contractor mobilisation scheduled.", "Due date extended: awaiting technical sanction."]), author: adminUser.id });
      dueAt = extended;
    }
    if (progress === 4) {
      const resolveAfter = Math.min(ageDays - 0.2, between(2.5, SLA[priority] * 1.6));
      resolutionNotes = pick(RESOLUTION[s.cat]);
      resolutionRequestedAt = t(resolveAfter - 0.3);
      resolvedAt = t(resolveAfter);
      status = "RESOLVED";
      steps.push({ status, at: resolutionRequestedAt, visibility: "INTERNAL", kind: "RESOLUTION_REQUEST", message: `Work reported complete — awaiting office confirmation. ${resolutionNotes}`, author: assigneeId ?? adminUser.id });
      steps.push({ status, at: resolvedAt, visibility: "CITIZEN", kind: "STATUS_CHANGE", message: resolutionNotes, author: adminUser.id });
      if (ageDays - resolveAfter > 1.5 && rnd() < 0.8) {
        status = "CLOSED";
        closedAt = t(resolveAfter + between(0.3, 1.5));
        confirmed = true;
        rating = rnd() < 0.55 ? 5 : rnd() < 0.7 ? 4 : rnd() < 0.6 ? 3 : 2;
        steps.push({ status, at: closedAt, visibility: "CITIZEN", kind: "CITIZEN_FEEDBACK", message: `Citizen confirmed the resolution and rated the support ${rating}/5.`, author: null });
      } else if (ageDays - resolveAfter > 1.5 && rnd() < 0.3) {
        status = "REOPENED";
        reopenCount = 1;
        resolvedAt = null;
        dueAt = null; // awaiting fresh assessment by the office
        confirmed = false;
        steps.push({ status, at: t(resolveAfter + 1), visibility: "CITIZEN", kind: "REOPEN", message: "Citizen reported the problem is not solved: the issue came back after two days.", author: null });
      }
    }

    const g = await prisma.grievance.create({
      data: {
        tenantId: tenant.id,
        ticketNumber: formatTicket(spec.prefix, year, seq),
        citizenId: citizen.id,
        source: "SIMULATOR",
        categoryId: cat.id,
        mandalId: s.village.mandalId,
        villageId: s.village.id,
        landmark,
        description: desc,
        descriptionLanguage: lang,
        urgency,
        priority,
        priorityReasons: reasons,
        status,
        teamId: assignedTeam,
        assigneeId,
        dueAt,
        fieldVisitAt,
        resolutionRequestedAt,
        resolutionNotes,
        resolvedAt,
        resolvedById: resolvedAt ? adminUser.id : null,
        closedAt,
        citizenConfirmed: confirmed,
        feedbackRating: rating,
        reopenCount,
        aiSummary: extractiveSummary(desc),
        aiSuggestedCategory: cat.code,
        aiSuggestedTeamId: teamId,
        aiProvider: "rules (seed)",
        aiGeneratedAt: created,
        createdAt: created,
        updatedAt: steps.length ? steps[steps.length - 1].at : created,
      },
    });
    await prisma.grievanceUpdate.create({ data: { tenantId: tenant.id, grievanceId: g.id, visibility: "CITIZEN", kind: "SYSTEM", message: "Complaint received via WhatsApp simulator (demo).", toStatus: "RECEIVED", createdAt: created } });
    let prev: GrievanceStatus = "RECEIVED";
    for (const st of steps) {
      const isStatus = st.kind === "STATUS_CHANGE" || st.kind === "CITIZEN_FEEDBACK" || st.kind === "REOPEN";
      await prisma.grievanceUpdate.create({
        data: { tenantId: tenant.id, grievanceId: g.id, authorId: st.author ?? null, visibility: st.visibility, kind: st.kind, message: st.message, createdAt: st.at, ...(isStatus ? { fromStatus: prev, toStatus: st.status } : {}) },
      });
      if (isStatus) {
        await prisma.auditLog.create({ data: { tenantId: tenant.id, actorId: st.author ?? null, actorName: st.author ? users.find((u) => u.id === st.author)?.name : "citizen", action: "grievance.status", entityType: "Grievance", entityId: g.id, details: { from: prev, to: st.status, ticket: g.ticketNumber }, createdAt: st.at } });
        prev = st.status;
      }
    }
  }
  await prisma.ticketCounter.create({ data: { tenantId: tenant.id, year, value: seq } });

  // Appointment requests
  const purposes = ["Request for new borewell in our colony", "Discuss pending house site patta applications of 12 families", "Invite MLA to school annual day", "Follow up on drinking water pipeline extension", "Request for bus service restoration", "Help with medical treatment assistance application"];
  const apptStatuses = ["REQUESTED", "REQUESTED", "REQUESTED", "CONFIRMED", "CONFIRMED", "COMPLETED"] as const;
  for (let i = 0; i < (idx === 0 ? 6 : 2); i++) {
    const st = apptStatuses[i];
    const preferred = new Date(now + (i + 1) * D);
    await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        reference: `APT-${(0xa1b2c3 + i * 4099 + idx * 77).toString(16).toUpperCase().slice(0, 6)}`,
        citizenId: citizens[i].id,
        purpose: purposes[i],
        preferredDate: preferred,
        preferredSlot: pick(["MORNING", "AFTERNOON", "EVENING"]),
        status: st,
        scheduledAt: st !== "REQUESTED" ? new Date(preferred.getTime() + 11 * H) : null,
        officeNote: st === "CONFIRMED" ? "Please bring copies of relevant documents." : null,
        handledById: st !== "REQUESTED" ? adminUser.id : null,
      },
    });
  }

  // Guidance — sample content only, deliberately left UNVERIFIED until the office checks each source.
  if (idx === 0) {
    const articles = [
      {
        type: "SCHEME" as const, code: "PM_KISAN", titleEn: "PM-KISAN", titleTe: "పీఎం-కిసాన్",
        summaryEn: "Central government income support scheme for eligible farmer families.",
        summaryTe: "అర్హులైన రైతు కుటుంబాలకు కేంద్ర ప్రభుత్వ ఆదాయ మద్దతు పథకం.",
        stepsEn: ["Check the eligibility conditions on the official portal.", "Register through the portal, a Common Service Centre or your village secretariat.", "Complete eKYC as instructed on the portal.", "Track your status on the official portal."],
        stepsTe: ["అధికారిక పోర్టల్‌లో అర్హత నిబంధనలు చూడండి.", "పోర్టల్, కామన్ సర్వీస్ సెంటర్ లేదా గ్రామ సచివాలయం ద్వారా నమోదు చేసుకోండి.", "పోర్టల్ సూచనల ప్రకారం eKYC పూర్తి చేయండి.", "అధికారిక పోర్టల్‌లో మీ స్థితిని చూడండి."],
        documentsEn: ["Aadhaar", "Land ownership records", "Bank account details"],
        documentsTe: ["ఆధార్", "భూమి యాజమాన్య పత్రాలు", "బ్యాంకు ఖాతా వివరాలు"],
        officialSourceName: "PM-KISAN official portal", officialSourceUrl: "https://pmkisan.gov.in",
      },
      {
        type: "SCHEME" as const, code: "PMJAY", titleEn: "Ayushman Bharat PM-JAY", titleTe: "ఆయుష్మాన్ భారత్",
        summaryEn: "Health assurance scheme for eligible families, used at empanelled hospitals.",
        summaryTe: "అర్హులైన కుటుంబాలకు ఆరోగ్య భరోసా పథకం — ఎంపానెల్డ్ ఆసుపత్రులలో వినియోగం.",
        stepsEn: ["Check whether your family is eligible on the official portal.", "Visit an empanelled hospital help desk or a Common Service Centre.", "Complete identity verification to obtain the card."],
        stepsTe: ["మీ కుటుంబం అర్హత ఉందో అధికారిక పోర్టల్‌లో చూడండి.", "ఎంపానెల్డ్ ఆసుపత్రి హెల్ప్ డెస్క్ లేదా కామన్ సర్వీస్ సెంటర్‌కు వెళ్లండి.", "కార్డు పొందడానికి గుర్తింపు ధృవీకరణ పూర్తి చేయండి."],
        documentsEn: ["Aadhaar", "Ration card (if applicable)"],
        documentsTe: ["ఆధార్", "రేషన్ కార్డు (వర్తిస్తే)"],
        officialSourceName: "PM-JAY official website", officialSourceUrl: "https://pmjay.gov.in",
      },
      {
        type: "SCHEME" as const, code: "SCHOLARSHIP", titleEn: "National Scholarships", titleTe: "జాతీయ స్కాలర్‌షిప్‌లు",
        summaryEn: "Central and state scholarship applications through the National Scholarship Portal.",
        summaryTe: "జాతీయ స్కాలర్‌షిప్ పోర్టల్ ద్వారా కేంద్ర, రాష్ట్ర స్కాలర్‌షిప్ దరఖాస్తులు.",
        stepsEn: ["Register as a student on the official portal.", "Choose the scholarship you are eligible for and fill the form.", "Submit documents and get them verified by your institution."],
        stepsTe: ["అధికారిక పోర్టల్‌లో విద్యార్థిగా నమోదు చేసుకోండి.", "మీకు అర్హత ఉన్న స్కాలర్‌షిప్ ఎంచుకుని ఫారం నింపండి.", "పత్రాలు సమర్పించి మీ విద్యాసంస్థ ద్వారా ధృవీకరణ పొందండి."],
        documentsEn: ["Aadhaar", "Previous marks memo", "Income certificate", "Bank account details"],
        documentsTe: ["ఆధార్", "గత మార్కుల మెమో", "ఆదాయ ధృవపత్రం", "బ్యాంకు ఖాతా వివరాలు"],
        officialSourceName: "National Scholarship Portal", officialSourceUrl: "https://scholarships.gov.in",
      },
      {
        type: "CERTIFICATE" as const, code: "INCOME_CERT", titleEn: "Income certificate", titleTe: "ఆదాయ ధృవపత్రం",
        summaryEn: "Certificate of annual family income, often needed for scholarships and welfare schemes.",
        summaryTe: "కుటుంబ వార్షిక ఆదాయ ధృవపత్రం — స్కాలర్‌షిప్‌లు, సంక్షేమ పథకాలకు తరచుగా అవసరం.",
        stepsEn: ["Visit your Village/Ward Secretariat or a MeeSeva centre.", "Fill the application and submit the documents.", "Note the application number and track it at the same office."],
        stepsTe: ["మీ గ్రామ/వార్డు సచివాలయం లేదా మీసేవ కేంద్రానికి వెళ్లండి.", "దరఖాస్తు నింపి పత్రాలు సమర్పించండి.", "దరఖాస్తు నంబర్‌ను గుర్తుంచుకుని అదే కార్యాలయంలో స్థితి తెలుసుకోండి."],
        documentsEn: ["Aadhaar", "Ration card", "Self-declaration of income"],
        documentsTe: ["ఆధార్", "రేషన్ కార్డు", "ఆదాయ స్వీయ ధృవీకరణ"],
        officialSourceName: "Government of Andhra Pradesh portal", officialSourceUrl: "https://www.ap.gov.in",
      },
      {
        type: "CERTIFICATE" as const, code: "BIRTH_CERT", titleEn: "Birth certificate", titleTe: "జనన ధృవీకరణ పత్రం",
        summaryEn: "Births are registered with the local registrar; certificates are issued from the civil registration system.",
        summaryTe: "జననాలు స్థానిక రిజిస్ట్రార్ వద్ద నమోదవుతాయి; ధృవపత్రాలు పౌర నమోదు వ్యవస్థ నుండి జారీ అవుతాయి.",
        stepsEn: ["Contact the local registrar (panchayat/municipality) where the birth took place.", "Submit the application with the hospital discharge summary if available.", "Collect the certificate or download it if your registrar provides it online."],
        stepsTe: ["జననం జరిగిన ప్రాంత స్థానిక రిజిస్ట్రార్ (పంచాయతీ/మున్సిపాలిటీ)ని సంప్రదించండి.", "ఆసుపత్రి డిశ్చార్జ్ సమ్మరీ ఉంటే దానితో దరఖాస్తు సమర్పించండి.", "ధృవపత్రం తీసుకోండి లేదా ఆన్‌లైన్‌లో అందుబాటులో ఉంటే డౌన్‌లోడ్ చేసుకోండి."],
        documentsEn: ["Parents' ID proof", "Hospital record of birth (if available)"],
        documentsTe: ["తల్లిదండ్రుల గుర్తింపు పత్రం", "ఆసుపత్రి జనన రికార్డు (ఉంటే)"],
        officialSourceName: "Civil Registration System", officialSourceUrl: "https://crsorgi.gov.in",
      },
    ];
    let i = 0;
    for (const a of articles) await prisma.guidanceArticle.create({ data: { tenantId: tenant.id, ...a, status: "DRAFT", sortOrder: ++i } });
  }
  return tenant;
}

async function main() {
  const slugs = TENANTS.map((t) => t.slug);
  await prisma.tenant.deleteMany({ where: { slug: { in: slugs } } });
  await prisma.user.deleteMany({ where: { email: "platform@constituencyos.demo" } });
  await prisma.user.create({
    data: { email: "platform@constituencyos.demo", name: "Platform Administrator", role: "PLATFORM_ADMIN", passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) },
  });
  for (let i = 0; i < TENANTS.length; i++) {
    const t = await seedTenant(TENANTS[i], i);
    const n = await prisma.grievance.count({ where: { tenantId: t.id } });
    console.log(`✔ Seeded ${t.officeName}: ${n} fictional grievances`);
  }
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD}) — local development only:`);
  console.log("  platform@constituencyos.demo   Platform administrator");
  for (const t of TENANTS) for (const u of t.users) console.log(`  ${u.email.padEnd(30)} ${u.role}${u.team ? ` (${u.team})` : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
