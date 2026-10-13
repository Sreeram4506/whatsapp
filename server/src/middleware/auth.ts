import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";

export const SESSION_COOKIE = "cos_session";

export interface AuthUser {
  id: string;
  tenantId: string | null;
  role: Role;
  name: string;
  email: string;
  teamId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, {
    expiresIn: `${config.SESSION_HOURS}h`,
    algorithm: "HS256",
  });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    maxAge: config.SESSION_HOURS * 3600_000,
    path: "/",
  });
}

/** Resolves the session cookie to a fresh user record (so deactivation/role changes apply immediately). */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) return next(unauthorized("Session is no longer valid"));
    if (user.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { active: true } });
      if (!tenant?.active) return next(unauthorized("Workspace is disabled"));
    }
    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
      email: user.email,
      teamId: user.teamId,
    };
    next();
  } catch {
    next(unauthorized("Session expired — please sign in again"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** Tenant id of the signed-in staff user. Platform admins have no tenant and cannot use tenant routes. */
export function tenantOf(req: Request): string {
  const t = req.user?.tenantId;
  if (!t) throw forbidden("This action requires a workspace account");
  return t;
}

/**
 * CSRF defence for cookie-authenticated APIs: state-changing requests must carry a custom header,
 * which browsers will not attach cross-site without a CORS preflight that our allowlist rejects.
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-requested-with") !== "ConstituencyOS") {
    return next(forbidden("Missing request header"));
  }
  next();
}
