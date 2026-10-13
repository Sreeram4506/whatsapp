import path from "node:path";

// Must run before any application module reads configuration.
try {
  process.loadEnvFile(path.resolve(__dirname, "..", ".env"));
} catch {
  /* env provided by CI */
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret-123456";
process.env.SIMULATOR_ENABLED = "true";
process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
process.env.WHATSAPP_APP_SECRET = "test-app-secret";
process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
process.env.WHATSAPP_TEMPLATE_STATUS_UPDATE = "";
process.env.AI_PROVIDER = "none";
process.env.ESCALATION_JOB_INTERVAL_MINUTES = "0";
process.env.STORAGE_DIR = "./storage-test";
