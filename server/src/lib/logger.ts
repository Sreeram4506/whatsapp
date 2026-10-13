import pino from "pino";
import { config } from "../config";

export const logger = pino({
  level: config.isTest ? "silent" : config.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.passwordHash",
      "*.accessToken",
    ],
    censor: "[redacted]",
  },
  transport:
    !config.isProd && !config.isTest
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
});
