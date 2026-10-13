import { config } from "./config";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { createApp } from "./app";
import { runEscalationSweep } from "./services/grievance";
import { getProvider } from "./services/ai";
import { drainWebhookQueue } from "./routes/webhook";

const app = createApp();
const server = app.listen(config.PORT, () => {
  const ai = getProvider();
  logger.info(`ConstituencyOS API listening on http://localhost:${config.PORT}`);
  logger.info(`AI: ${ai.label}${ai.live ? "" : " — running in DEMO MODE"}`);
  logger.info(`WhatsApp simulator: ${config.SIMULATOR_ENABLED ? "ENABLED (demo only)" : "disabled"}`);
});

let timer: NodeJS.Timeout | undefined;
if (config.ESCALATION_JOB_INTERVAL_MINUTES > 0) {
  const tick = () =>
    runEscalationSweep()
      .then((n) => n && logger.info(`Escalation sweep: ${n} case(s) escalated`))
      .catch((err) => logger.error({ err }, "Escalation sweep failed"));
  setTimeout(tick, 10_000);
  timer = setInterval(tick, config.ESCALATION_JOB_INTERVAL_MINUTES * 60_000);
}

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  if (timer) clearInterval(timer);
  server.close();
  await drainWebhookQueue();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
