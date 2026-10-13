import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, H, login, makeTenant, PASSWORD } from "./helpers";
import { prisma } from "../src/lib/prisma";

describe("authentication & request security", () => {
  it("signs in with a valid password and sets an httpOnly session cookie", async () => {
    const f = await makeTenant();
    const res = await request(app()).post("/api/auth/login").set(H).send({ email: f.admin, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("cos_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("rejects a wrong password with a generic message and audits the attempt", async () => {
    const f = await makeTenant();
    const res = await request(app()).post("/api/auth/login").set(H).send({ email: f.admin, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Incorrect email or password");
    const audit = await prisma.auditLog.findFirst({ where: { action: "auth.login_failed", actorName: f.admin } });
    expect(audit).not.toBeNull();
  });

  it("rejects deactivated users", async () => {
    const f = await makeTenant();
    await prisma.user.update({ where: { email: f.field }, data: { active: false } });
    const res = await request(app()).post("/api/auth/login").set(H).send({ email: f.field, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it("requires a session for protected routes", async () => {
    expect((await request(app()).get("/api/grievances")).status).toBe(401);
    expect((await request(app()).get("/api/dashboard")).status).toBe(401);
  });

  it("blocks state-changing requests without the CSRF header", async () => {
    const f = await makeTenant();
    const res = await request(app()).post("/api/auth/login").send({ email: f.admin, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("validates request bodies with clear errors", async () => {
    const f = await makeTenant();
    const admin = await login(f.admin);
    const res = await admin.post("/api/grievances").set(H).send({ citizenName: "A", description: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 400 for malformed JSON instead of crashing", async () => {
    const res = await request(app()).post("/api/auth/login").set({ ...H, "content-type": "application/json" }).send("{not json");
    expect(res.status).toBe(400);
  });
});
