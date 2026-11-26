import type { Db } from "../db";
import { prisma } from "../db";
import type { RequestContext } from "../context";
import { filteredFromNotifications, type ViewerGraph } from "../policy";
import { loadViewerGraph, toUserDTO, userSelect } from "./graph";
import { serializePosts } from "./serialize";
import { dedupeKeys } from "./notify-keys";
import type { NotificationGroupDTO, NotificationKind } from "@/lib/types";

export { dedupeKeys };

type PrefKey = "notifyLikes" | "notifyReposts" | "notifyReplies" | "notifyMentions" | "notifyFollows" | "notifyQuotes";
const PREF_FOR: Partial<Record<NotificationKind, PrefKey>> = {
  LIKE: "notifyLikes",
  REPOST: "notifyReposts",
  REPLY: "notifyReplies",
  MENTION: "notifyMentions",
  FOLLOW: "notifyFollows",
  QUOTE: "notifyQuotes",
};

/**
 * Records an in-app notification. Respects the recipient's per-type preference at
 * generation time, never notifies across a block, and is idempotent via dedupeKey.
 */
export async function notify(
  db: Db,
  ws: string,
  n: { recipientId: string; actorId: string; type: NotificationKind; postId?: string | null; dedupeKey: string },
) {
  if (n.recipientId === n.actorId) return;
  const [prefs, block] = await Promise.all([
    db.preferences.findUnique({ where: { userId: n.recipientId } }),
    db.block.findFirst({
      where: { workspaceId: ws, OR: [{ blockerId: n.recipientId, blockedId: n.actorId }, { blockerId: n.actorId, blockedId: n.recipientId }] },
      select: { blockerId: true },
    }),
  ]);
  if (block) return;
  const pref = PREF_FOR[n.type];
  if (pref && prefs && prefs[pref] === false) return;
  await db.notification.createMany({
    data: [{ workspaceId: ws, recipientId: n.recipientId, actorId: n.actorId, type: n.type, postId: n.postId ?? null, dedupeKey: n.dedupeKey }],
    skipDuplicates: true,
  });
}

export async function retractNotification(db: Db, ws: string, dedupeKey: string) {
  await db.notification.deleteMany({ where: { workspaceId: ws, dedupeKey } });
}

const GROUPABLE = new Set<NotificationKind>(["LIKE", "REPOST", "FOLLOW"]);

async function visibleRows(ctx: RequestContext, g: ViewerGraph, where: { mentions?: boolean; before?: Date; take: number; unreadOnly?: boolean }) {
  const ws = ctx.workspace.id;
  const prefs = await prisma.preferences.findUnique({ where: { userId: ctx.actor.id } });
  const rows = await prisma.notification.findMany({
    where: {
      workspaceId: ws,
      recipientId: ctx.actor.id,
      ...(where.mentions ? { type: { in: ["MENTION", "REPLY"] } } : {}),
      ...(where.before ? { createdAt: { lt: where.before } } : {}),
      ...(where.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: where.take,
    include: {
      actor: { select: { ...userSelect } },
      post: { select: { textLower: true, deletedAt: true, authorId: true } },
    },
  });
  return {
    fetched: rows.length,
    last: rows.at(-1)?.createdAt ?? null,
    rows: rows.filter((r) => {
      if (r.actor.suspended) return false;
      if (filteredFromNotifications(g, r.actorId, r.post?.textLower ?? null)) return false;
      if (prefs?.filterNotFollowing && !g.following.has(r.actorId)) return false;
      if (prefs?.filterNoAvatar && !r.actor.avatarMediaId) return false;
      return true;
    }),
  };
}

export async function listNotifications(ctx: RequestContext, opts: { tab: "all" | "mentions"; cursor?: string | null }) {
  const g = await loadViewerGraph(prisma, ctx);
  const before = opts.cursor ? new Date(opts.cursor) : undefined;
  const PAGE = 60;
  const { rows, fetched, last } = await visibleRows(ctx, g, { mentions: opts.tab === "mentions", before, take: PAGE });
  // Group likes/reposts by post and follows by day, preserving recency order.
  const groups: NotificationGroupDTO[] = [];
  const index = new Map<string, NotificationGroupDTO>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const gk = GROUPABLE.has(r.type) ? `${r.type}:${r.postId ?? day}` : `${r.type}:${r.id}`;
    let grp = index.get(gk);
    if (!grp) {
      grp = { key: gk, type: r.type, actors: [], actorCount: 0, postId: r.postId, post: null, createdAt: r.createdAt.toISOString(), unread: false, ids: [] };
      index.set(gk, grp);
      groups.push(grp);
    }
    grp.ids.push(r.id);
    if (!r.readAt) grp.unread = true;
    if (!grp.actors.some((a) => a.id === r.actorId)) {
      grp.actorCount++;
      if (grp.actors.length < 8) grp.actors.push(toUserDTO(r.actor));
    }
  }
  const postIds = groups.map((x) => x.postId).filter((x): x is string => !!x);
  const posts = await serializePosts(prisma, ctx, g, postIds);
  for (const grp of groups) if (grp.postId) grp.post = posts.get(grp.postId) ?? { id: grp.postId, unavailable: "not_found" };
  return { items: groups, nextCursor: fetched === PAGE && last ? last.toISOString() : null };
}

export async function unreadNotificationCount(ctx: RequestContext, g?: ViewerGraph) {
  const graph = g ?? (await loadViewerGraph(prisma, ctx));
  const { rows } = await visibleRows(ctx, graph, { take: 100, unreadOnly: true });
  return rows.length;
}

export async function markNotificationsRead(ctx: RequestContext, upTo?: string) {
  await prisma.notification.updateMany({
    where: { workspaceId: ctx.workspace.id, recipientId: ctx.actor.id, readAt: null, ...(upTo ? { createdAt: { lte: new Date(upTo) } } : {}) },
    data: { readAt: new Date() },
  });
}
