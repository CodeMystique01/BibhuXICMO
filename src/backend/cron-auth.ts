import type { NextRequest } from "next/server";
import { env } from "@/shared/env";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when
 * the env var is set on the project. In dev (no secret), we allow it locally.
 *
 * @returns true when the request is allowed.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const expected = env.CRON_SECRET?.trim();
  if (!expected) {
    return env.NODE_ENV !== "production";
  }
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}
