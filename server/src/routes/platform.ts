import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { DEFAULT_SETTINGS } from "../lib/domain";
import { requireRole } from "../middleware/auth";
import { paramId, parseBody } from "../middleware/validate";
import { applyTenantTemplate } from "../services/tenantTemplate";
import { tempPassword } from "./admin";

/** Platform administration: onboarding and managing MLA workspaces (tenants). */
export const platformRouter = Router();
platformRouter.use(requireRole("PLATFORM_ADMIN"));

platformRouter.get("/tenants", async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { grievances: true, users: true, citizens: true } } },
  });
  res.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      officeName: t.officeName,
      mlaName: t.mlaName,
      constituency: t.constituency,
      district: t.district,
      isSampleBranding: t.isSampleBranding,
      isDemoData: t.isDemoData,
      ticketPrefix: t.ticketPrefix,
      active: t.active,
      whatsappConfigured: !!t.whatsappPhoneNumberId,
      createdAt: t.createdAt,
      counts: t._count,
    })),
  });
});

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, "Lowercase letters, digits and dashes only"),
  officeName: z.string().min(3).max(100),
  mlaName: z.string().min(3).max(80),
  constituency: z.string().min(2).max(80),
  district: z.string().min(2).max(80),
  ticketPrefix: z.string().regex(/^[A-Z]{2,6}$/),
  defaultLanguage: z.enum(["te", "en"]).default("te"),
  /** Real MLA names/branding may only be used with documented written authorisation. */
  brandingAuthorization: z
    .object({ confirmed: z.literal(true), reference: z.string().min(5).max(200) })
    .optional(),
  mandals: z
    .array(z.object({ name: z.string().min(2).max(60), villages: z.array(z.string().min(2).max(60)).min(1).max(200) }))
    .min(1)
    .max(30),
  admin: z.object({ name: z.string().min(2).max(80), email: z.string().email().max(200) }),
});

platformRouter.post("/tenants", async (req, res) => {
  const body = parseBody(createSchema, req);
  if (await prisma.tenant.findUnique({ where: { slug: body.slug } })) throw badRequest("Slug already in use");
  if (await prisma.user.findUnique({ where: { email: body.admin.email.toLowerCase() } })) throw badRequest("Admin email already in use");
  const pw = tempPassword();
  const hash = await bcrypt.hash(pw, 12);
  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        slug: body.slug,
        officeName: body.officeName,
        mlaName: body.mlaName,
        constituency: body.constituency,
        district: body.district,
        ticketPrefix: body.ticketPrefix,
        defaultLanguage: body.defaultLanguage,
        isSampleBranding: !body.brandingAuthorization,
        settings: { ...DEFAULT_SETTINGS, brandingAuthorizationRef: body.brandingAuthorization?.reference ?? null },
      },
    });
    await applyTenantTemplate(tx, t.id);
    for (const m of body.mandals) {
      const mandal = await tx.mandal.create({ data: { tenantId: t.id, name: m.name } });
      await tx.village.createMany({
        data: [...new Set(m.villages.map((v) => v.trim()))].map((name) => ({ tenantId: t.id, mandalId: mandal.id, name })),
      });
    }
    await tx.user.create({ data: { tenantId: t.id, name: body.admin.name, email: body.admin.email.toLowerCase(), role: "OFFICE_ADMIN", passwordHash: hash } });
    await audit({ tenantId: t.id, actor: req.user, action: "tenant.create", entityType: "Tenant", entityId: t.id, details: { slug: t.slug, sampleBranding: t.isSampleBranding } }, tx);
    return t;
  });
  res.status(201).json({
    tenant: { id: tenant.id, slug: tenant.slug },
    admin: { email: body.admin.email.toLowerCase(), temporaryPassword: pw },
    note: "Share the temporary password securely; it is shown only once.",
  });
});

platformRouter.patch("/tenants/:id", async (req, res) => {
  const body = parseBody(
    z.object({
      active: z.boolean().optional(),
      brandingAuthorization: z.object({ confirmed: z.literal(true), reference: z.string().min(5).max(200) }).optional(),
      revertToSampleBranding: z.boolean().optional(),
    }),
    req,
  );
  const t = await prisma.tenant.findUnique({ where: { id: paramId(req) } });
  if (!t) throw notFound();
  const settings = { ...(t.settings as object), ...(body.brandingAuthorization ? { brandingAuthorizationRef: body.brandingAuthorization.reference } : {}) };
  await prisma.tenant.update({
    where: { id: t.id },
    data: {
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.brandingAuthorization ? { isSampleBranding: false, settings } : {}),
      ...(body.revertToSampleBranding ? { isSampleBranding: true } : {}),
    },
  });
  await audit({ tenantId: t.id, actor: req.user, action: "tenant.update", entityType: "Tenant", entityId: t.id, details: body });
  res.json({ ok: true });
});
