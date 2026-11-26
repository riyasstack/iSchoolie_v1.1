import { afterEach, describe, expect, it } from "vitest";
import { migrationDatabaseUrl, runtimeDatabaseUrl } from "@/server/db-url";

const KEYS = ["DATABASE_URL", "DIRECT_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "SUPABASE_POOLER_HOST"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
}
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("database URL selection", () => {
  it("prefers our own variables", () => {
    setEnv({ DATABASE_URL: "postgresql://a@h:6543/db", DIRECT_URL: "postgresql://a@h:5432/db", POSTGRES_PRISMA_URL: "postgresql://x@y/z" });
    expect(runtimeDatabaseUrl()).toBe("postgresql://a@h:6543/db");
    expect(migrationDatabaseUrl()).toBe("postgresql://a@h:5432/db");
  });

  it("falls back to the Supabase integration's variables", () => {
    setEnv({ POSTGRES_PRISMA_URL: "postgresql://u:p@pooler:6543/postgres?pgbouncer=true", POSTGRES_URL_NON_POOLING: "postgresql://u:p@pooler:5432/postgres" });
    expect(runtimeDatabaseUrl()).toContain("pooler:6543");
    expect(migrationDatabaseUrl()).toContain("pooler:5432");
  });

  it("keeps TLS on but uses libpq semantics for sslmode=require", () => {
    setEnv({ POSTGRES_URL: "postgresql://u:p@pooler:6543/postgres?sslmode=require" });
    const u = new URL(runtimeDatabaseUrl()!);
    expect(u.searchParams.get("sslmode")).toBe("require");
    expect(u.searchParams.get("uselibpqcompat")).toBe("true");
  });

  it("rewrites Supabase's IPv6-only direct host to the project's pooler", () => {
    setEnv({ DATABASE_URL: "postgresql://postgres:s%40cret@db.abcref.supabase.co:5432/postgres", SUPABASE_POOLER_HOST: "aws-0-ap-northeast-1.pooler.supabase.com" });
    const rt = new URL(runtimeDatabaseUrl()!);
    expect(rt.hostname).toBe("aws-0-ap-northeast-1.pooler.supabase.com");
    expect(rt.port).toBe("6543");
    expect(decodeURIComponent(rt.username)).toBe("postgres.abcref");
    expect(decodeURIComponent(rt.password)).toBe("s@cret");
    expect(rt.searchParams.get("sslmode")).toBe("require");
    const mg = new URL(migrationDatabaseUrl()!);
    expect(mg.port).toBe("5432");
    expect(mg.hostname).toBe("aws-0-ap-northeast-1.pooler.supabase.com");
  });

  it("leaves other hosts alone, and does nothing without SUPABASE_POOLER_HOST", () => {
    setEnv({ DATABASE_URL: "postgresql://u:p@db.abcref.supabase.co:5432/postgres" });
    expect(runtimeDatabaseUrl()).toBe("postgresql://u:p@db.abcref.supabase.co:5432/postgres");
    setEnv({ DATABASE_URL: "postgresql://u:p@localhost:5432/app", SUPABASE_POOLER_HOST: "pooler.example" });
    expect(runtimeDatabaseUrl()).toBe("postgresql://u:p@localhost:5432/app");
  });
});
