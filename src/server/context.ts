/**
 * Request context resolution — the single seam between "who is asking" and the
 * feature services. Services receive a RequestContext and never read user ids,
 * workspace ids, roles, or ownership from client input.
 *
 * Demo mode: an opaque, HMAC-signed, HttpOnly session cookie maps to a DemoSession
 * row (stored as a SHA-256 hash), which names the workspace and current actor.
 *
 * Live mode: Supabase Auth session cookies (refreshed by the proxy) are verified with
 * `getClaims()` and mapped to a profile in the LIVE workspace (src/server/auth.ts).
 * Without a session the viewer is a read-only guest. See AUTH_INTEGRATION.md.
 */
import { cookies } from "next/headers";
import { prisma } from "./db";
import { env } from "./env";
import { AppError } from "./errors";
import { SESSION_COOKIE, hashToken, verifyCookie } from "@/lib/session-token";
import { supabaseConfigured } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { contextFromClaims, type AuthClaims } from "./auth";

export interface Capabilities {
  /** Demo-only: switch between seeded identities inside this workspace. */
  switchActor: boolean;
  /** Demo-only: reset this workspace's data. */
  resetWorkspace: boolean;
}

export interface RequestContext {
  mode: "demo" | "live";
  actor: { id: string; handle: string };
  workspace: { id: string; kind: "DEMO" | "LIVE"; createdAt: Date; expiresAt: Date | null };
  capabilities: Capabilities;
  /** Demo session hash; present only in demo mode. */
  sessionHash?: string;
  /** Live mode: member (default when absent), signed-in-but-not-onboarded, or read-only guest. */
  viewer?: "member" | "onboarding" | "guest";
  /** Live mode: the verified Supabase identity. */
  auth?: { subject: string; email: string | null; providers: string[]; suggestion?: { displayName: string; handle: string } };
}

export { isMember } from "./viewer";

export const SESSION_TTL_DAYS = 7;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function resolveRequestContext(): Promise<RequestContext> {
  const mode = env.mode;
  if (mode === "live") return resolveLiveContext();
  return resolveDemoContext();
}

/** Same as resolveRequestContext, but returns null instead of throwing for a missing/expired session. */
export async function tryResolveRequestContext(): Promise<RequestContext | null> {
  try {
    return await resolveRequestContext();
  } catch (e) {
    if (e instanceof AppError && (e.code === "SESSION_REQUIRED" || e.code === "SESSION_EXPIRED")) return null;
    throw e;
  }
}

async function resolveDemoContext(): Promise<RequestContext> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const token = await verifyCookie(raw, env.sessionSecret);
  if (!token) throw new AppError("SESSION_REQUIRED", "Start a demo session to continue.");
  const tokenHash = await hashToken(token);
  const session = await prisma.demoSession.findUnique({
    where: { tokenHash },
    include: { workspace: true, actor: { select: { id: true, handle: true, suspended: true } } },
  });
  const now = new Date();
  if (!session || session.expiresAt < now || (session.workspace.expiresAt && session.workspace.expiresAt < now)) {
    throw new AppError("SESSION_EXPIRED", "Your demo session has expired.");
  }
  if (session.workspace.kind !== "DEMO") throw new AppError("FORBIDDEN", "Invalid session.");
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86400_000);
    const wsExpires = new Date(now.getTime() + env.retentionDays * 86400_000);
    await prisma.$transaction([
      prisma.demoSession.update({ where: { tokenHash }, data: { lastSeenAt: now, expiresAt } }),
      prisma.demoWorkspace.update({ where: { id: session.workspaceId }, data: { lastActiveAt: now, expiresAt: wsExpires } }),
    ]);
  }
  return {
    mode: "demo",
    actor: { id: session.actor.id, handle: session.actor.handle },
    workspace: {
      id: session.workspace.id,
      kind: "DEMO",
      createdAt: session.workspace.createdAt,
      expiresAt: session.workspace.expiresAt,
    },
    capabilities: { switchActor: true, resetWorkspace: true },
    sessionHash: tokenHash,
  };
}

/**
 * Live mode: verify the Supabase session and map it to a profile. Never falls back to
 * demo mode; if Supabase isn't configured, private access is refused.
 */
async function resolveLiveContext(): Promise<RequestContext> {
  if (!supabaseConfigured()) {
    throw new AppError("AUTH_NOT_CONFIGURED", "Live mode requires Supabase settings. See AUTH_INTEGRATION.md.");
  }
  const supabase = await supabaseServer();
  // getClaims() verifies the JWT (locally with the project's signing keys when available).
  const { data } = await supabase.auth.getClaims();
  return contextFromClaims((data?.claims as AuthClaims | undefined) ?? null);
}
