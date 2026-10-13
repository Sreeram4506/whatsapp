import { describe, expect, it } from "vitest";
import { H, login, makeTenant, fileComplaintViaChat } from "./helpers";
import { prisma } from "../src/lib/prisma";

describe("tenant isolation (backend-enforced)", () => {
  it("never exposes one MLA workspace's records to another workspace", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const ticket = await fileComplaintViaChat(a, "919111100001");
    const g = await prisma.grievance.findFirstOrThrow({ where: { tenantId: a.tenantId, ticketNumber: ticket } });

    const adminB = await login(b.admin);
    // Direct id access → 404 (not 403, so existence is not leaked)
    expect((await adminB.get(`/api/grievances/${g.id}`)).status).toBe(404);
    // List never contains tenant A rows
    const list = await adminB.get(`/api/grievances?q=${ticket}`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(0);
    // Mutations are rejected
    expect((await adminB.post(`/api/grievances/${g.id}/status`).set(H).send({ to: "VERIFICATION" })).status).toBe(404);
    expect((await adminB.post(`/api/grievances/${g.id}/assign`).set(H).send({ teamId: b.teamId })).status).toBe(404);
    expect((await adminB.post(`/api/grievances/${g.id}/notes`).set(H).send({ message: "hello", visibility: "INTERNAL" })).status).toBe(404);
    // Cannot assign using another tenant's team
    const adminA = await login(a.admin);
    expect((await adminA.post(`/api/grievances/${g.id}/assign`).set(H).send({ teamId: b.teamId })).status).toBe(400);
    // Dashboards are per-tenant
    const dashB = await adminB.get("/api/dashboard?days=30");
    expect(dashB.body.kpis.total).toBe(0);
  });

  it("keeps CSV exports, citizens and audit logs tenant-scoped", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const ticket = await fileComplaintViaChat(a, "919111100002");
    const adminB = await login(b.admin);
    const csv = await adminB.get("/api/reports/grievances.csv");
    expect(csv.status).toBe(200);
    expect(csv.text).not.toContain(ticket);
    const citizens = await adminB.get("/api/citizens");
    expect(citizens.body.total).toBe(0);
    const audit = await adminB.get("/api/audit");
    expect(audit.body.items.every((x: { tenantId: string }) => x.tenantId === b.tenantId)).toBe(true);
  });

  it("does not let platform administrators read workspace grievances", async () => {
    const a = await makeTenant();
    const bcrypt = await import("bcryptjs");
    await prisma.user.create({ data: { email: `platform-${a.slug}@test.local`, name: "P", role: "PLATFORM_ADMIN", passwordHash: await bcrypt.hash("Test@12345", 4) } });
    const p = await login(`platform-${a.slug}@test.local`);
    expect((await p.get("/api/grievances")).status).toBe(403);
    expect((await p.get("/api/platform/tenants")).status).toBe(200);
  });
});
