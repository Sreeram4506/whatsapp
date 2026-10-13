import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/** The server package root, whether running from src/ (tsx) or the compiled dist/src/. */
function findServerRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
export const serverRoot = findServerRoot();

// Load server/.env when present (Node >= 20.12). Real deployments inject env vars directly.
try {
  process.loadEnvFile(path.join(serverRoot, ".env"));
} catch {
  /* no .env file — rely on the process environment */
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  SESSION_HOURS: z.coerce.number().default(8),
  WEB_ORIGIN: z.string().default("http://localhost:5180"),
  PUBLIC_WEB_URL: z.string().default("http://localhost:5180"),
  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
  SIMULATOR_ENABLED: bool,
  /** Shows seeded demo accounts on the sign-in page. Never enable in production. */
  DEMO_LOGIN_HINTS: bool,
  ESCALATION_JOB_INTERVAL_MINUTES: z.coerce.number().default(15),
  LOG_LEVEL: z.string().default("info"),

  WHATSAPP_GRAPH_API_VERSION: z.string().default("v26.0"),
  WHATSAPP_GRAPH_BASE_URL: z.string().default("https://graph.facebook.com"),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(""),
  WHATSAPP_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_STATUS_UPDATE: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_LANG_EN: z.string().default("en"),
  WHATSAPP_TEMPLATE_LANG_TE: z.string().default("te"),

  AI_PROVIDER: z.enum(["anthropic", "openai-compatible", "none"]).default("none"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  OPENAI_COMPAT_BASE_URL: z.string().optional().default(""),
  OPENAI_COMPAT_API_KEY: z.string().optional().default(""),
  OPENAI_COMPAT_MODEL: z.string().optional().default(""),
  AI_TIMEOUT_MS: z.coerce.number().default(30000),

  STT_PROVIDER: z.enum(["openai-compatible", "none"]).default("none"),
  STT_BASE_URL: z.string().optional().default(""),
  STT_API_KEY: z.string().optional().default(""),
  STT_MODEL: z.string().optional().default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid server configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid server configuration — see server/.env.example");
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  storageDir: path.resolve(serverRoot, parsed.data.STORAGE_DIR),
  webOrigins: parsed.data.WEB_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
};

export type AppConfig = typeof config;
