import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthUser } from "../middleware/auth";

type Tx = Prisma.TransactionClient | typeof prisma;

export interface AuditInput {
  tenantId: string | null;
  actor?: AuthUser | null;
  actorLabel?: string; // e.g. "system", "citizen:whatsapp"
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string;
}

export async function audit(input: AuditInput, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? input.actorLabel ?? "system",
      actorRole: input.actor?.role ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: input.ip,
    },
  });
}
