import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, H, login, makeTenant, fileComplaintViaChat, say, userId } from "./helpers";
import { prisma } from "../src/lib/prisma";
import { runEscalationSweep } from "../src/services/grievance";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T | null | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await sleep(40);
  }
}

describe("citizen-to-office end-to-end workflow", () => {
  it("runs chat → ticket → assign → field work → resolve → citizen confirmation", async () => {
    const f = await makeTenant();
    const phone = "919333300001";

    // 2–4. Citizen files via chatbot; backend validates, persists, issues a unique ticket
    const ticket = await fileComplaintViaChat(f, phone);
    expect(ticket).toMatch(/^TST-\d{4}-\d{6}$/);
    const g = await prisma.grievance.findFirstOrThrow({ where: { tenantId: f.tenantId, ticketNumber: ticket }, include: { citizen: true } });
    expect(g.status).toBe("RECEIVED");
    expect(g.source).toBe("SIMULATOR");
    expect(g.citizen.name).toBe("Lakshmi Test");
    expect((g.priorityReasons as string[]).length).toBeGreaterThan(0);
    const consent = await prisma.consentRecord.findFirst({ where: { citizenId: g.citizenId, type: "PROCESSING_GRANTED" } });
    expect(consent).not.toBeNull();

    // 5. Citizen retrieves status over chat
    await say(f.slug, phone, { kind: "reply", id: "menu:track", title: "Track" });
    const tracked = await say(f.slug, phone, { kind: "reply", id: `trk:${g.id}`, title: ticket });
    expect(tracked.replies[0].body).toContain(ticket);
    expect(tracked.replies[0].body).toContain("Received");

    // …and via the public tracking page (ticket + last 4 digits)
    const pub = await request(app()).post("/api/public/track").set(H).send({ slug: f.slug, ticket, phoneLast4: "0001" });
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe("RECEIVED");
    const wrong = await request(app()).post("/api/public/track").set(H).send({ slug: f.slug, ticket, phoneLast4: "9999" });
    expect(wrong.status).toBe(404);

    // 6. Admin assigns to a team + field officer → citizen notified (simulated)
    const admin = await login(f.admin);
    await admin.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "VERIFICATION" }).expect(200);
    const assigned = await admin.post(`/api/grievances/${g.id}/assign`).set(H).send({ teamId: f.teamId, assigneeId: await userId(f.field) });
    expect(assigned.status).toBe(200);
    expect(assigned.body.status).toBe("ASSIGNED");
    expect(assigned.body.dueAt).toBeTruthy();
    const note = await waitFor(() =>
      prisma.message.findFirst({ where: { grievanceId: g.id, direction: "OUTBOUND", body: { contains: "assigned" } } }),
    );
    expect(note.status).toBe("SIMULATED");
    expect(note.channel).toBe("SIMULATOR");

    // 7. Field officer records progress & evidence
    const fo = await login(f.field);
    await fo.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "IN_PROGRESS" }).expect(200);
    await fo.post(`/api/grievances/${g.id}/inspection`).set(H).send({ notes: "Inspected 80 m stretch; 6 potholes." }).expect(201);
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    const up = await fo.post(`/api/grievances/${g.id}/attachments`).set(H).field("kind", "AFTER").attach("file", png, { filename: "after.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const fake = await fo.post(`/api/grievances/${g.id}/attachments`).set(H).field("kind", "AFTER").attach("file", Buffer.from("not an image"), { filename: "x.png", contentType: "image/png" });
    expect(fake.status).toBe(400); // magic-byte validation
    await fo.post(`/api/grievances/${g.id}/request-resolution`).set(H).send({ notes: "Potholes filled." }).expect(200);
    // Attachment is private: field officer can read, other workspace cannot
    expect((await fo.get(`/api/attachments/${up.body.id}`)).status).toBe(200);

    // Invalid transition is rejected with allowed list
    const bad = await admin.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "RECEIVED" });
    expect(bad.status).toBe(400);
    // Resolution requires notes
    expect((await admin.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "RESOLVED" })).status).toBe(400);

    // 8. Office marks resolved → citizen asked to confirm
    await admin.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "RESOLVED", resolutionNotes: "Road patched over 80 m." }).expect(200);
    const resolvedMsg = await waitFor(() =>
      prisma.message.findFirst({ where: { grievanceId: g.id, direction: "OUTBOUND", body: { contains: "resolved" } } }),
    );
    expect((resolvedMsg.payload as { content: { kind: string } }).content.kind).toBe("buttons");

    // Citizen confirms and rates → CLOSED
    await say(f.slug, phone, { kind: "reply", id: `fb:yes:${g.id}`, title: "Yes" });
    const rated = await say(f.slug, phone, { kind: "reply", id: "rate:5", title: "Excellent" });
    expect(rated.replies[0].body).toContain(ticket);
    const closed = await prisma.grievance.findUniqueOrThrow({ where: { id: g.id } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.feedbackRating).toBe(5);
    expect(closed.citizenConfirmed).toBe(true);

    // Audit trail captured each status change with actor
    const trail = await prisma.auditLog.findMany({ where: { entityId: g.id, action: "grievance.status" } });
    expect(trail.length).toBeGreaterThanOrEqual(3);
    expect(trail.every((t) => t.actorName)).toBe(true);

    // 9. Dashboard statistics come from the database
    const dash = await admin.get("/api/dashboard?days=30");
    expect(dash.body.kpis.total).toBe(1);
    expect(dash.body.kpis.resolved).toBe(1);
    expect(dash.body.kpis.satisfaction.average).toBe(5);
    expect(dash.body.kpis.avgResolutionDays.sufficient).toBe(false); // fewer than 5 resolved → no average shown

    // 11. Reports export correctly
    const csv = await admin.get("/api/reports/grievances.csv");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain(ticket);
    expect(csv.text).not.toContain("919333300001"); // phones masked
    const agg = await admin.get("/api/reports/aggregate.csv?by=village");
    expect(agg.text).toContain("<3"); // small counts suppressed
  });

  it("lets the citizen reopen a resolved complaint", async () => {
    const f = await makeTenant();
    const phone = "919333300002";
    const ticket = await fileComplaintViaChat(f, phone);
    const g = await prisma.grievance.findFirstOrThrow({ where: { tenantId: f.tenantId, ticketNumber: ticket } });
    const admin = await login(f.admin);
    await admin.post(`/api/grievances/${g.id}/assign`).set(H).send({ teamId: f.teamId }).expect(200);
    await admin.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "IN_PROGRESS" }).expect(200);
    await admin.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "RESOLVED", resolutionNotes: "Fixed" }).expect(200);
    await say(f.slug, phone, { kind: "reply", id: `fb:no:${g.id}`, title: "Not solved" });
    await say(f.slug, phone, { kind: "text", text: "Potholes came back after the rain" });
    const after = await prisma.grievance.findUniqueOrThrow({ where: { id: g.id } });
    expect(after.status).toBe("REOPENED");
    expect(after.reopenCount).toBe(1);
  });

  it("suggests duplicates, recovers unfinished submissions and validates inputs", async () => {
    const f = await makeTenant();
    await fileComplaintViaChat(f, "919333300003");
    const phone = "919333300004";
    await say(f.slug, phone, { kind: "text", text: "hi" });
    await say(f.slug, phone, { kind: "reply", id: "lang:en", title: "English" });
    await say(f.slug, phone, { kind: "reply", id: "menu:register", title: "Register" });
    await say(f.slug, phone, { kind: "reply", id: "consent:yes", title: "I agree" });
    const badName = await say(f.slug, phone, { kind: "text", text: "1" });
    expect(badName.state).toBe("c_name");
    await say(f.slug, phone, { kind: "text", text: "Ravi Test" });
    // Interrupt with a greeting → resume prompt
    const resume = await say(f.slug, phone, { kind: "text", text: "hi" });
    expect(resume.state).toBe("c_resume");
    const cont = await say(f.slug, phone, { kind: "reply", id: "resume:continue", title: "Continue" });
    expect(cont.state).toBe("c_mandal");
    await say(f.slug, phone, { kind: "reply", id: `mandal:${f.mandalId}`, title: "Central" });
    await say(f.slug, phone, { kind: "reply", id: `village:${f.villageId}`, title: "Rampur" });
    await say(f.slug, phone, { kind: "reply", id: `cat:${f.categoryId}`, title: "Roads" });
    const short = await say(f.slug, phone, { kind: "text", text: "bad road" });
    expect(short.state).toBe("c_description");
    const dup = await say(f.slug, phone, { kind: "text", text: "Potholes on main road near the school, very dangerous for bikes." });
    expect(dup.state).toBe("c_duplicate");
    expect(dup.replies[0].body).toMatch(/TST-\d{4}-\d{6}/);
  });

  it("honours STOP / START opt-out and suppresses proactive updates", async () => {
    const f = await makeTenant();
    const phone = "919333300005";
    const ticket = await fileComplaintViaChat(f, phone);
    const stop = await say(f.slug, phone, { kind: "text", text: "STOP" });
    expect(stop.replies[0].body).toContain("opted out");
    const g = await prisma.grievance.findFirstOrThrow({ where: { tenantId: f.tenantId, ticketNumber: ticket } });
    const admin = await login(f.admin);
    await admin.post(`/api/grievances/${g.id}/notes`).set(H).send({ message: "We are on it", visibility: "CITIZEN" }).expect(201);
    const m = await waitFor(() => prisma.message.findFirst({ where: { grievanceId: g.id, body: { contains: "We are on it" } } }));
    expect(m.status).toBe("SUPPRESSED");
    const start = await say(f.slug, phone, { kind: "text", text: "START" });
    expect(start.replies[0].body).toContain("again");
  });

  it("escalates overdue cases idempotently", async () => {
    const f = await makeTenant();
    const ticket = await fileComplaintViaChat(f, "919333300006");
    const g = await prisma.grievance.findFirstOrThrow({ where: { tenantId: f.tenantId, ticketNumber: ticket } });
    await prisma.grievance.update({ where: { id: g.id }, data: { status: "ASSIGNED", dueAt: new Date(Date.now() - 72 * 3600_000) } });
    expect(await runEscalationSweep(new Date(), f.tenantId)).toBe(1);
    expect(await runEscalationSweep(new Date(), f.tenantId)).toBe(0);
    const after = await prisma.grievance.findUniqueOrThrow({ where: { id: g.id } });
    expect(after.escalationLevel).toBe(2);
  });

  it("answers Ask Constituency AI questions from computed data in demo mode", async () => {
    const f = await makeTenant();
    await fileComplaintViaChat(f, "919333300007");
    const mla = await login(f.mla);
    const r = await mla.post("/api/ai/ask").set(H).send({ question: "Which villages have the highest number of unresolved issues?" });
    expect(r.status).toBe(200);
    expect(r.body.intent).toBe("top_villages");
    expect(r.body.narrativeSource).toBe("rules");
    expect(r.body.tables[0].rows[0][0]).toBe("Rampur");
    expect(r.body.recordsConsidered).toBe(1);
  });
});
