import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Prepares the dedicated TEST database before the suite runs:
 *   1. applies pending migrations with `prisma migrate deploy` (non-destructive)
 *   2. empties every table so each run starts clean
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
    execSync("npx prisma migrate deploy", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
      stdio: "pipe",
    });
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(`prisma migrate deploy failed:\n${e.stdout?.toString() ?? ""}\n${e.stderr?.toString() ?? ""}`.slice(0, 2000));
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
