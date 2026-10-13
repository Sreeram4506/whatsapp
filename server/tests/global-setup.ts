import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Prepares the dedicated TEST database before the suite runs:
 *   1. synchronizes the MongoDB schema with `prisma db push`
 *   2. empties every collection so each run starts clean
 *
 * Step 2 is hard-guarded: it refuses to run unless the database name ends in "_test",
 * so it can never touch the development or a production database.
 */
export default async function setup() {
  try {
    process.loadEnvFile(path.resolve(__dirname, "..", ".env"));
  } catch {
    /* CI provides env vars directly */
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set to run tests");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/_test(\b|_|$)/.test(dbName)) {
    throw new Error(`Refusing to run tests against "${dbName}": the test database name must end with "_test"`);
  }

  try {
    execSync("npx prisma db push", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
      stdio: "pipe",
    });
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(`prisma db push failed:\n${e.stdout?.toString() ?? ""}\n${e.stderr?.toString() ?? ""}`.slice(0, 2000));
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await Promise.all([
      prisma.message.deleteMany(), prisma.webhookEvent.deleteMany(), prisma.attachment.deleteMany(),
      prisma.grievanceUpdate.deleteMany(), prisma.grievance.deleteMany(), prisma.conversation.deleteMany(),
      prisma.appointment.deleteMany(), prisma.consentRecord.deleteMany(), prisma.citizen.deleteMany(),
      prisma.guidanceArticle.deleteMany(), prisma.auditLog.deleteMany(), prisma.ticketCounter.deleteMany(),
      prisma.village.deleteMany(), prisma.mandal.deleteMany(), prisma.category.deleteMany(),
      prisma.user.deleteMany(), prisma.team.deleteMany(), prisma.tenant.deleteMany(),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}
