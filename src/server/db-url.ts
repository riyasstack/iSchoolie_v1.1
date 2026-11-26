/**
 * Database connection strings, from either our own variables or the ones the
 * Supabase ↔ Vercel integration syncs:
 * - runtime (may be a transaction pooler): DATABASE_URL → POSTGRES_PRISMA_URL → POSTGRES_URL
 * - Prisma CLI / migrations (direct or session-mode): DIRECT_URL → POSTGRES_URL_NON_POOLING
 *   → the runtime URL
 *
 * Supabase's direct host (db.<ref>.supabase.co) is IPv6-only, which serverless hosts such
 * as Vercel can't reach. When SUPABASE_POOLER_HOST is set (e.g.
 * aws-0-ap-northeast-1.pooler.supabase.com), a direct URL is rewritten to the same
 * project's IPv4 pooler: transaction mode (6543) at runtime, session mode (5432) for
 * migrations, username `postgres.<ref>`, same password and database.
 *
 * node-postgres treats `sslmode=require` as full certificate verification, which fails
 * against poolers whose CA isn't in Node's trust store. libpq semantics (encrypt, don't
 * verify the CA) are requested explicitly with `uselibpqcompat=true` unless the URL already
 * says how to handle TLS.
 */
const SUPABASE_DIRECT_HOST = /^db\.([a-z0-9]+)\.supabase\.co$/i;

export function viaSupabasePooler(url: string, mode: "transaction" | "session"): string {
  const poolerHost = process.env.SUPABASE_POOLER_HOST?.trim();
  if (!poolerHost) return url;
  try {
    const u = new URL(url);
    const m = SUPABASE_DIRECT_HOST.exec(u.hostname);
    if (!m) return url;
    const ref = m[1];
    const user = decodeURIComponent(u.username || "postgres");
    u.username = encodeURIComponent(user.includes(".") ? user : `${user}.${ref}`);
    u.hostname = poolerHost;
    u.port = mode === "transaction" ? "6543" : "5432";
    if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
    return u.toString();
  } catch {
    return url;
  }
}

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
  const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  return pgCompatible(url ? viaSupabasePooler(url, "transaction") : undefined);
}

export function migrationDatabaseUrl(): string | undefined {
  const url = process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  return url ? viaSupabasePooler(url, "session") : undefined;
}
