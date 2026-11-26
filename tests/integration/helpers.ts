import { prisma } from "@/server/db";
import { seedWorkspace } from "@/server/seed/seeder";
import { SEED_VERSION } from "@/server/seed/fixtures";
import type { RequestContext } from "@/server/context";

export async function newWorkspace() {
  const ws = await prisma.demoWorkspace.create({ data: { kind: "DEMO", seedVersion: SEED_VERSION, expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.$transaction((tx) => seedWorkspace(tx, ws.id), { timeout: 60_000 });
  return ws.id;
}

export async function ctxFor(workspaceId: string, handle: string): Promise<RequestContext> {
  const u = await prisma.user.findUniqueOrThrow({ where: { workspaceId_handleLower: { workspaceId, handleLower: handle.toLowerCase() } } });
  return {
    mode: "demo",
    actor: { id: u.id, handle: u.handle },
    workspace: { id: workspaceId, kind: "DEMO", createdAt: new Date(), expiresAt: null },
    capabilities: { switchActor: true, resetWorkspace: true },
  };
}

export async function postId(workspaceId: string, textStart: string) {
  const p = await prisma.post.findFirstOrThrow({ where: { workspaceId, text: { startsWith: textStart } } });
  return p.id;
}

export function key() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === code) return;
    throw new Error(`expected ${code}, got ${c ?? String(e)}`);
  }
  throw new Error(`expected ${code}, but it succeeded`);
}
