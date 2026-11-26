/**
 * Database connection strings, from either our own variables or the ones the
 * Supabase ↔ Vercel integration syncs:
 * - runtime (may be a transaction pooler): DATABASE_URL → POSTGRES_PRISMA_URL → POSTGRES_URL
 * - Prisma CLI / migrations (direct or session-mode): DIRECT_URL → POSTGRES_URL_NON_POOLING
 *   → the runtime URL
 *
 * node-postgres treats `sslmode=require` as full certificate verification, which fails
 * against poolers whose CA isn't in Node's trust store. libpq semantics (encrypt, don't
 * verify the CA) are requested explicitly with `uselibpqcompat=true` unless the URL already
 * says how to handle TLS.
 */
function pgCompatible(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.searchParams.get("sslmode") === "require" && !u.searchParams.has("uselibpqcompat")) {
      u.searchParams.set("uselibpqcompat", "true");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function runtimeDatabaseUrl(): string | undefined {
  return pgCompatible(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL);
}

export function migrationDatabaseUrl(): string | undefined {
  return process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
}
