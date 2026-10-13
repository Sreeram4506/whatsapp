import { describe, expect, it } from "vitest";
import { H, login, makeTenant, fileComplaintViaChat, userId } from "./helpers";
import { prisma } from "../src/lib/prisma";

describe("role-based access control", () => {
  it("gives the MLA a read-only executive view with masked citizen contacts", async () => {
    const f = await makeTenant();
    const ticket = await fileComplaintViaChat(f, "919222200001");
    const g = await prisma.grievance.findFirstOrThrow({ where: { ticketNumber: ticket, tenantId: f.tenantId } });
    const mla = await login(f.mla);

    const detail = await mla.get(`/api/grievances/${g.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.permissions.readOnly).toBe(true);
    expect(detail.body.allowedTransitions).toEqual([]);
    expect(detail.body.citizen.phoneMasked).not.toContain("919222200001");
    expect(detail.body.citizen.name).not.toBe("Lakshmi Test");

    expect((await mla.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "VERIFICATION" })).status).toBe(403);
    expect((await mla.post(`/api/grievances/${g.id}/assign`).set(H).send({ teamId: f.teamId })).status).toBe(403);
    expect((await mla.post(`/api/grievances/${g.id}/reveal-contact`).set(H)).status).toBe(403);
    expect((await mla.get("/api/users")).status).toBe(403);
    expect((await mla.get("/api/dashboard")).status).toBe(200);
  });

  it("lets the MLA see contacts only when the office explicitly authorises it", async () => {
    const f = await makeTenant();
    const ticket = await fileComplaintViaChat(f, "919222200002");
    const g = await prisma.grievance.findFirstOrThrow({ where: { ticketNumber: ticket, tenantId: f.tenantId } });
    const admin = await login(f.admin);
    await admin.patch("/api/settings").set(H).send({ settings: { mlaCanViewCitizenContact: true } }).expect(200);
    const mla = await login(f.mla);
    const r = await mla.post(`/api/grievances/${g.id}/reveal-contact`).set(H);
    expect(r.status).toBe(200);
    expect(r.body.phone).toContain("92222");
    const logged = await prisma.auditLog.findFirst({ where: { tenantId: f.tenantId, action: "citizen.contact_revealed" } });
    expect(logged?.actorRole).toBe("MLA");
  });

  it("restricts field officers to their own assignments and forbids resolving", async () => {
    const f = await makeTenant();
    const ticket = await fileComplaintViaChat(f, "919222200003");
    const g = await prisma.grievance.findFirstOrThrow({ where: { ticketNumber: ticket, tenantId: f.tenantId } });
    const fo = await login(f.field);
    const fo2 = await login(f.field2);

    // Not assigned yet → invisible
    expect((await fo.get(`/api/grievances/${g.id}`)).status).toBe(404);
    expect((await fo.get("/api/grievances")).body.total).toBe(0);

    const admin = await login(f.admin);
    await admin.post(`/api/grievances/${g.id}/assign`).set(H).send({ teamId: f.teamId, assigneeId: await userId(f.field) }).expect(200);

    expect((await fo.get(`/api/grievances/${g.id}`)).status).toBe(200);
    expect((await fo2.get(`/api/grievances/${g.id}`)).status).toBe(404);
    // assigneeId filter cannot be used to peek at colleagues' work
    expect((await fo2.get(`/api/grievances?assigneeId=${await userId(f.field)}`)).body.total).toBe(0);

    expect((await fo.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "IN_PROGRESS" })).status).toBe(200);
    const resolve = await fo.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "RESOLVED", resolutionNotes: "done" });
    expect(resolve.status).toBe(403);
    expect((await fo.post(`/api/grievances/${g.id}/notes`).set(H).send({ message: "Hi citizen", visibility: "CITIZEN" })).status).toBe(403);
    expect((await fo.get("/api/dashboard")).status).toBe(403);
  });
});

describe("data-subject erasure", () => {
  it("removes personal data, files, chat history and raw webhook payloads but keeps anonymous case counts", async () => {
    const f = await makeTenant();
    const phone = "919777700001";
    const ticket = await fileComplaintViaChat(f, phone);
    const g = await prisma.grievance.findFirstOrThrow({ where: { ticketNumber: ticket, tenantId: f.tenantId } });
    await prisma.webhookEvent.create({ data: { tenantId: f.tenantId, provider: "whatsapp", eventKey: `msg:erase-${f.slug}`, payload: { from: phone, text: { body: "hello" } } } });
    const admin = await login(f.admin);

    expect((await admin.post(`/api/citizens/${g.citizenId}/erase`).set(H).send({ reason: "Citizen request", confirm: "nope" })).status).toBe(400);
    expect((await admin.post(`/api/citizens/${g.citizenId}/erase`).set(H).send({ reason: "Citizen request received on 12 Oct", confirm: "ERASE" })).status).toBe(200);

    const c = await prisma.citizen.findUniqueOrThrow({ where: { id: g.citizenId } });
    expect(c.name).toBeNull();
    expect(c.phone).toMatch(/^erased-/);
    expect(c.erasedAt).not.toBeNull();
    expect(await prisma.message.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await prisma.webhookEvent.count({ where: { eventKey: `msg:erase-${f.slug}` } })).toBe(0);
    const after = await prisma.grievance.findUniqueOrThrow({ where: { id: g.id } });
    expect(after.description).toContain("Removed");
    // The case still counts in statistics
    expect((await admin.get("/api/dashboard?days=30")).body.kpis.total).toBe(1);
    // MLA/admin views show the erased marker, never old data
    const detail = await admin.get(`/api/grievances/${g.id}`);
    expect(detail.body.citizen.name).toBe("[erased]");
    expect((await admin.post(`/api/citizens/${g.citizenId}/erase`).set(H).send({ reason: "again again", confirm: "ERASE" })).status).toBe(409);
  });
});
