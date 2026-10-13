import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { badRequest, notFound } from "../lib/errors";
import { simulatorLimiter } from "../middleware/rateLimit";
import { parseBody, parseQuery } from "../middleware/validate";
import { processInbound } from "../services/bot/inbound";
import { putObject, readObject, safeFileName, validateUpload, AUDIO_MIME } from "../services/storage";
import { transcribe } from "../services/ai/stt";

/**
 * Browser-based WhatsApp SIMULATOR for demos and development.
 * Messages here never touch WhatsApp; every reply is stored with delivery status SIMULATED.
 * Disable with SIMULATOR_ENABLED=false in production.
 */
export const simulatorRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

const phoneSchema = z.string().regex(/^\d{10,15}$/, "Phone must be 10–15 digits incl. country code");

simulatorRouter.use((req, _res, next) => {
  if (!config.SIMULATOR_ENABLED) return next(notFound("Simulator is disabled"));
  next();
});
simulatorRouter.use(simulatorLimiter);

async function tenantBySlug(slug: string) {
  const t = await prisma.tenant.findFirst({ where: { slug, active: true } });
  if (!t) throw notFound("Workspace not found");
  return t;
}

async function listMessages(tenantId: string, phone: string, after?: Date) {
  const convo = await prisma.conversation.findUnique({
    where: { tenantId_channel_citizenPhone: { tenantId, channel: "SIMULATOR", citizenPhone: phone } },
  });
  if (!convo) return { conversation: null, messages: [] };
  const messages = await prisma.message.findMany({
    where: { conversationId: convo.id, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 300,
    select: { id: true, direction: true, type: true, body: true, payload: true, status: true, createdAt: true, grievanceId: true },
  });
  return { conversation: { state: convo.state, language: convo.language }, messages };
}

const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(2000) }),
  z.object({ kind: z.literal("reply"), id: z.string().min(1).max(200), title: z.string().max(100) }),
  z.object({
    kind: z.literal("media"),
    mediaType: z.enum(["image", "document"]),
    attachmentId: z.string().min(1).max(40),
    fileName: z.string().max(200).optional(),
    caption: z.string().max(500).optional(),
  }),
  z.object({ kind: z.literal("location"), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), name: z.string().max(200).optional() }),
]);

simulatorRouter.get("/:slug/messages", async (req, res) => {
  const tenant = await tenantBySlug(String(req.params.slug));
  const q = parseQuery(z.object({ phone: phoneSchema, after: z.string().datetime().optional() }), req);
  res.json(await listMessages(tenant.id, q.phone, q.after ? new Date(q.after) : undefined));
});

simulatorRouter.post("/:slug/messages", async (req, res) => {
  const tenant = await tenantBySlug(String(req.params.slug));
  const body = parseBody(z.object({ phone: phoneSchema, input: inputSchema, after: z.string().datetime().optional() }), req);
  if (body.input.kind === "media") {
    const att = await prisma.attachment.findFirst({ where: { id: body.input.attachmentId, tenantId: tenant.id, source: "SIMULATOR" }, include: {} });
    const citizen = await prisma.citizen.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone: body.phone } } });
    if (!att || att.citizenId !== citizen?.id) throw badRequest("Unknown attachment");
  }
  const result = await processInbound(tenant, "SIMULATOR", body.phone, body.input);
  res.json({ ...result, ...(await listMessages(tenant.id, body.phone, body.after ? new Date(body.after) : undefined)) });
});

simulatorRouter.post("/:slug/media", upload.single("file"), async (req, res) => {
  const tenant = await tenantBySlug(String(req.params.slug));
  const phone = phoneSchema.parse(req.body?.phone);
  if (!req.file) throw badRequest("No file uploaded");
  const mime = validateUpload(req.file.buffer, req.file.mimetype);
  const citizen = await prisma.citizen.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
    update: {},
    create: { tenantId: tenant.id, phone, preferredLanguage: tenant.defaultLanguage },
  });
  const stored = await putObject(tenant.id, req.file.buffer, mime);
  const att = await prisma.attachment.create({
    data: {
      tenantId: tenant.id,
      citizenId: citizen.id,
      kind: "CITIZEN_UPLOAD",
      fileName: safeFileName(req.file.originalname),
      mimeType: mime,
      source: "SIMULATOR",
      ...stored,
    },
  });
  res.json({ attachmentId: att.id, fileName: att.fileName, mimeType: att.mimeType, sizeBytes: att.sizeBytes });
});

/** Voice note: transcribed when STT is configured; otherwise the bot explains voice is unavailable. */
simulatorRouter.post("/:slug/voice", upload.single("file"), async (req, res) => {
  const tenant = await tenantBySlug(String(req.params.slug));
  const phone = phoneSchema.parse(req.body?.phone);
  if (!req.file) throw badRequest("No audio uploaded");
  const mime = req.file.mimetype.split(";")[0];
  if (!AUDIO_MIME.includes(mime)) throw badRequest("Unsupported audio type");
  const convo = await prisma.conversation.findUnique({ where: { tenantId_channel_citizenPhone: { tenantId: tenant.id, channel: "SIMULATOR", citizenPhone: phone } } });
  const transcript = await transcribe(req.file.buffer, mime, convo?.language === "en" ? "en" : "te");
  const result = await processInbound(tenant, "SIMULATOR", phone, { kind: "media", mediaType: "audio", transcript });
  res.json({ ...result, ...(await listMessages(tenant.id, phone, req.body?.after ? new Date(String(req.body.after)) : undefined)) });
});

simulatorRouter.get("/:slug/media/:id", async (req, res) => {
  const tenant = await tenantBySlug(String(req.params.slug));
  const phone = phoneSchema.parse(req.query.phone);
  const citizen = await prisma.citizen.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone } } });
  const att = await prisma.attachment.findFirst({ where: { id: String(req.params.id), tenantId: tenant.id, citizenId: citizen?.id ?? "-", source: "SIMULATOR" } });
  if (!att) throw notFound();
  const buf = await readObject(att.storageKey);
  res.setHeader("content-type", att.mimeType);
  res.setHeader("cache-control", "private, max-age=300");
  res.setHeader("x-content-type-options", "nosniff");
  res.send(buf);
});

/** Clears the simulated chat for this phone (grievances already filed are kept). */
simulatorRouter.post("/:slug/reset", async (req, res) => {
  const tenant = await tenantBySlug(String(req.params.slug));
  const { phone } = parseBody(z.object({ phone: phoneSchema }), req);
  const convo = await prisma.conversation.findUnique({ where: { tenantId_channel_citizenPhone: { tenantId: tenant.id, channel: "SIMULATOR", citizenPhone: phone } } });
  if (convo) {
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { conversationId: convo.id } }),
      prisma.conversation.update({ where: { id: convo.id }, data: { state: "idle", data: {}, language: null } }),
    ]);
  }
  res.json({ ok: true });
});
