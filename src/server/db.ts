import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  // All DateTime columns are UTC "timestamp without time zone". Pin every session to UTC so
  // database-side defaults (CURRENT_TIMESTAMP) agree with values written by the app,
  // regardless of the server's configured time zone. Connection poolers (e.g. Supabase's
  // transaction pooler) may reject startup options: set DB_PIN_TIMEZONE=false there, and
  // make sure the database's own TimeZone is UTC (Supabase's default).
  const pinTimezone = process.env.DB_PIN_TIMEZONE !== "false";
  const max = Number(process.env.DB_POOL_MAX ?? 10);
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max, ...(pinTimezone ? { options: "-c timezone=UTC" } : {}) }),
  });
}

export const prisma: PrismaClient = globalForPrisma.__prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type Db = PrismaClient | Tx;
