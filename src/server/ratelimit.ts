import { prisma } from "./db";
import { AppError } from "./errors";

/**
 * Fixed-window limiter persisted in PostgreSQL so it holds across processes and restarts.
 * Throws RATE_LIMITED when `limit` is exceeded inside `windowSec`.
 */
export async function rateLimit(key: string, limit: number, windowSec: number, message?: string) {
  const now = Date.now();
  const windowStart = new Date(now - (now % (windowSec * 1000)));
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) {
    throw new AppError("RATE_LIMITED", message ?? "You’re doing that too often. Try again in a moment.", {
      retryAfterSec: Math.ceil((windowStart.getTime() + windowSec * 1000 - now) / 1000),
    });
  }
}
