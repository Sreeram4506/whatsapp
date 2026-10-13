import rateLimit from "express-rate-limit";
import { config } from "../config";

const common = { standardHeaders: "draft-7" as const, legacyHeaders: false, skip: () => config.isTest };

export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 10,
  message: { error: { code: "rate_limited", message: "Too many sign-in attempts. Try again in 15 minutes." } },
});

export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 300 });

export const publicLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 20,
  message: { error: { code: "rate_limited", message: "Too many requests. Please wait a minute." } },
});

export const simulatorLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 90 });

export const webhookLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 1200 });
