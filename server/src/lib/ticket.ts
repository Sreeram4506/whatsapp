import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Atomically allocates the next per-tenant, per-year sequence number. */
export async function nextSequence(tx: Tx, tenantId: string, year: number): Promise<number> {
  const counter = await tx.ticketCounter.upsert({
    where: { tenantId_year: { tenantId, year } },
    create: { tenantId, year, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return counter.value;
}

export function formatTicket(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

export const TICKET_PATTERN = /^[A-Z]{2,6}-\d{4}-\d{6}$/;

export function normalizeTicket(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
}
