import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runtimeDatabaseUrl } from "./db-url";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function create() {
  const url = runtimeDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set (or POSTGRES_PRISMA_URL from the Supabase integration). See .env.example.");
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

/** The real client, created on first use (one per process; reused across dev reloads). */
function client(): PrismaClient {
  return (globalForPrisma.__prisma ??= create());
}

/**
 * Lazily-connected client: importing this module never needs a database, so `next build`
 * (which imports server code while collecting page data) works without DATABASE_URL.
 * The first property access creates the real client.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type Db = PrismaClient | Tx;
