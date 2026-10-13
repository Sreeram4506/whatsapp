import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Atomically allocates the next per-tenant, per-year sequence number. */
export async function nextSequence(tx: Tx, tenantId: string, year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "TicketCounter" ("tenantId", "year", "value") VALUES (${tenantId}, ${year}, 1)
    ON CONFLICT ("tenantId", "year") DO UPDATE SET "value" = "TicketCounter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

export function formatTicket(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

export const TICKET_PATTERN = /^[A-Z]{2,6}-\d{4}-\d{6}$/;

export function normalizeTicket(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
}
