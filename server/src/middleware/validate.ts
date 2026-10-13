import type { Request } from "express";
import { z, ZodTypeAny } from "zod";
import { badRequest } from "../lib/errors";

export function parseBody<T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const r = schema.safeParse(req.body);
  if (!r.success) throw badRequest("Invalid request body", r.error.flatten());
  return r.data;
}

export function parseQuery<T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const r = schema.safeParse(req.query);
  if (!r.success) throw badRequest("Invalid query parameters", r.error.flatten());
  return r.data;
}

export const idParam = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);

export function paramId(req: Request, key = "id"): string {
  const r = idParam.safeParse(req.params[key]);
  if (!r.success) throw badRequest("Invalid id");
  return r.data;
}
