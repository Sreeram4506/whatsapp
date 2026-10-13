import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./lib/logger";
import { authenticate, requireCsrfHeader } from "./middleware/auth";
import { apiLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { publicRouter } from "./routes/public";
import { simulatorRouter } from "./routes/simulator";
import { webhookRouter } from "./routes/webhook";
import { attachmentRouter, grievanceRouter } from "./routes/grievances";
import { insightsRouter } from "./routes/insights";
import { adminRouter } from "./routes/admin";
import { platformRouter } from "./routes/platform";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.webOrigins.includes(origin)),
      credentials: true,
    }),
  );
  if (!config.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // Webhook must read the raw body for signature verification — mount before JSON parsing.
  app.use("/webhooks", webhookRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", apiLimiter, requireCsrfHeader);

  app.use("/api/public", publicRouter);
  app.use("/api/simulator", simulatorRouter);
  app.use("/api/auth", authRouter);

  app.use("/api/grievances", authenticate, grievanceRouter);
  app.use("/api/attachments", authenticate, attachmentRouter);
  app.use("/api/platform", authenticate, platformRouter);
  app.use("/api", authenticate, insightsRouter);
  app.use("/api", authenticate, adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
