import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma";
import { applyTenantTemplate } from "../src/services/tenantTemplate";
import { createApp } from "../src/app";

export const PASSWORD = "Test@12345";
export const H = { "x-requested-with": "ConstituencyOS" };

let appSingleton: Express | null = null;
export function app() {
  appSingleton ??= createApp();
  return appSingleton;
}

export interface Fixture {
  tenantId: string;
  slug: string;
  admin: string;
  mla: string;
  field: string;
  field2: string;
  mandalId: string;
  villageId: string;
  categoryId: string;
  teamId: string;
}

let counter = 0;

/** Creates an isolated tenant with staff, geography and default categories/teams. */
export async function makeTenant(opts: { phoneNumberId?: string } = {}): Promise<Fixture> {
  const n = `${Date.now().toString(36)}${counter++}`;
  const hash = await bcrypt.hash(PASSWORD, 4);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `t-${n}`,
      officeName: `Test Office ${n}`,
      mlaName: "Test MLA",
      constituency: "Testpur",
      district: "Test District",
      ticketPrefix: "TST",
      whatsappPhoneNumberId: opts.phoneNumberId ?? null,
      defaultLanguage: "en",
    },
  });
  const teams = await prisma.$transaction((tx) => applyTenantTemplate(tx, tenant.id));
  const mandal = await prisma.mandal.create({ data: { tenantId: tenant.id, name: "Central" } });
  const village = await prisma.village.create({ data: { tenantId: tenant.id, mandalId: mandal.id, name: "Rampur" } });
  const roads = await prisma.category.findFirstOrThrow({ where: { tenantId: tenant.id, code: "ROADS" } });
  const teamId = teams.get("Roads & Buildings")!;
  const mk = (role: "OFFICE_ADMIN" | "MLA" | "FIELD_OFFICER", label: string, team?: string) =>
    prisma.user.create({ data: { tenantId: tenant.id, email: `${label}-${n}@test.local`, name: `${label} ${n}`, role, passwordHash: hash, teamId: team ?? null } });
  const [admin, mla, field, field2] = await Promise.all([
    mk("OFFICE_ADMIN", "admin"),
    mk("MLA", "mla"),
    mk("FIELD_OFFICER", "field", teamId),
    mk("FIELD_OFFICER", "field2", teamId),
  ]);
  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    admin: admin.email,
    mla: mla.email,
    field: field.email,
    field2: field2.email,
    mandalId: mandal.id,
    villageId: village.id,
    categoryId: roads.id,
    teamId,
  };
}

export async function login(email: string) {
  const agent = request.agent(app());
  const res = await agent.post("/api/auth/login").set(H).send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function userId(email: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}

/** Sends one simulator message and returns the bot's replies to it. */
export async function say(slug: string, phone: string, input: Record<string, unknown>) {
  const res = await request(app()).post(`/api/simulator/${slug}/messages`).set(H).send({ phone, input });
  if (res.status !== 200) throw new Error(`simulator ${res.status}: ${JSON.stringify(res.body)}`);
  const msgs = res.body.messages as { direction: string; payload: { content?: { kind: string; body: string; buttons?: { id: string }[]; sections?: { rows: { id: string; title: string }[] }[] } } }[];
  const lastIn = msgs.map((m) => m.direction).lastIndexOf("INBOUND");
  return { state: res.body.conversation?.state as string, replies: msgs.slice(lastIn + 1).map((m) => m.payload.content!) };
}

/** Drives the full WhatsApp complaint conversation and returns the ticket number. */
export async function fileComplaintViaChat(f: Fixture, phone: string, description = "Large potholes on the main road near the school, two bikes fell last week.") {
  await say(f.slug, phone, { kind: "text", text: "hi" });
  await say(f.slug, phone, { kind: "reply", id: "lang:en", title: "English" });
  await say(f.slug, phone, { kind: "reply", id: "menu:register", title: "Register" });
  const c = await say(f.slug, phone, { kind: "reply", id: "consent:yes", title: "I agree" });
  if (c.state === "c_consent") throw new Error("consent not accepted");
  await say(f.slug, phone, { kind: "text", text: "Lakshmi Test" });
  await say(f.slug, phone, { kind: "reply", id: `mandal:${f.mandalId}`, title: "Central" });
  await say(f.slug, phone, { kind: "reply", id: `village:${f.villageId}`, title: "Rampur" });
  await say(f.slug, phone, { kind: "reply", id: `cat:${f.categoryId}`, title: "Roads" });
  let r = await say(f.slug, phone, { kind: "text", text: description });
  if (r.state === "c_duplicate") r = await say(f.slug, phone, { kind: "reply", id: "dup:mine", title: "Register mine" });
  await say(f.slug, phone, { kind: "reply", id: "skip", title: "Skip" });
  await say(f.slug, phone, { kind: "reply", id: "skip", title: "Skip" });
  await say(f.slug, phone, { kind: "reply", id: "media:done", title: "Done" });
  await say(f.slug, phone, { kind: "reply", id: "urg:NORMAL", title: "Normal" });
  const done = await say(f.slug, phone, { kind: "reply", id: "confirm:submit", title: "Submit" });
  const body = done.replies.map((x) => x.body).join("\n");
  const ticket = body.match(/TST-\d{4}-\d{6}/)?.[0];
  if (!ticket) throw new Error(`No ticket in reply: ${body}`);
  return ticket;
}

export function sign(body: string) {
  return "sha256=" + crypto.createHmac("sha256", "test-app-secret").update(body).digest("hex");
}

export const flush = () => new Promise((r) => setTimeout(r, 50));
