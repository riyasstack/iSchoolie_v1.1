/**
 * Live-mode identity (APP_MODE=live): Supabase Auth verifies who the person is; this
 * module maps a verified Supabase user (JWT claims) to an iSchoolie profile in the single
 * LIVE workspace — the shared network.
 *
 * Viewers:
 *  - member:     signed in and onboarded (has a profile)
 *  - onboarding: signed in with Supabase but hasn't picked a username yet
 *  - guest:      not signed in — read-only browsing of public content
 *
 * Guests and onboarding viewers never write: the API router refuses every mutation and
 * every private read for them (see `guest` flags in api-routes.ts).
 */
import { prisma } from "./db";
import { AppError, invalid } from "./errors";
import { rateLimit } from "./ratelimit";
import type { RequestContext } from "./context";
import { graphemeLength, validateHandle, NAME_MAX } from "@/lib/text";

export const GUEST_ACTOR_ID = "guest";
export const AUTH_PROVIDER = "supabase";

export interface AuthClaims {
  sub: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string; user_name?: string; preferred_username?: string; avatar_url?: string };
  app_metadata?: { provider?: string; providers?: string[] };
}

let cachedLive: { id: string; createdAt: Date } | null = null;

/** The single LIVE workspace (created on first use). */
export async function liveWorkspace(): Promise<{ id: string; createdAt: Date }> {
  if (cachedLive) return cachedLive;
  const existing = await prisma.demoWorkspace.findFirst({ where: { kind: "LIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true } });
  cachedLive = existing ?? (await prisma.demoWorkspace.create({ data: { kind: "LIVE", seedVersion: 0, expiresAt: null }, select: { id: true, createdAt: true } }));
  return cachedLive;
}

function base(ws: { id: string; createdAt: Date }) {
  return {
    mode: "live" as const,
    workspace: { id: ws.id, kind: "LIVE" as const, createdAt: ws.createdAt, expiresAt: null },
    capabilities: { switchActor: false, resetWorkspace: false },
  };
}

export async function contextFromClaims(claims: AuthClaims | null): Promise<RequestContext> {
  const ws = await liveWorkspace();
  if (!claims?.sub) return { ...base(ws), viewer: "guest", actor: { id: GUEST_ACTOR_ID, handle: "" } };
  const identity = await prisma.authIdentity.findUnique({
    where: { provider_subject: { provider: AUTH_PROVIDER, subject: claims.sub } },
    include: { user: { select: { id: true, handle: true, suspended: true, workspaceId: true } } },
  });
  const auth = { subject: claims.sub, email: claims.email ?? null, providers: claims.app_metadata?.providers ?? (claims.app_metadata?.provider ? [claims.app_metadata.provider] : []) };
  if (!identity || identity.user.workspaceId !== ws.id) {
    return { ...base(ws), viewer: "onboarding", actor: { id: GUEST_ACTOR_ID, handle: "" }, auth: { ...auth, suggestion: suggestionsFromClaims(claims) } };
  }
  if (identity.user.suspended) throw new AppError("FORBIDDEN", "This account is suspended.");
  return { ...base(ws), viewer: "member", actor: { id: identity.user.id, handle: identity.user.handle }, auth };
}

/** Suggested display name and handle from the identity provider's profile. */
export function suggestionsFromClaims(claims: AuthClaims) {
  const m = claims.user_metadata ?? {};
  const name = (m.full_name ?? m.name ?? m.user_name ?? claims.email?.split("@")[0] ?? "").trim().slice(0, NAME_MAX);
  const raw = (m.user_name ?? m.preferred_username ?? claims.email?.split("@")[0] ?? name).toLowerCase();
  const handle = raw.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 15);
  return { displayName: name, handle: handle.length >= 4 ? handle : "" };
}

/** Creates the member profile for a verified Supabase user (once). */
export async function createMemberProfile(claims: AuthClaims, input: { handle: string; displayName: string }) {
  const ws = await liveWorkspace();
  await rateLimit(`onboard:${claims.sub}`, 20, 3600);
  const handle = input.handle.trim();
  const err = validateHandle(handle);
  if (err) throw invalid(err);
  const displayName = input.displayName.replace(/\s+/g, " ").trim();
  if (graphemeLength(displayName) < 1 || graphemeLength(displayName) > NAME_MAX) throw invalid(`Name must be 1–${NAME_MAX} characters.`);
  const existing = await prisma.authIdentity.findUnique({ where: { provider_subject: { provider: AUTH_PROVIDER, subject: claims.sub } } });
  if (existing) throw new AppError("CONFLICT", "This account already has a profile.");
  const taken = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ws.id, handleLower: handle.toLowerCase() } } });
  if (taken) throw new AppError("CONFLICT", "That username has been taken. Please choose another.");
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { workspaceId: ws.id, handle, handleLower: handle.toLowerCase(), displayName, isSeedActor: false },
      });
      await tx.preferences.create({ data: { userId: user.id, workspaceId: ws.id } });
      await tx.authIdentity.create({ data: { provider: AUTH_PROVIDER, subject: claims.sub, userId: user.id, email: claims.email ?? null } });
      return { handle: user.handle };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("CONFLICT", "That username has been taken. Please choose another.");
    throw e;
  }
}

/** Server-side check that a handle is available (onboarding form). */
export async function handleAvailable(handle: string) {
  const err = validateHandle(handle);
  if (err) return { available: false, reason: err };
  const ws = await liveWorkspace();
  const taken = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ws.id, handleLower: handle.toLowerCase() } } });
  return taken ? { available: false, reason: "That username has been taken." } : { available: true, reason: null };
}
