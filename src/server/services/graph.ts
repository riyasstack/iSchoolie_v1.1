import type { Db } from "../db";
import type { RequestContext } from "../context";
import type { ViewerGraph } from "../policy";
import type { UserDTO, RelationshipDTO } from "@/lib/types";

/** Loads the viewer's social graph once per request. Bounded by workspace size in demo mode. */
export async function loadViewerGraph(db: Db, ctx: RequestContext): Promise<ViewerGraph> {
  const ws = ctx.workspace.id;
  const me = ctx.actor.id;
  const now = new Date();
  const [following, followers, blocking, blockedBy, muting, requested, words, topics] = await Promise.all([
    db.follow.findMany({ where: { workspaceId: ws, followerId: me }, select: { followeeId: true } }),
    db.follow.findMany({ where: { workspaceId: ws, followeeId: me }, select: { followerId: true } }),
    db.block.findMany({ where: { workspaceId: ws, blockerId: me }, select: { blockedId: true } }),
    db.block.findMany({ where: { workspaceId: ws, blockedId: me }, select: { blockerId: true } }),
    db.mute.findMany({ where: { workspaceId: ws, muterId: me }, select: { mutedId: true } }),
    db.followRequest.findMany({ where: { workspaceId: ws, requesterId: me }, select: { targetId: true } }),
    db.mutedWord.findMany({
      where: { workspaceId: ws, userId: me, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { phraseLower: true, inHome: true, inNotifications: true },
    }),
    db.topicFollow.findMany({ where: { workspaceId: ws, userId: me }, select: { topicId: true } }),
  ]);
  return {
    id: me,
    following: new Set(following.map((f) => f.followeeId)),
    followers: new Set(followers.map((f) => f.followerId)),
    blocking: new Set(blocking.map((b) => b.blockedId)),
    blockedBy: new Set(blockedBy.map((b) => b.blockerId)),
    muting: new Set(muting.map((m) => m.mutedId)),
    requested: new Set(requested.map((r) => r.targetId)),
    mutedWords: words,
    topicIds: new Set(topics.map((t) => t.topicId)),
  };
}

export const userSelect = {
  id: true,
  handle: true,
  displayName: true,
  avatarMediaId: true,
  isProtected: true,
  demoTeamBadge: true,
  suspended: true,
} as const;

export type UserRow = {
  id: string;
  handle: string;
  displayName: string;
  avatarMediaId: string | null;
  isProtected: boolean;
  demoTeamBadge: boolean;
  suspended: boolean;
};

export function mediaUrl(id: string | null | undefined, variant?: "thumb"): string | null {
  if (!id) return null;
  return `/api/media/${id}${variant ? `?v=${variant}` : ""}`;
}

export function toUserDTO(u: UserRow): UserDTO {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: mediaUrl(u.avatarMediaId),
    isProtected: u.isProtected,
    demoTeamBadge: u.demoTeamBadge,
  };
}

export async function relationshipsFor(db: Db, ctx: RequestContext, g: ViewerGraph, ids: string[]): Promise<Map<string, RelationshipDTO>> {
  const out = new Map<string, RelationshipDTO>();
  if (!ids.length) return out;
  const [notifyRows, incoming] = await Promise.all([
    db.follow.findMany({ where: { workspaceId: ctx.workspace.id, followerId: g.id, followeeId: { in: ids }, notify: true }, select: { followeeId: true } }),
    db.followRequest.findMany({ where: { workspaceId: ctx.workspace.id, targetId: g.id, requesterId: { in: ids } }, select: { requesterId: true } }),
  ]);
  const notify = new Set(notifyRows.map((r) => r.followeeId));
  const inc = new Set(incoming.map((r) => r.requesterId));
  for (const id of ids) {
    out.set(id, {
      following: g.following.has(id),
      followedBy: g.followers.has(id),
      requested: g.requested.has(id),
      incomingRequest: inc.has(id),
      blocking: g.blocking.has(id),
      blockedBy: g.blockedBy.has(id),
      muting: g.muting.has(id),
      notify: notify.has(id),
    });
  }
  return out;
}
