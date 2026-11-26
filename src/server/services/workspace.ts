/**
 * Demo workspace lifecycle: provisioning (rate limited), actor switching, reset,
 * and expiry cleanup. Only ever touches the caller's own workspace.
 */
import { prisma } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { rateLimit } from "../ratelimit";
import { seedWorkspace } from "../seed/seeder";
import { SEED_VERSION } from "../seed/fixtures";
import { hashToken, newToken, signToken } from "@/lib/session-token";
import { SESSION_TTL_DAYS } from "../context";
import { storage } from "../storage";
import { log } from "../log";

export async function provisionDemoSession(clientKey: string): Promise<{ cookieValue: string; expiresAt: Date }> {
  if (env.mode !== "demo") throw new AppError("AUTH_NOT_CONFIGURED", "Demo sessions are disabled in live mode.");
  await rateLimit(`provision:${clientKey}`, env.provisionLimitPerHour, 3600, "Too many new demo sessions from this network. Try again later.");
  await rateLimit("provision:global", 2000, 3600, "The demo is busy. Try again in a few minutes.");
  const now = new Date();
  const token = newToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86400_000);
  await prisma.$transaction(
    async (tx) => {
      const ws = await tx.demoWorkspace.create({
        data: { kind: "DEMO", seedVersion: SEED_VERSION, expiresAt: new Date(now.getTime() + env.retentionDays * 86400_000) },
      });
      const { defaultActorId } = await seedWorkspace(tx, ws.id, now);
      await tx.demoSession.create({ data: { tokenHash, workspaceId: ws.id, actorId: defaultActorId, expiresAt } });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  log("info", "demo_workspace_provisioned", { ms: Date.now() - now.getTime() });
  return { cookieValue: await signToken(token, env.sessionSecret), expiresAt };
}

export async function switchActor(sessionHash: string, workspaceId: string, handle: string) {
  const user = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId, handleLower: handle.toLowerCase() } } });
  if (!user || !user.isSeedActor) throw new AppError("NOT_FOUND", "That demo identity doesn’t exist in this workspace.");
  if (user.suspended) throw new AppError("FORBIDDEN", "Suspended fixtures can’t be used as the current actor.");
  await prisma.demoSession.update({ where: { tokenHash: sessionHash }, data: { actorId: user.id } });
  return { handle: user.handle };
}

/** Replaces the current workspace with a freshly seeded one; the old one is deleted. */
export async function resetWorkspace(sessionHash: string, workspaceId: string) {
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      const ws = await tx.demoWorkspace.create({
        data: { kind: "DEMO", seedVersion: SEED_VERSION, expiresAt: new Date(now.getTime() + env.retentionDays * 86400_000) },
      });
      const { defaultActorId } = await seedWorkspace(tx, ws.id, now);
      await tx.demoSession.update({ where: { tokenHash: sessionHash }, data: { workspaceId: ws.id, actorId: defaultActorId } });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  await deleteWorkspace(workspaceId);
}

export async function deleteWorkspace(workspaceId: string) {
  const ws = await prisma.demoWorkspace.findUnique({ where: { id: workspaceId }, select: { kind: true } });
  if (!ws || ws.kind !== "DEMO") return; // never deletes live data
  const scheduled = await prisma.scheduledPost.findMany({ where: { workspaceId }, select: { id: true } });
  await prisma.$transaction([
    prisma.job.deleteMany({ where: { OR: scheduled.map((s) => ({ uniqueKey: { startsWith: `publish:${s.id}:` } })) } }),
    prisma.demoWorkspace.delete({ where: { id: workspaceId } }),
  ]);
  await storage().deletePrefix(`ws/${workspaceId}`);
}

export async function cleanupExpiredWorkspaces(limit = 20): Promise<number> {
  const expired = await prisma.demoWorkspace.findMany({
    where: { kind: "DEMO", expiresAt: { lt: new Date() } },
    select: { id: true },
    take: limit,
  });
  for (const w of expired) await deleteWorkspace(w.id);
  await prisma.demoSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 2 * 86400_000) } } });
  return expired.length;
}
