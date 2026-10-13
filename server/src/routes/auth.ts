import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { unauthorized } from "../lib/errors";
import { tenantSettings } from "../lib/domain";
import { authenticate, setSessionCookie, signSession, SESSION_COOKIE } from "../middleware/auth";
import { loginLimiter } from "../middleware/rateLimit";
import { parseBody } from "../middleware/validate";

export const authRouter = Router();

// Constant-time-ish defence against user enumeration: always run a bcrypt compare.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

authRouter.post("/login", loginLimiter, async (req, res) => {
  const body = parseBody(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }), req);
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    await audit({ tenantId: user?.tenantId ?? null, actorLabel: body.email.toLowerCase(), action: "auth.login_failed", entityType: "User", entityId: user?.id, ip: req.ip });
    throw unauthorized("Incorrect email or password");
  }
  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant?.active) throw unauthorized("This workspace is disabled");
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ tenantId: user.tenantId, actor: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, email: user.email, teamId: user.teamId }, action: "auth.login", entityType: "User", entityId: user.id, ip: req.ip });
  setSessionCookie(res, signSession(user.id));
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const u = req.user!;
  const tenant = u.tenantId ? await prisma.tenant.findUnique({ where: { id: u.tenantId } }) : null;
  const team = u.teamId ? await prisma.team.findUnique({ where: { id: u.teamId } }) : null;
  res.json({
    user: { id: u.id, name: u.name, email: u.email, role: u.role, team: team ? { id: team.id, name: team.name } : null },
    tenant: tenant && {
      id: tenant.id,
      slug: tenant.slug,
      officeName: tenant.officeName,
      mlaName: tenant.mlaName,
      mlaDesignation: tenant.mlaDesignation,
      constituency: tenant.constituency,
      district: tenant.district,
      isSampleBranding: tenant.isSampleBranding,
      isDemoData: tenant.isDemoData,
      brandColor: tenant.brandColor,
      ticketPrefix: tenant.ticketPrefix,
      settings: tenantSettings(tenant),
    },
  });
});
